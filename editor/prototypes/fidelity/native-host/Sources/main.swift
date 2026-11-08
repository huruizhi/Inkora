// INK-PROT-007: 最小 WKWebView 宿主，仅用于 M0 真实环境人工验证。
// 不是产品代码：无 NSDocument、无保存流程、无生产 Bridge。
import AppKit
import WebKit

/// 资源版本信息由构建脚本写入 Info.plist，用于窗口标题与诊断栏，
/// 防止“源码更新但加载旧 bundle”。
struct ResourceInfo {
    let entryName: String
    let sourceSHA: String
    let bundleSHA: String
    let baseline: String
    let cspInjected: Bool

    static func load() -> ResourceInfo {
        let b = Bundle.main.infoDictionary
        func s(_ k: String) -> String { (b?[k] as? String) ?? "?" }
        return ResourceInfo(
            entryName: s("FidelityEntryName"),
            sourceSHA: s("FidelitySourceSHA256"),
            bundleSHA: s("FidelityBundleSHA256"),
            baseline: s("FidelityBuildBaseline"),
            cspInjected: s("FidelityCSPInjected") == "1"
        )
    }
}

@MainActor
final class HostAppDelegate: NSObject, NSApplicationDelegate {
    let info = ResourceInfo.load()
    var window: NSWindow!
    var webView: WKWebView!
    var diagnostics: NSTextField!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800))

        let diagHeight: CGFloat = 56
        let diag = NSTextField(labelWithString: "")
        diag.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        diag.lineBreakMode = .byCharWrapping
        diag.maximumNumberOfLines = 2
        diag.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(diag)
        self.diagnostics = diag

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.suppressesIncrementalRendering = false
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        content.addSubview(webView)
        self.webView = webView

        NSLayoutConstraint.activate([
            diag.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            diag.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
            diag.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -6),
            diag.heightAnchor.constraint(equalToConstant: diagHeight),
            webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            webView.topAnchor.constraint(equalTo: content.topAnchor),
            webView.bottomAnchor.constraint(equalTo: diag.topAnchor, constant: -4),
        ])

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        window.title = "Inkora Fidelity Prototype · \(info.entryName) · \(String(info.bundleSHA.prefix(12)))"
        window.contentView = content
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window

        updateDiagnostics(pageStatus: "loading")

        guard let entry = Bundle.main.url(forResource: "entry", withExtension: "html") else {
            updateDiagnostics(pageStatus: "ERROR: entry.html missing from bundle")
            return
        }
        // 只授权读取本 bundle 的资源目录；不暴露 bundle 外任意文件路径。
        let readAccess = entry.deletingLastPathComponent()
        webView.loadFileURL(entry, allowingReadAccessTo: readAccess)
        pollPrototypeState()
    }

    func updateDiagnostics(pageStatus: String) {
        let csp = info.cspInjected ? "CSP-injected" : "CSP-asis"
        diagnostics.stringValue =
            "baseline \(info.baseline) | entry \(info.entryName) | source \(String(info.sourceSHA.prefix(12))) → bundled \(String(info.bundleSHA.prefix(12))) (\(csp)) | page: \(pageStatus)"
    }

    /// 可选最小诊断：读取 window.fidelityPrototype（若原型暴露）。
    /// 不引入生产 Bridge，不驱动任何自动化验收。
    func pollPrototypeState() {
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let webView = self.webView else { return }
                webView.evaluateJavaScript("JSON.stringify(window.fidelityPrototype ?? null) ?? \"null\"") { result, error in
                    let status: String
                    if let error { status = "no prototype state (\(error.localizedDescription))" }
                    else if let s = result as? String { status = "fidelityPrototype=\(s.prefix(120))" }
                    else { status = "loaded (no state)" }
                    self.updateDiagnostics(pageStatus: status)
                }
            }
        }
    }
}

extension HostAppDelegate: WKNavigationDelegate {
    // 导航白名单：仅允许本 bundle 内的 file URL 与 about:blank。
    // 其余（含 http/https、外链点击）一律取消，保持离线。
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel); return
        }
        let allowSchemes = ["about"]
        if allowSchemes.contains(url.scheme?.lowercased() ?? "") {
            decisionHandler(.allow); return
        }
        if url.scheme?.lowercased() == "file",
           let resourcesDir = Bundle.main.resourceURL,
           url.path.hasPrefix(resourcesDir.path) {
            decisionHandler(.allow); return
        }
        updateDiagnostics(pageStatus: "blocked navigation: \(url.absoluteString.prefix(80))")
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        updateDiagnostics(pageStatus: "navigation failed: \(error.localizedDescription)")
    }
}
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = HostAppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
}
