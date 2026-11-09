import AppKit
import UniformTypeIdentifiers
import WebKit

@MainActor
final class EditorViewController: NSViewController, EditorBridgeDelegate,
  NSUserInterfaceValidations, WKNavigationDelegate, WKUIDelegate
{
  weak var document: InkoraDocument?

  private let resourceBundle: Bundle
  private let requestTimeout: Duration
  private let diagnostics: BridgeDiagnostics
  private var bridge: EditorBridge?
  private var resourceSchemeHandler: EditorResourceSchemeHandler?
  private let assetBroker = DocumentAssetBroker()
  private var assetSchemeHandler: DocumentAssetSchemeHandler?
  private var documentEpoch = UUID()
  private var webView: WKWebView?
  private var editorState: BridgeEditorState?
  private var diagnosticRevision: String?
  private var automaticRecoveryAttempts = 0
  private let maximumAutomaticRecoveryAttempts = 1

  init(
    document: InkoraDocument,
    resourceBundle: Bundle = .main,
    requestTimeout: Duration = .seconds(5),
    diagnostics: BridgeDiagnostics = BridgeDiagnostics()
  ) {
    self.document = document
    self.resourceBundle = resourceBundle
    self.requestTimeout = requestTimeout
    self.diagnostics = diagnostics
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  override func loadView() {
    // ENC-002: an undecodable document never reaches the web editor; the
    // window shows the reason instead. There is no editable surface and no
    // decoded text, so no mojibake can appear or be saved.
    if let encodingError = document?.encodingError {
      presentEncodingError(encodingError)
      return
    }
    guard let resourceSchemeHandler = EditorResourceSchemeHandler(bundle: resourceBundle) else {
      presentResourceError(message: "The editor resources are missing.")
      return
    }

    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .nonPersistent()
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.mediaTypesRequiringUserActionForPlayback = .all
    configuration.setURLSchemeHandler(
      resourceSchemeHandler,
      forURLScheme: EditorResourceSchemeHandler.scheme
    )
    let assetSchemeHandler = DocumentAssetSchemeHandler(broker: assetBroker)
    configuration.setURLSchemeHandler(
      assetSchemeHandler,
      forURLScheme: DocumentAssetSchemeHandler.scheme
    )

    let bridge = EditorBridge(
      delegate: self,
      requestTimeout: requestTimeout,
      diagnostics: diagnostics
    )
    configuration.userContentController.add(bridge, name: "inkora")

    let webView = InkoraWebView(frame: .zero, configuration: configuration)
    webView.imageFileHandler = { [weak self] url in self?.beginImageImport(fileURL: url) }
    webView.bitmapPNGHandler = { [weak self] data in self?.beginPastedImageImport(data) }
    webView.setAccessibilityIdentifier("MarkdownEditor")
    webView.setAccessibilityLabel("Markdown document content")
    webView.navigationDelegate = self
    webView.uiDelegate = self
    bridge.attach(webView: webView)
    if let document {
      documentEpoch = assetBroker.beginDocument(documentID: document.bridgeDocumentID)
      bridge.loadDocument(
        documentID: document.bridgeDocumentID,
        revision: document.bridgeRevision,
        text: document.text
      )
    }

    self.bridge = bridge
    self.resourceSchemeHandler = resourceSchemeHandler
    self.assetSchemeHandler = assetSchemeHandler
    self.webView = webView
    presentEditor(webView)

    document?.configureImageSavePreparer { [weak self] targetURL, completion in
      self?.prepareImagesForSave(to: targetURL, completion: completion)
        ?? completion(.failure(EditorBridgeError.editorUnavailable))
    }

    loadEditor(into: webView)
  }

  func requestText(completion: @escaping (Result<String, Error>) -> Void) {
    guard let bridge else {
      completion(.failure(EditorBridgeError.editorUnavailable))
      return
    }
    bridge.requestSnapshot(completion: completion)
  }

  func requestSnapshot(completion: @escaping (Result<BridgeSnapshot, Error>) -> Void) {
    guard let bridge else {
      completion(.failure(EditorBridgeError.editorUnavailable))
      return
    }
    // Resigning the native first responder commits the real macOS IME before
    // the Web runtime drains compositionend and captures its revision.
    let restoreFocus = view.window?.firstResponder?.isKind(of: NSView.self) == true
    view.window?.makeFirstResponder(nil)
    bridge.requestVersionedSnapshot { [weak self] result in
      if restoreFocus, let self, self.view.window?.attachedSheet == nil {
        self.view.window?.makeFirstResponder(self.webView)
      }
      completion(result)
    }
  }

  func requestRecoverySnapshot(completion: @escaping (Result<BridgeSnapshot, Error>) -> Void) {
    guard let bridge else { return }
    bridge.requestVersionedSnapshot(completion: completion)
  }

  func reloadDocument() {
    guard let document else { return }
    editorState = nil
    if let encodingError = document.encodingError {
      presentEncodingError(encodingError)
      NSApplication.shared.mainMenu?.update()
      return
    }
    bridge?.loadDocument(
      documentID: document.bridgeDocumentID, revision: document.bridgeRevision, text: document.text)
    documentEpoch = assetBroker.beginDocument(documentID: document.bridgeDocumentID)
    if let webView { presentEditor(webView) }
    NSApplication.shared.mainMenu?.update()
  }

  func confirmSaved(_ snapshot: BridgeSnapshot) {
    bridge?.confirmSaved(snapshot)
    refreshImageDescriptors()
  }

  func canPerformEditorCommand(_ command: BridgeEditorCommand) -> Bool {
    guard let editorState else { return false }
    switch command {
    case .undo:
      return editorState.canUndo
    case .redo:
      return editorState.canRedo
    }
  }

  func performEditorCommand(_ command: BridgeEditorCommand) {
    guard canPerformEditorCommand(command) else { return }
    bridge?.executeEditorCommand(command)
  }

  @objc
  func inkoraUndo(_ sender: Any?) {
    performEditorCommand(.undo)
  }

  @objc
  func inkoraRedo(_ sender: Any?) {
    performEditorCommand(.redo)
  }

  func validateUserInterfaceItem(_ item: NSValidatedUserInterfaceItem) -> Bool {
    switch item.action {
    case #selector(inkoraUndo(_:)):
      canPerformEditorCommand(.undo)
    case #selector(inkoraRedo(_:)):
      canPerformEditorCommand(.redo)
    default:
      true
    }
  }

  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {
    automaticRecoveryAttempts = 0
    refreshImageDescriptors()
  }

  func editorBridge(_ bridge: EditorBridge, didReceiveRecoverableError error: Error) {
    if let bridgeError = error as? EditorBridgeError,
      case .remote(.commandRejected, .notify, _) = bridgeError
    {
      // A rejected history command must not steal focus from an active IME session.
      NSSound.beep()
      return
    }
    guard let window = view.window else { return }
    NSAlert(error: error).beginSheetModal(for: window)
  }

  func editorBridge(_ bridge: EditorBridge, didBecomeUnavailable error: Error) {
    editorState = nil
    NSApplication.shared.mainMenu?.update()
    presentResourceError(message: error.localizedDescription)
  }

  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState) {
    editorState = state
    captureTestSnapshot(state, bridge: bridge)
    document?.editorDidChangeState(state)
    NSApplication.shared.mainMenu?.update()
  }

  func editorBridge(_ bridge: EditorBridge, didRequestImageAccess href: String) {
    guard let documentURL = document?.fileURL else { return }
    requestDirectoryAuthorization(
      for: documentURL, role: "document-read-directory", access: .readOnly
    ) { [weak self] directory in
      guard let self, let directory else { return }
      let accessed = directory.startAccessingSecurityScopedResource()
      defer { if accessed { directory.stopAccessingSecurityScopedResource() } }
      bridge.setImageDescriptors(
        documentEpoch: self.documentEpoch,
        descriptors: [
          self.existingImageDescriptor(
            href: href, documentURL: documentURL, authorizedDirectory: directory)
        ])
    }
  }

  // Explicitly enabled only in the isolated UI application; no production I/O.
  private func captureTestSnapshot(_ state: BridgeEditorState, bridge: EditorBridge) {
    guard Bundle.main.bundleIdentifier == "com.huruizhi.Inkora.UITesting",
      let path = ProcessInfo.processInfo.environment["INKORA_MARKDOWN_SNAPSHOT_SOURCE"]
    else { return }
    let identity = "\(state.documentID):\(state.revision)"
    guard diagnosticRevision != identity else { return }
    diagnosticRevision = identity
    bridge.requestVersionedSnapshot { result in
      guard case .success(let snapshot) = result else { return }
      do {
        let url = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(
          at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(snapshot.text.utf8).write(to: url, options: .atomic)
      } catch {
        NSLog("INK-024 diagnostic snapshot failed: %@", error.localizedDescription)
      }
    }
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction
  ) async -> WKNavigationActionPolicy {
    guard let url = navigationAction.request.url else {
      return .cancel
    }

    return EditorNavigationPolicy.allows(url) ? .allow : .cancel
  }

  func webView(
    _ webView: WKWebView,
    didStartProvisionalNavigation navigation: WKNavigation!
  ) {
    bridge?.prepareForNavigation()
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    bridge?.becomeUnavailable(error)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    document?.preserveDirtyForEditorRecovery()
    bridge?.webContentProcessDidTerminate()
    if automaticRecoveryAttempts < maximumAutomaticRecoveryAttempts {
      automaticRecoveryAttempts += 1
      recoverEditor()
    }
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    bridge?.becomeUnavailable(error)
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    nil
  }

  private func loadEditor(into webView: WKWebView) {
    guard let indexURL = URL(string: "\(EditorResourceSchemeHandler.scheme)://app/index.html")
    else {
      presentResourceError(message: "The editor URL is invalid.")
      return
    }
    webView.load(URLRequest(url: indexURL))
  }

  @objc
  func recoverEditor() {
    guard let bridge, let webView else {
      presentResourceError(message: EditorBridgeError.editorUnavailable.localizedDescription)
      return
    }
    bridge.prepareForRecovery()
    presentEditor(webView)
    loadEditor(into: webView)
  }

  @objc
  func convertBareCRToLF(_ sender: Any?) {
    document?.convertBareCRToLF()
  }

  private func presentEditor(_ webView: WKWebView) {
    webView.removeFromSuperview()
    guard document?.isBareCRReadOnly == true else {
      if webView.subviews.first(where: {
        $0.accessibilityIdentifier() == "InsertLocalImage"
      }) == nil {
        let insert = NSButton(
          title: "插入图片…", target: self, action: #selector(chooseImage(_:)))
        insert.setAccessibilityIdentifier("InsertLocalImage")
        insert.translatesAutoresizingMaskIntoConstraints = false
        webView.addSubview(insert)
        NSLayoutConstraint.activate([
          insert.topAnchor.constraint(equalTo: webView.topAnchor, constant: 6),
          insert.trailingAnchor.constraint(equalTo: webView.trailingAnchor, constant: -10),
        ])
      }
      view = webView
      return
    }
    let message = NSTextField(
      wrappingLabelWithString:
        "含 bare CR 换行，整篇只读。转换会统一为 LF 且不可撤销；保存前原文件不变。")
    message.setAccessibilityIdentifier("BareCRExplanation")
    let button = NSButton(
      title: "转换为 LF 并编辑", target: self,
      action: #selector(convertBareCRToLF(_:)))
    button.keyEquivalent = "l"
    button.keyEquivalentModifierMask = [.command, .option]
    button.setAccessibilityIdentifier("ConvertBareCRToLF")
    button.setAccessibilityHelp("Command-Option-L。转换不可撤销，不会自动保存。")
    let stack = NSStackView(views: [message, button, webView])
    stack.orientation = .vertical
    stack.alignment = .width
    stack.spacing = 8
    view = stack
  }

  private func presentResourceError(message: String) {
    let recoveryView = EditorRecoveryView(
      message: message,
      target: self,
      action: #selector(recoverEditor)
    )
    view = recoveryView
  }

  private func presentEncodingError(_ error: InkoraDocumentError) {
    view = EditorEncodingErrorView(error: error)
  }

  @objc
  private func chooseImage(_ sender: Any?) {
    guard let window = view.window, window.attachedSheet == nil else { return }
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]
    panel.allowsMultipleSelection = false
    panel.canChooseDirectories = false
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url else { return }
      self?.beginImageImport(fileURL: url)
    }
  }

  private func beginImageImport(fileURL: URL) {
    withAuthorizedDocumentDirectory { [weak self] directory in
      guard let self, let document else { return }
      do {
        let asset = try document.importLocalImage(
          fileURL: fileURL, authorizedDirectory: directory)
        presentImportedImage(asset)
      } catch { presentImageError(error) }
    }
  }

  private func beginPastedImageImport(_ data: Data) {
    withAuthorizedDocumentDirectory { [weak self] directory in
      guard let self, let document else { return }
      do {
        let asset = try document.importPastedPNG(data, authorizedDirectory: directory)
        presentImportedImage(asset)
      } catch { presentImageError(error) }
    }
  }

  private func withAuthorizedDocumentDirectory(
    completion: @escaping (URL?) -> Void
  ) {
    guard let document, let documentURL = document.fileURL else {
      completion(nil)
      return
    }
    if let restored = restoredDirectory(role: "document-directory", for: documentURL) {
      completion(restored)
      return
    }
    requestDirectoryAuthorization(
      for: documentURL, role: "document-directory", access: .readWrite,
      completion: completion)
  }

  private func requestDirectoryAuthorization(
    for documentURL: URL,
    role: String,
    access: AssetDirectoryAccess,
    completion: @escaping (URL?) -> Void
  ) {
    guard let window = view.window, window.attachedSheet == nil else {
      completion(nil)
      return
    }
    let panel = NSOpenPanel()
    panel.message =
      access == .readWrite
      ? "请选择 Markdown 所在目录，以写入旁置 .assets 文件夹。"
      : "请选择包含 Markdown 与相对图片的目录；原引用不会改变。"
    panel.prompt = "授权此目录"
    panel.directoryURL = documentURL.deletingLastPathComponent()
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url else {
        completion(nil)
        return
      }
      do {
        try self?.document?.rememberImageDirectory(
          url, for: documentURL, role: role, access: access)
        completion(url)
      } catch {
        if let self { self.presentImageError(error) }
        completion(nil)
      }
    }
  }

  private func restoredDirectory(role: String, for documentURL: URL) -> URL? {
    guard let document,
      let directory = document.restoredImageDirectory(role: role, for: documentURL)
    else {
      return nil
    }
    let parent = documentURL.deletingLastPathComponent().standardizedFileURL
    let grant = directory.standardizedFileURL
    guard parent.path == grant.path || parent.path.hasPrefix(grant.path + "/") else {
      return nil
    }
    return directory
  }

  private func presentImportedImage(_ asset: LocalImageAsset) {
    do {
      let capability = try register(asset)
      bridge?.applyImageImport(
        documentEpoch: documentEpoch,
        assetID: asset.id,
        uri: asset.markdownURI,
        alt: "",
        title: nil,
        displayURL: capability.url
      ) { [weak self] error in
        if let error {
          self?.presentImageError(error)
        } else {
          try? self?.document?.localImages().markInsertionAccepted(assetID: asset.id)
        }
      }
    } catch { presentImageError(error) }
  }

  private func register(_ asset: LocalImageAsset) throws -> DocumentAssetCapability {
    guard let document else { throw EditorBridgeError.editorUnavailable }
    let root: URL
    let basePath: String
    let relativePath: String
    if asset.state == .draft || asset.state == .awaitingMarkdown {
      root = asset.storageURL.deletingLastPathComponent()
      basePath = ""
      relativePath = Self.percentEncode(asset.storageURL.lastPathComponent)
    } else if let documentURL = document.fileURL {
      root =
        document.restoredImageDirectory(role: "document-directory", for: documentURL)
        ?? document.restoredImageDirectory(role: "document-read-directory", for: documentURL)
        ?? documentURL.deletingLastPathComponent()
      basePath = try Self.relativeEncodedPath(
        from: root, to: documentURL.deletingLastPathComponent())
      relativePath = asset.markdownURI
    } else {
      throw LocalImageError.corruptManifest
    }
    return try assetBroker.register(
      documentID: document.bridgeDocumentID,
      epoch: documentEpoch,
      rootURL: root,
      percentEncodedBasePath: basePath,
      percentEncodedRelativePath: relativePath,
      sha256: asset.sha256,
      mimeType: asset.mimeType)
  }

  private func refreshImageDescriptors() {
    guard let document, let session = try? document.localImages() else { return }
    var descriptors = session.assets.map { asset -> BridgeImageDescriptor in
      do {
        return BridgeImageDescriptor(
          href: asset.markdownURI, status: .ready,
          displayURL: try register(asset).url.absoluteString, message: nil)
      } catch {
        return BridgeImageDescriptor(
          href: asset.markdownURI, status: .error, displayURL: nil,
          message: error.localizedDescription)
      }
    }
    var known = Set(descriptors.map(\.href))
    if let documentURL = document.fileURL,
      let grant =
        document.restoredImageDirectory(role: "document-directory", for: documentURL)
        ?? document.restoredImageDirectory(
          role: "document-read-directory", for: documentURL)
    {
      let accessed = grant.startAccessingSecurityScopedResource()
      defer { if accessed { grant.stopAccessingSecurityScopedResource() } }
      for href in LocalImageMigrationCoordinator.localImageURIs(in: document.text)
      where known.insert(href).inserted {
        descriptors.append(
          existingImageDescriptor(
            href: href, documentURL: documentURL, authorizedDirectory: grant))
      }
    }
    guard !descriptors.isEmpty else { return }
    bridge?.setImageDescriptors(documentEpoch: documentEpoch, descriptors: descriptors) {
      [weak self] error in
      guard error == nil, let self else { return }
      for asset in session.assets where asset.insertion == .pending {
        if document.text.contains(asset.markdownURI) {
          try? session.markInsertionAccepted(assetID: asset.id)
        } else {
          presentImportedImage(asset)
        }
      }
    }
  }

  private func existingImageDescriptor(
    href: String,
    documentURL: URL,
    authorizedDirectory: URL
  ) -> BridgeImageDescriptor {
    guard let document else {
      return BridgeImageDescriptor(
        href: href, status: .error, displayURL: nil,
        message: EditorBridgeError.editorUnavailable.localizedDescription)
    }
    do {
      let imageURL = try LocalImageMigrationCoordinator.resolveExistingImage(
        uri: href, documentURL: documentURL, authorizedDirectory: authorizedDirectory)
      let inspection = try LocalImageSession.inspectExternalFile(imageURL)
      guard
        let relativePath = LocalImageMigrationCoordinator.percentEncodedFilePath(
          forLocalImageURI: href)
      else { throw LocalImageError.unsafePath }
      let basePath = try Self.relativeEncodedPath(
        from: authorizedDirectory, to: documentURL.deletingLastPathComponent())
      let capability = try assetBroker.register(
        documentID: document.bridgeDocumentID, epoch: documentEpoch,
        rootURL: authorizedDirectory, percentEncodedBasePath: basePath,
        percentEncodedRelativePath: relativePath, sha256: inspection.sha256,
        mimeType: inspection.mimeType)
      return BridgeImageDescriptor(
        href: href, status: .ready, displayURL: capability.url.absoluteString,
        message: nil)
    } catch let error as LocalImageError {
      let status: BridgeImageStatus
      switch error {
      case .unauthorizedDirectory: status = .denied
      case .unsupportedFormat: status = .unsupported
      case .invalidSource: status = .missing
      default: status = .error
      }
      return BridgeImageDescriptor(
        href: href, status: status, displayURL: nil,
        message: error.localizedDescription)
    } catch {
      return BridgeImageDescriptor(
        href: href, status: .error, displayURL: nil,
        message: error.localizedDescription)
    }
  }

  private func prepareImagesForSave(
    to targetURL: URL,
    completion: @escaping (Result<DocumentImageSavePreparation?, Error>) -> Void
  ) {
    guard let document, let session = try? document.localImages() else {
      completion(.success(nil))
      return
    }
    let hasDrafts = session.assets.contains {
      ($0.state == .draft || $0.state == .awaitingMarkdown)
        && $0.insertion == .accepted
    }
    let needsMigration =
      document.fileURL.map {
        $0.standardizedFileURL != targetURL.standardizedFileURL
      } ?? false
    guard hasDrafts || needsMigration else {
      completion(.success(nil))
      return
    }
    let receiveTarget: (URL?) -> Void = { [weak self] directory in
      guard let self else { return }
      guard let directory else {
        completion(.failure(CocoaError(.userCancelled)))
        return
      }
      let finish: (URL?) -> Void = { [weak self] sourceDirectory in
        guard let self else { return }
        do {
          let plan = try document.prepareLocalImagesForSave(
            documentURL: targetURL, authorizedDirectory: directory)
          let preparation = DocumentImageSavePreparation(
            managedPlan: plan,
            sourceAuthorizedDirectory: sourceDirectory,
            targetAuthorizedDirectory: directory)
          guard let plan else {
            completion(.success(preparation))
            return
          }
          let assetsByURI = Dictionary(
            uniqueKeysWithValues: session.assets.map { ($0.markdownURI, $0) })
          let rewrites = try plan.rewrites.map { source, target -> BridgeImageRewrite in
            guard let asset = assetsByURI[source] else { throw LocalImageError.corruptManifest }
            return BridgeImageRewrite(
              assetID: asset.id.uuidString.lowercased(), from: source, to: target)
          }
          if rewrites.isEmpty {
            completion(.success(preparation))
            return
          }
          guard let bridge else { throw EditorBridgeError.editorUnavailable }
          bridge.prepareImageSave(documentEpoch: documentEpoch, rewrites: rewrites) { error in
            if let error { completion(.failure(error)) } else { completion(.success(preparation)) }
          }
        } catch { completion(.failure(error)) }
      }
      if needsMigration, let sourceURL = document.fileURL {
        if let restored = restoredDirectory(role: "save-as-source", for: sourceURL) {
          finish(restored)
          return
        }
        requestDirectoryAuthorization(
          for: sourceURL, role: "save-as-source", access: .readOnly
        ) { sourceDirectory in
          guard let sourceDirectory else {
            completion(.failure(CocoaError(.userCancelled)))
            return
          }
          finish(sourceDirectory)
        }
      } else {
        finish(nil)
      }
    }
    if let restored = restoredDirectory(role: "document-directory", for: targetURL) {
      receiveTarget(restored)
    } else {
      requestDirectoryAuthorization(
        for: targetURL, role: "document-directory", access: .readWrite,
        completion: receiveTarget)
    }
  }

  private func presentImageError(_ error: Error) {
    guard let window = view.window else { return }
    NSAlert(error: error).beginSheetModal(for: window)
  }

  private static func percentEncode(_ value: String) -> String {
    value.utf8.map { byte in
      switch byte {
      case 65...90, 97...122, 48...57, 45, 46, 95, 126:
        String(UnicodeScalar(byte))
      default:
        String(format: "%%%02X", byte)
      }
    }.joined()
  }

  private static func relativeEncodedPath(from root: URL, to directory: URL) throws -> String {
    let root = root.standardizedFileURL
    let directory = directory.standardizedFileURL
    guard directory.path == root.path || directory.path.hasPrefix(root.path + "/") else {
      throw LocalImageError.unauthorizedDirectory
    }
    return directory.pathComponents.dropFirst(root.pathComponents.count)
      .map(percentEncode).joined(separator: "/")
  }
}

