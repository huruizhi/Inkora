import AppKit
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
  private var webView: WKWebView?
  private var editorState: BridgeEditorState?
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

    let bridge = EditorBridge(
      delegate: self,
      requestTimeout: requestTimeout,
      diagnostics: diagnostics
    )
    configuration.userContentController.add(bridge, name: "inkora")

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    bridge.attach(webView: webView)
    if let document {
      bridge.loadDocument(
        documentID: document.bridgeDocumentID,
        revision: document.bridgeRevision,
        text: document.text
      )
    }

    self.bridge = bridge
    self.resourceSchemeHandler = resourceSchemeHandler
    self.webView = webView
    view = webView

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

  func reloadDocument() {
    guard let document else { return }
    editorState = nil
    bridge?.loadDocument(
      documentID: document.bridgeDocumentID, revision: document.bridgeRevision, text: document.text)
    NSApplication.shared.mainMenu?.update()
  }

  func confirmSaved(_ snapshot: BridgeSnapshot) {
    bridge?.confirmSaved(snapshot)
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
    document?.editorDidChangeState(state)
    NSApplication.shared.mainMenu?.update()
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
    view = webView
    loadEditor(into: webView)
  }

  private func presentResourceError(message: String) {
    let recoveryView = EditorRecoveryView(
      message: message,
      target: self,
      action: #selector(recoverEditor)
    )
    view = recoveryView
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
