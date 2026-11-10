import AppKit
import UniformTypeIdentifiers
import WebKit

@MainActor
final class EditorViewController: NSViewController, EditorBridgeDelegate,
  NSUserInterfaceValidations, WKNavigationDelegate, WKUIDelegate
{
  private struct PreparedImageDescriptor {
    let descriptor: BridgeImageDescriptor
    let provisionalToken: UUID?
  }

  typealias ImageSaveDirectoryAuthorizer = (
    _ documentURL: URL,
    _ role: String,
    _ access: AssetDirectoryAccess,
    _ completion: @escaping (URL?) -> Void
  ) -> Void

  weak var document: InkoraDocument?

  private let resourceBundle: Bundle
  private let requestTimeout: Duration
  private let diagnostics: BridgeDiagnostics
  private var bridge: EditorBridge?
  private var sidebarBridge: SidebarWorkspaceBridge?
  private var resourceSchemeHandler: EditorResourceSchemeHandler?
  private let assetBroker = DocumentAssetBroker()
  private var assetSchemeHandler: DocumentAssetSchemeHandler?
  private var documentEpoch = UUID()
  private var webView: WKWebView?
  private var editorState: BridgeEditorState?
  private var diagnosticRevision: String?
  private var automaticRecoveryAttempts = 0
  private let maximumAutomaticRecoveryAttempts = 1
  private var pendingImageRecoveryDeferred = false
  private var pendingImageRecoveryInFlight = false
  private let imageSaveDirectoryAuthorizer: ImageSaveDirectoryAuthorizer?

  init(
    document: InkoraDocument,
    resourceBundle: Bundle = .main,
    requestTimeout: Duration = .seconds(5),
    diagnostics: BridgeDiagnostics = BridgeDiagnostics(),
    imageSaveDirectoryAuthorizer: ImageSaveDirectoryAuthorizer? = nil
  ) {
    self.document = document
    self.resourceBundle = resourceBundle
    self.requestTimeout = requestTimeout
    self.diagnostics = diagnostics
    self.imageSaveDirectoryAuthorizer = imageSaveDirectoryAuthorizer
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
    let sidebarBridge = SidebarWorkspaceBridge(
      current: { [weak self] in
        guard let document = self?.document else { return nil }
        return SidebarWorkspaceBridge.Context(
          documentID: document.bridgeDocumentID, revision: document.bridgeRevision)
      },
      chooseFolder: { [weak self] completion in
        guard let self, let window = self.view.window, window.attachedSheet == nil else {
          completion(nil)
          return
        }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "打开文件夹"
        panel.message = "选择用于侧栏浏览和搜索的文件夹。"
        panel.beginSheetModal(for: window) { response in
          completion(response == .OK ? panel.url : nil)
        }
      },
      mayOpen: { [weak self] binding, completion in
        self?.bridge?.requestState { result in
          guard case .success(let state) = result,
            state.documentID == binding.documentID, state.revision == binding.revision,
            state.availableCommands?.contains(.toggleOutline) == true
          else {
            completion(false)
            return
          }
          completion(true)
        }
      },
      openFile: { [weak self] url, access, completion in
        self?.document?.sidebarFolderAccess = access
        NSDocumentController.shared.openDocument(withContentsOf: url, display: false) {
          document, _, error in
          guard let opened = document as? InkoraDocument, error == nil else {
            completion(error ?? SidebarCatalogError.unavailable)
            return
          }
          opened.sidebarFolderAccess = access
          if opened.windowControllers.isEmpty { opened.makeWindowControllers() }
          opened.showWindows()
          completion(nil)
        }
      })
    sidebarBridge.useFolder(document?.sidebarFolderAccess)
    configuration.userContentController.add(sidebarBridge, name: "inkoraSidebar")

    let webView = InkoraWebView(frame: .zero, configuration: configuration)
    webView.imageFileHandler = { [weak self] url in self?.beginImageImport(fileURL: url) }
    webView.bitmapPNGHandler = { [weak self] data in self?.beginPastedImageImport(data) }
    webView.setAccessibilityIdentifier("MarkdownEditor")
    webView.setAccessibilityLabel("Markdown document content")
    webView.navigationDelegate = self
    webView.uiDelegate = self
    bridge.attach(webView: webView)
    sidebarBridge.attach(webView)
    if let document {
      documentEpoch = assetBroker.beginDocument(documentID: document.bridgeDocumentID)
      bridge.loadDocument(
        documentID: document.bridgeDocumentID,
        revision: document.bridgeRevision,
        text: document.text
      )
    }

    self.bridge = bridge
    self.sidebarBridge = sidebarBridge
    self.resourceSchemeHandler = resourceSchemeHandler
    self.assetSchemeHandler = assetSchemeHandler
    self.webView = webView
    presentEditor(webView)

    document?.configureImageSavePreparer { [weak self] targetURL, snapshot, completion in
      self?.prepareImagesForSave(to: targetURL, snapshot: snapshot, completion: completion)
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
    refreshImageDescriptors(using: snapshot)
  }

  func canPerformEditorCommand(_ command: BridgeEditorCommand) -> Bool {
    guard let editorState else { return false }
    if isViewLoaded, view.window?.attachedSheet != nil { return false }
    switch command {
    case .undo: return editorState.canUndo
    case .redo: return editorState.canRedo
    default: return editorState.availableCommands?.contains(command) == true
    }
  }

  func refreshEditorCommands(completion: @escaping () -> Void = {}) {
    bridge?.requestState { _ in completion() }
  }

  func performEditorCommand(_ command: BridgeEditorCommand) {
    if command.isHistory {
      guard canPerformEditorCommand(command) else { return }
      bridge?.executeEditorCommand(command)
      return
    }
    // Cached menu validation is advisory. Revalidate on the same loaded document
    // before opening a panel or sending an action; Web repeats the live guards.
    let epoch = documentEpoch
    bridge?.requestState { [weak self] result in
      guard let self, self.documentEpoch == epoch,
        case .success(let state) = result,
        state.availableCommands?.contains(command) == true,
        self.canPerformEditorCommand(command)
      else { return }
      if command == .insertImage {
        self.chooseImage(nil)
      } else {
        self.bridge?.executeEditorCommand(
          command,
          selectionAnchor: state.selectionAnchor, selectionHead: state.selectionHead)
      }
    }
  }

  @objc func inkoraUndo(_ sender: Any?) { performEditorCommand(.undo) }
  @objc func inkoraRedo(_ sender: Any?) { performEditorCommand(.redo) }

  @objc func inkoraEditorAction(_ sender: NSMenuItem) {
    guard let name = sender.representedObject as? String,
      let command = BridgeEditorCommand(rawValue: name)
    else { return }
    performEditorCommand(command)
  }

  func validateUserInterfaceItem(_ item: NSValidatedUserInterfaceItem) -> Bool {
    switch item.action {
    case #selector(inkoraUndo(_:)): return canPerformEditorCommand(.undo)
    case #selector(inkoraRedo(_:)): return canPerformEditorCommand(.redo)
    case #selector(inkoraEditorAction(_:)):
      guard let menuItem = item as? NSMenuItem,
        let name = menuItem.representedObject as? String,
        let command = BridgeEditorCommand(rawValue: name)
      else { return false }
      if command == .readingWidth760 || command == .readingWidth900 {
        let width = command == .readingWidth760 ? 760 : 900
        menuItem.state = editorState?.readingWidth == width ? .on : .off
      }
      return canPerformEditorCommand(command)
    default: return true
    }
  }

  func editorBridge(
    _ bridge: EditorBridge, didChangeCommands commands: [BridgeEditorCommand], readingWidth: Int
  ) {
    guard let state = editorState else { return }
    editorState = BridgeEditorState(
      documentID: state.documentID, revision: state.revision,
      dirty: state.dirty, canUndo: state.canUndo, canRedo: state.canRedo,
      selectionAnchor: state.selectionAnchor, selectionHead: state.selectionHead,
      availableCommands: commands, readingWidth: readingWidth)
    NSApplication.shared.mainMenu?.update()
  }

  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {
    automaticRecoveryAttempts = 0
    refreshEditorCommands()
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

  func editorBridge(
    _ bridge: EditorBridge,
    didRequestImageAccess href: String,
    ownership: BridgeImageOwnershipProof
  ) {
    guard let documentURL = document?.fileURL else { return }
    let ownershipEpoch = documentEpoch
    requestDirectoryAuthorization(
      for: documentURL, role: "document-read-directory", access: .readOnly
    ) { [weak self] directory in
      guard let self, let directory else { return }
      guard self.documentEpoch == ownershipEpoch else { return }
      self.sendImageDescriptors(ownership: ownership) {
        let accessed = directory.startAccessingSecurityScopedResource()
        defer { if accessed { directory.stopAccessingSecurityScopedResource() } }
        return [
          self.existingImageDescriptor(
            href: href, documentURL: documentURL, authorizedDirectory: directory)
        ]
      }
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
      guard let pending = document?.pendingRecoveredImages, !pending.isEmpty else {
        view = webView
        return
      }
      let recovery = PendingImageRecoveryBannerView(
        count: pending.count,
        collapsed: pendingImageRecoveryDeferred,
        target: self,
        confirmAction: #selector(confirmPendingImageRecovery(_:)),
        laterAction: #selector(deferPendingImageRecovery(_:)))
      let stack = NSStackView(views: [recovery, webView])
      stack.orientation = .vertical
      stack.alignment = .width
      stack.spacing = 0
      view = stack
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

  @objc
  private func confirmPendingImageRecovery(_ sender: Any?) {
    guard !pendingImageRecoveryInFlight,
      let document,
      let asset = document.pendingRecoveredImages.first
    else { return }
    pendingImageRecoveryInFlight = true
    pendingImageRecoveryDeferred = false
    let handoff = PendingImageRecoveryHandoff(
      document: document, expectedDocumentEpoch: documentEpoch)
    handoff.confirm(
      assetID: asset.id,
      captureIntent: { [weak self, weak document] completion in
        guard let self, let document else {
          completion(.failure(EditorBridgeError.editorUnavailable))
          return
        }
        self.captureImportIntent(document: document, completion: completion)
      },
      apply: { [weak self] asset, intent, completion in
        guard let self else {
          completion(EditorBridgeError.editorUnavailable)
          return
        }
        do {
          guard intent.documentEpoch == self.documentEpoch,
            let anchor = intent.selectionAnchor,
            let head = intent.selectionHead
          else { throw EditorBridgeError.staleRevision }
          let capability = try self.register(asset)
          guard let bridge = self.bridge else { throw EditorBridgeError.editorUnavailable }
          bridge.applyImageImport(
            documentEpoch: self.documentEpoch,
            assetID: asset.id,
            uri: asset.markdownURI,
            alt: "",
            title: nil,
            displayURL: capability.url,
            selectionAnchor: anchor,
            selectionHead: head,
            completion: completion)
        } catch {
          completion(error)
        }
      },
      snapshot: { [weak self] completion in
        guard let bridge = self?.bridge else {
          completion(.failure(EditorBridgeError.editorUnavailable))
          return
        }
        bridge.requestVersionedSnapshot(completion: completion)
      },
      completion: { [weak self] error in
        guard let self else { return }
        self.pendingImageRecoveryInFlight = false
        if let error {
          self.presentImageError(error)
        } else if let webView = self.webView {
          self.refreshImageDescriptors()
          self.presentEditor(webView)
        }
      })
  }

  @objc
  private func deferPendingImageRecovery(_ sender: Any?) {
    pendingImageRecoveryDeferred = true
    if let webView { presentEditor(webView) }
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
    let owner = document
    let epoch = documentEpoch
    let revision = document?.bridgeRevision
    let panel = NSOpenPanel()
    panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]
    panel.allowsMultipleSelection = false
    panel.canChooseDirectories = false
    panel.beginSheetModal(for: window) { [weak self] response in
      guard response == .OK, let url = panel.url,
        let self, self.document === owner, self.documentEpoch == epoch,
        self.document?.bridgeRevision == revision
      else { return }
      self.beginImageImport(fileURL: url)
    }
  }

  private func beginImageImport(fileURL: URL) {
    withAuthorizedDocumentDirectory { [weak self] directory in
      guard let self, let document else { return }
      captureImportIntent(document: document) { [weak self, weak document] result in
        guard let self, let document else { return }
        do {
          let asset = try document.importLocalImage(
            fileURL: fileURL, authorizedDirectory: directory, importIntent: result.get())
          presentImportedImage(asset)
        } catch { presentImageError(error) }
      }
    }
  }

  private func beginPastedImageImport(_ data: Data) {
    withAuthorizedDocumentDirectory { [weak self] directory in
      guard let self, let document else { return }
      captureImportIntent(document: document) { [weak self, weak document] result in
        guard let self, let document else { return }
        do {
          let asset = try document.importPastedPNG(
            data, authorizedDirectory: directory, importIntent: result.get())
          presentImportedImage(asset)
        } catch { presentImageError(error) }
      }
    }
  }

  private func captureImportIntent(
    document: InkoraDocument,
    completion: @escaping (Result<LocalImageAsset.ImportIntent, Error>) -> Void
  ) {
    guard let bridge else {
      completion(.failure(EditorBridgeError.editorUnavailable))
      return
    }
    bridge.requestState { [weak self, weak document] result in
      guard let self, let document else { return }
      completion(
        Result {
          let state = try result.get()
          guard state.documentID == document.bridgeDocumentID,
            let anchor = state.selectionAnchor, let head = state.selectionHead
          else { throw EditorBridgeError.staleRevision }
          let session = try document.localImages()
          return LocalImageAsset.ImportIntent(
            documentID: session.documentID,
            sessionID: session.sessionID,
            documentEpoch: documentEpoch,
            revision: state.revision,
            selectionAnchor: anchor,
            selectionHead: head,
            recoveryState: .active)
        })
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
      guard let anchor = asset.importIntent?.selectionAnchor,
        let head = asset.importIntent?.selectionHead
      else { throw LocalImageError.unresolvedMarkdownOwner }
      let capability = try register(asset)
      bridge?.applyImageImport(
        documentEpoch: documentEpoch,
        assetID: asset.id,
        uri: asset.markdownURI,
        alt: "",
        title: nil,
        displayURL: capability.url,
        selectionAnchor: anchor,
        selectionHead: head
      ) { [weak self] error in
        if let error {
          self?.presentImageError(error)
        } else {
          try? self?.document?.localImages().markInsertionAccepted(assetID: asset.id)
        }
      }
    } catch { presentImageError(error) }
  }

  private func register(
    _ asset: LocalImageAsset, provisional: Bool = false
  ) throws -> DocumentAssetCapability {
    guard let document else { throw EditorBridgeError.editorUnavailable }
    let root: URL
    let basePath: String
    let relativePath: String
    if asset.state == .draft || asset.state == .awaitingMarkdown {
      root = asset.storageURL.deletingLastPathComponent()
      basePath = ""
      relativePath = Self.percentEncode(asset.storageURL.lastPathComponent)
    } else if let documentURL = document.fileURL {
      guard
        let authorizedRoot =
          try document.resolveImageDirectory(role: "document-directory", for: documentURL)
          ?? document.resolveImageDirectory(role: "document-read-directory", for: documentURL)
      else { throw LocalImageError.unauthorizedDirectory }
      root = authorizedRoot
      basePath = try Self.relativeEncodedPath(
        from: root, to: documentURL.deletingLastPathComponent())
      relativePath = asset.markdownURI
    } else {
      throw LocalImageError.corruptManifest
    }
    let capability =
      try provisional
      ? assetBroker.provision(
        documentID: document.bridgeDocumentID, epoch: documentEpoch, rootURL: root,
        percentEncodedBasePath: basePath, percentEncodedRelativePath: relativePath,
        sha256: asset.sha256, mimeType: asset.mimeType)
      : assetBroker.register(
        documentID: document.bridgeDocumentID, epoch: documentEpoch, rootURL: root,
        percentEncodedBasePath: basePath, percentEncodedRelativePath: relativePath,
        sha256: asset.sha256, mimeType: asset.mimeType)
    let status =
      provisional
      ? assetBroker.validateProvisional(token: capability.token).status
      : assetBroker.read(token: capability.token).status
    guard status == .ready else {
      if provisional { assetBroker.discardProvisional(tokens: [capability.token]) }
      throw LocalImageError.unauthorizedDirectory
    }
    return capability
  }

  private func refreshImageDescriptors() {
    bridge?.requestVersionedSnapshot { [weak self] result in
      guard let self, case .success(let snapshot) = result else { return }
      self.refreshImageDescriptors(using: snapshot)
    }
  }

  private func refreshImageDescriptors(using snapshot: BridgeSnapshot) {
    guard let ownership = try? snapshot.requireImageOwnership() else { return }
    sendImageDescriptors(ownership: ownership) { [weak self] in
      guard let self, let document = self.document,
        let session = try? document.localImages()
      else { return [] }
      return self.preparedImageDescriptors(
        document: document, session: session, ownership: ownership)
    } completion: { [weak self] success in
      guard success, let self, let session = try? self.document?.localImages() else { return }
      let owners = Set(ownership.imageURIs)
      for asset in session.assets where asset.insertion == .pending {
        if asset.recoveryDisposition != nil
          || asset.importIntent?.recoveryState == .requiresConfirmation
        {
          continue
        } else if owners.contains(asset.markdownURI) {
          try? session.markInsertionAccepted(assetID: asset.id)
        } else if !session.wasRestored,
          let intent = asset.importIntent,
          intent.documentID == session.documentID,
          intent.sessionID == session.sessionID,
          intent.documentEpoch == self.documentEpoch,
          intent.revision == self.editorState?.revision,
          intent.recoveryState == .active
        {
          self.presentImportedImage(asset)
        } else {
          try? session.requireInsertionConfirmation(assetID: asset.id)
        }
      }
    }
  }

  private func preparedImageDescriptors(
    document: InkoraDocument,
    session: LocalImageSession,
    ownership: BridgeImageOwnershipProof
  ) -> [PreparedImageDescriptor] {
    let owners = Set(ownership.imageURIs)
    var descriptors = session.assets.filter { owners.contains($0.markdownURI) }.map {
      asset -> PreparedImageDescriptor in
      do {
        let capability = try register(asset, provisional: true)
        return PreparedImageDescriptor(
          descriptor: BridgeImageDescriptor(
            href: asset.markdownURI, status: .ready,
            displayURL: capability.url.absoluteString, message: nil),
          provisionalToken: capability.token)
      } catch LocalImageError.unauthorizedDirectory {
        return PreparedImageDescriptor(
          descriptor: BridgeImageDescriptor(
            href: asset.markdownURI, status: .denied, displayURL: nil,
            message: LocalImageError.unauthorizedDirectory.localizedDescription),
          provisionalToken: nil)
      } catch {
        return PreparedImageDescriptor(
          descriptor: BridgeImageDescriptor(
            href: asset.markdownURI, status: .error, displayURL: nil,
            message: error.localizedDescription), provisionalToken: nil)
      }
    }
    var known = Set(descriptors.map(\.descriptor.href))
    if let documentURL = document.fileURL {
      let grant =
        document.restoredImageDirectory(role: "document-directory", for: documentURL)
        ?? document.restoredImageDirectory(role: "document-read-directory", for: documentURL)
      guard let grant else {
        for href in LocalImageMigrationCoordinator.localImageURIs(in: ownership.imageURIs)
        where known.insert(href).inserted {
          descriptors.append(
            PreparedImageDescriptor(
              descriptor: BridgeImageDescriptor(
                href: href, status: .denied, displayURL: nil,
                message: LocalImageError.unauthorizedDirectory.localizedDescription),
              provisionalToken: nil))
        }
        return descriptors
      }
      let accessed = grant.startAccessingSecurityScopedResource()
      defer { if accessed { grant.stopAccessingSecurityScopedResource() } }
      for href in LocalImageMigrationCoordinator.localImageURIs(in: ownership.imageURIs)
      where known.insert(href).inserted {
        descriptors.append(
          existingImageDescriptor(
            href: href, documentURL: documentURL, authorizedDirectory: grant))
      }
    }
    return descriptors
  }

  private func existingImageDescriptor(
    href: String,
    documentURL: URL,
    authorizedDirectory: URL
  ) -> PreparedImageDescriptor {
    guard let document else {
      return PreparedImageDescriptor(
        descriptor: BridgeImageDescriptor(
          href: href, status: .error, displayURL: nil,
          message: EditorBridgeError.editorUnavailable.localizedDescription),
        provisionalToken: nil)
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
      let capability = try assetBroker.provision(
        documentID: document.bridgeDocumentID, epoch: documentEpoch,
        rootURL: authorizedDirectory, percentEncodedBasePath: basePath,
        percentEncodedRelativePath: relativePath, sha256: inspection.sha256,
        mimeType: inspection.mimeType)
      guard assetBroker.validateProvisional(token: capability.token).status == .ready else {
        assetBroker.discardProvisional(tokens: [capability.token])
        throw LocalImageError.unauthorizedDirectory
      }
      return PreparedImageDescriptor(
        descriptor: BridgeImageDescriptor(
          href: href, status: .ready, displayURL: capability.url.absoluteString,
          message: nil), provisionalToken: capability.token)
    } catch let error as LocalImageError {
      let status: BridgeImageStatus
      switch error {
      case .unauthorizedDirectory: status = .denied
      case .unsupportedFormat: status = .unsupported
      case .invalidSource: status = .missing
      default: status = .error
      }
      return PreparedImageDescriptor(
        descriptor: BridgeImageDescriptor(
          href: href, status: status, displayURL: nil,
          message: error.localizedDescription), provisionalToken: nil)
    } catch {
      return PreparedImageDescriptor(
        descriptor: BridgeImageDescriptor(
          href: href, status: .error, displayURL: nil,
          message: error.localizedDescription), provisionalToken: nil)
    }
  }

  private func sendImageDescriptors(
    ownership: BridgeImageOwnershipProof,
    prepare: @escaping () -> [PreparedImageDescriptor],
    completion: @escaping (Bool) -> Void = { _ in }
  ) {
    guard let bridge else {
      completion(false)
      return
    }
    let expectedEpoch = documentEpoch
    bridge.requestVersionedSnapshot { [weak self, weak bridge] result in
      guard let self, let bridge, self.documentEpoch == expectedEpoch,
        case .success(let snapshot) = result,
        let currentOwnership = try? snapshot.requireImageOwnership(),
        currentOwnership == ownership
      else {
        completion(false)
        return
      }
      var prepared: [PreparedImageDescriptor] = []
      bridge.setImageDescriptors(
        documentEpoch: expectedEpoch, ownership: ownership,
        makeDescriptors: {
          prepared = prepare()
          return prepared.map(\.descriptor)
        }
      ) { [weak self] error in
        guard let self else {
          completion(false)
          return
        }
        let tokens = prepared.compactMap(\.provisionalToken)
        guard error == nil else {
          self.assetBroker.discardProvisional(tokens: tokens)
          completion(false)
          return
        }
        do {
          try self.assetBroker.commitProvisional(tokens: tokens)
          completion(true)
        } catch {
          self.assetBroker.discardProvisional(tokens: tokens)
          completion(false)
        }
      }
    }
  }

  func prepareImagesForSave(
    to targetURL: URL,
    snapshot: BridgeSnapshot,
    completion: @escaping (Result<DocumentImageSavePreparation?, Error>) -> Void
  ) {
    guard let document else {
      completion(.success(nil))
      return
    }
    let ownership: BridgeImageOwnershipProof
    do {
      ownership = try snapshot.requireImageOwnership()
    } catch {
      completion(.failure(error))
      return
    }
    if ownership.imageURIs.isEmpty {
      completion(.success(nil))
      return
    }
    let localOwners = LocalImageMigrationCoordinator.localImageURIs(in: ownership.imageURIs)
    let hasDraftOwner = ownership.imageURIs.contains {
      $0.lowercased().hasPrefix("inkora-draft:")
    }
    if localOwners.isEmpty && !hasDraftOwner {
      completion(.success(nil))
      return
    }
    let session: LocalImageSession
    do {
      session = try document.localImages()
    } catch {
      completion(.failure(error))
      return
    }
    let owners = Set(ownership.imageURIs)
    let ownershipEpoch = documentEpoch
    let hasDrafts = session.assets.contains {
      ($0.state == .draft || $0.state == .awaitingMarkdown)
        && $0.insertion == .accepted
        && owners.contains($0.markdownURI)
    }
    let needsMigration =
      (document.fileURL.map {
        $0.standardizedFileURL != targetURL.standardizedFileURL
      } ?? false)
      && !localOwners.isEmpty
    guard hasDrafts || needsMigration else {
      completion(.success(nil))
      return
    }
    let receiveTarget: (URL?) -> Void = { [weak self] directory in
      guard let self else { return }
      guard self.documentEpoch == ownershipEpoch else {
        completion(.failure(EditorBridgeError.staleRevision))
        return
      }
      guard let directory else {
        completion(.failure(CocoaError(.userCancelled)))
        return
      }
      let finish: (URL?) -> Void = { [weak self] sourceDirectory in
        guard let self else { return }
        guard self.documentEpoch == ownershipEpoch else {
          completion(.failure(EditorBridgeError.staleRevision))
          return
        }
        guard let bridge = self.bridge else {
          completion(.failure(EditorBridgeError.editorUnavailable))
          return
        }
        bridge.requestVersionedSnapshot { [weak self, weak bridge] result in
          guard let self, let bridge, self.documentEpoch == ownershipEpoch else {
            completion(.failure(EditorBridgeError.staleRevision))
            return
          }
          do {
            let currentSnapshot = try result.get()
            guard try currentSnapshot.requireImageOwnership() == ownership else {
              throw EditorBridgeError.staleRevision
            }
            let plan = try document.prepareLocalImagesForSave(
              documentURL: targetURL, authorizedDirectory: directory,
              snapshot: currentSnapshot)
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
              guard let asset = assetsByURI[source] else {
                throw LocalImageError.corruptManifest
              }
              return BridgeImageRewrite(
                assetID: asset.id.uuidString.lowercased(), from: source, to: target)
            }
            if rewrites.isEmpty {
              completion(.success(preparation))
              return
            }
            bridge.prepareImageSave(
              documentEpoch: ownershipEpoch, ownership: ownership, rewrites: rewrites
            ) { error in
              if let error {
                completion(.failure(error))
              } else {
                completion(.success(preparation))
              }
            }
          } catch { completion(.failure(error)) }
        }
      }
      if needsMigration, let sourceURL = document.fileURL {
        if let restored = restoredDirectory(role: "save-as-source", for: sourceURL) {
          finish(restored)
          return
        }
        authorizeImageSaveDirectory(
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
      authorizeImageSaveDirectory(
        for: targetURL, role: "document-directory", access: .readWrite,
        completion: receiveTarget)
    }
  }

  private func authorizeImageSaveDirectory(
    for documentURL: URL,
    role: String,
    access: AssetDirectoryAccess,
    completion: @escaping (URL?) -> Void
  ) {
    if let imageSaveDirectoryAuthorizer {
      imageSaveDirectoryAuthorizer(documentURL, role, access, completion)
    } else {
      requestDirectoryAuthorization(
        for: documentURL, role: role, access: access, completion: completion)
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
final class PendingImageRecoveryBannerView: NSView {
  init(
    count: Int,
    collapsed: Bool,
    target: AnyObject,
    confirmAction: Selector,
    laterAction: Selector
  ) {
    super.init(frame: .zero)
    setAccessibilityIdentifier("PendingImageRecoveryBanner")
    let confirm = NSButton(
      title: collapsed ? "继续恢复图片（\(count)）" : "按当前光标插入下一张",
      target: target,
      action: confirmAction)
    confirm.keyEquivalent = "i"
    confirm.keyEquivalentModifierMask = [.command, .option]
    confirm.setAccessibilityIdentifier("ConfirmPendingImageRecovery")
    confirm.setAccessibilityHelp("重新读取当前光标后插入；不会使用崩溃前的旧选区。")

    let arranged: [NSView]
    if collapsed {
      arranged = [confirm]
    } else {
      let message = NSTextField(
        wrappingLabelWithString:
          "已验证 \(count) 个待恢复图片。确认后将重新读取当前光标，再插入下一张；旧选区不会自动重放。")
      message.setAccessibilityIdentifier("PendingImageRecoveryExplanation")
      let later = NSButton(title: "稍后", target: target, action: laterAction)
      later.keyEquivalent = "l"
      later.keyEquivalentModifierMask = [.command, .option]
      later.setAccessibilityIdentifier("DeferPendingImageRecovery")
      later.setAccessibilityHelp("收起提示；仍可在文档顶部继续恢复。")
      arranged = [message, confirm, later]
    }
    let stack = NSStackView(views: arranged)
    stack.orientation = .horizontal
    stack.alignment = .centerY
    stack.spacing = 10
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
      stack.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -12),
      stack.topAnchor.constraint(equalTo: topAnchor, constant: 8),
      stack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -8),
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