@MainActor
enum InkoraPastePayload {
  case ordinary
  case file(URL)
  case bitmapPNG(Data)
  case none
}

@MainActor
final class InkoraWebView: WKWebView {
  var imageFileHandler: ((URL) -> Void)?
  var bitmapPNGHandler: ((Data) -> Void)?
  var pastePayloadProvider: @MainActor () -> InkoraPastePayload =
    InkoraWebView.systemPastePayload

  override init(frame: CGRect, configuration: WKWebViewConfiguration) {
    super.init(frame: frame, configuration: configuration)
    registerForDraggedTypes([.fileURL])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
    Self.fileURLs(from: sender.draggingPasteboard).isEmpty ? super.draggingEntered(sender) : .copy
  }

  override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
    let urls = Self.fileURLs(from: sender.draggingPasteboard)
    guard !urls.isEmpty else { return super.performDragOperation(sender) }
    for url in urls { imageFileHandler?(url) }
    return true
  }

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
      event.charactersIgnoringModifiers?.lowercased() == "v"
    else { return super.performKeyEquivalent(with: event) }
    switch pastePayloadProvider() {
    case .ordinary, .none:
      return super.performKeyEquivalent(with: event)
    case .file(let url):
      imageFileHandler?(url)
      return true
    case .bitmapPNG(let png):
      bitmapPNGHandler?(png)
      return true
    }
  }

  private static func fileURLs(from pasteboard: NSPasteboard) -> [URL] {
    (pasteboard.readObjects(
      forClasses: [NSURL.self],
      options: [
        .urlReadingFileURLsOnly: true
      ]) as? [URL]) ?? []
  }

  private static func systemPastePayload() -> InkoraPastePayload {
    let pasteboard = NSPasteboard.general
    if pasteboard.string(forType: .string) != nil { return .ordinary }
    if let url = fileURLs(from: pasteboard).first { return .file(url) }
    if let image = NSImage(pasteboard: pasteboard),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:])
    {
      return .bitmapPNG(png)
    }
    return .none
  }
}

