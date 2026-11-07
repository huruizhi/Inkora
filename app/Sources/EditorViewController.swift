import AppKit
import WebKit

@MainActor
final class EditorViewController: NSViewController, EditorBridgeDelegate, WKNavigationDelegate {
  weak var document: InkoraDocument?

  private let resourceBundle: Bundle
  private var bridge: EditorBridge?
  private var resourceSchemeHandler: EditorResourceSchemeHandler?
  private var webView: WKWebView?

  init(document: InkoraDocument, resourceBundle: Bundle = .main) {
    self.document = document
    self.resourceBundle = resourceBundle
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
    configuration.setURLSchemeHandler(
      resourceSchemeHandler,
      forURLScheme: EditorResourceSchemeHandler.scheme
    )

    let bridge = EditorBridge(delegate: self)
    configuration.userContentController.add(bridge, name: "inkora")

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    bridge.attach(webView: webView)

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
    bridge.requestText(completion: completion)
  }

  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {
    bridge.load(text: document?.text ?? "")
  }

  func editorBridge(_ bridge: EditorBridge, didChangeText text: String) {
    document?.editorDidChangeText(text)
  }

  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction
  ) async -> WKNavigationActionPolicy {
    guard let url = navigationAction.request.url else {
      return .cancel
    }

    return url.scheme == EditorResourceSchemeHandler.scheme || url.scheme == "about"
      ? .allow : .cancel
  }

  func webView(
    _ webView: WKWebView,
    didFail navigation: WKNavigation!,
    withError error: Error
  ) {
    presentResourceError(message: error.localizedDescription)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    bridge?.failPendingRequests(EditorBridgeError.editorUnavailable)
    presentResourceError(message: "The editor process stopped unexpectedly.")
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    presentResourceError(message: error.localizedDescription)
  }

  private func loadEditor(into webView: WKWebView) {
    guard let indexURL = URL(string: "\(EditorResourceSchemeHandler.scheme)://app/index.html")
    else {
      presentResourceError(message: "The editor URL is invalid.")
      return
    }
    webView.load(URLRequest(url: indexURL))
  }

  private func presentResourceError(message: String) {
    let label = NSTextField(labelWithString: "Inkora could not load the editor: \(message)")
    label.alignment = .center
    view = label
  }
}