/// Read-only explanation surface for documents opened in the ENC-002
/// encoding-error state: reason, suggestion, and no editing affordances.
@MainActor
final class EditorEncodingErrorView: NSView {
  init(error: InkoraDocumentError) {
    let titleLabel = NSTextField(labelWithString: error.errorDescription ?? "")
    let reasonLabel = NSTextField(labelWithString: error.failureReason ?? "")
    let suggestionLabel = NSTextField(labelWithString: error.recoverySuggestion ?? "")
    super.init(frame: .zero)
    setAccessibilityIdentifier("EncodingError")

    for (label, identifier) in [
      (titleLabel, "EncodingErrorTitle"), (reasonLabel, "EncodingErrorReason"),
      (suggestionLabel, "EncodingErrorSuggestion"),
    ] {
      label.alignment = .center
      label.maximumNumberOfLines = 0
      label.lineBreakMode = .byWordWrapping
      label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
      label.setAccessibilityIdentifier(identifier)
      label.setAccessibilityValue(label.stringValue)
    }

    let stack = NSStackView(views: [titleLabel, reasonLabel, suggestionLabel])
    stack.orientation = .vertical
    stack.alignment = .centerX
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: centerYAnchor),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -24),
      stack.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, constant: -48),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }
}

@MainActor
final class EditorRecoveryView: NSView {
  let messageLabel: NSTextField
  let retryButton: NSButton

  init(message: String, target: AnyObject, action: Selector) {
    messageLabel = NSTextField(
      labelWithString: "Inkora could not load the editor: \(message)"
    )
    retryButton = NSButton(title: "Reload Editor", target: target, action: action)
    super.init(frame: .zero)
    retryButton.setAccessibilityIdentifier("ReloadEditorButton")
    retryButton.setAccessibilityRole(.button)
    setAccessibilityIdentifier("EditorRecovery")

    messageLabel.alignment = .center
    messageLabel.maximumNumberOfLines = 0
    messageLabel.lineBreakMode = .byWordWrapping
    messageLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    messageLabel.setAccessibilityIdentifier("EditorRecoveryMessage")
    messageLabel.setAccessibilityValue(messageLabel.stringValue)

    let stack = NSStackView(views: [messageLabel, retryButton])
    stack.orientation = .vertical
    stack.alignment = .centerX
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: centerYAnchor),
      stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -24),
      messageLabel.widthAnchor.constraint(lessThanOrEqualTo: widthAnchor, constant: -48),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }
}

@MainActor
enum EditorNavigationPolicy {
  static func allows(_ url: URL) -> Bool {
    return url.scheme == EditorResourceSchemeHandler.scheme && url.host == "app"
      && url.user == nil && url.password == nil && url.port == nil
  }
}
