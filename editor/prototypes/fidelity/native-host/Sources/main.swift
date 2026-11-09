// INK-PROT-007: 最小 WKWebView 宿主，仅用于 M0 真实环境人工验证。
// 不是产品代码：无 NSDocument、无保存流程、无生产 Bridge。
import AppKit
import WebKit

/// INK-PROT-034: 原生输入对照。只记录 NSTextView 的公开输入边界，原样调用 super。
@MainActor
final class CancellationReferenceView: NSTextView {
    var report: (([String: Any]) -> Void)?

    private func record(_ event: String, _ value: Any? = nil) {
        var payload: [String: Any] = [
            "event": event, "text": string, "marked": hasMarkedText(),
            "selection": [selectedRange().location, selectedRange().length],
        ]
        if let value { payload["input"] = (value as? NSAttributedString)?.string ?? String(describing: value) }
        report?(payload)
    }

    override func setMarkedText(_ value: Any, selectedRange: NSRange, replacementRange: NSRange) {
        record("setMarkedText-before", value)
        super.setMarkedText(value, selectedRange: selectedRange, replacementRange: replacementRange)
        record("setMarkedText-after")
    }

    override func unmarkText() {
        record("unmarkText-before")
        super.unmarkText()
        record("unmarkText-after")
    }

    override func insertText(_ value: Any, replacementRange: NSRange) {
        record("insertText-before", value)
        super.insertText(value, replacementRange: replacementRange)
        record("insertText-after")
    }

    override func doCommand(by selector: Selector) {
        record("command-before", NSStringFromSelector(selector))
        super.doCommand(by: selector)
        record("command-after", NSStringFromSelector(selector))
    }
}

/// 资源版本信息由构建脚本写入 Info.plist，用于窗口标题与诊断栏，
/// 防止“源码更新但加载旧 bundle”。
struct ResourceInfo {
    let entryName: String
    let sourceSHA: String
    let bundleSHA: String
    let baseline: String
    let cspInjected: Bool
    let observerSHA: String

    static func load() -> ResourceInfo {
        let b = Bundle.main.infoDictionary
        func s(_ k: String) -> String { (b?[k] as? String) ?? "?" }
        return ResourceInfo(
            entryName: s("FidelityEntryName"),
            sourceSHA: s("FidelitySourceSHA256"),
            bundleSHA: s("FidelityBundleSHA256"),
            baseline: s("FidelityBuildBaseline"),
            cspInjected: s("FidelityCSPInjected") == "1",
            observerSHA: s("FidelityObserverSHA256")
        )
    }
}

@MainActor
final class HostAppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    let info = ResourceInfo.load()
    var window: NSWindow!
    var webView: WKWebView!
    var diagnostics: NSTextField!
    var lastSnapshotSignature: Data?
    var localKeyMonitor: Any?
    let closureRunID = UUID().uuidString
    lazy var closureLogURL = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("InkoraM0Closure", isDirectory: true)
        .appendingPathComponent("\(closureRunID).jsonl")

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "退出验收原型", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        menu.addItem(applicationItem)
        NSApp.mainMenu = menu
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 800))

        let diagHeight: CGFloat = 56
        let diag = NSTextField(labelWithString: "")
        diag.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        diag.lineBreakMode = .byCharWrapping
        diag.maximumNumberOfLines = 2
        diag.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(diag)
        self.diagnostics = diag

        let referenceLabel = NSTextField(labelWithString: "原生输入对照（仅取消诊断）：在 native: 后输入拼音，候选出现后按 Esc")
        referenceLabel.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(referenceLabel)
        let referenceScroll = NSScrollView()
        referenceScroll.borderType = .bezelBorder
        referenceScroll.hasVerticalScroller = true
        referenceScroll.translatesAutoresizingMaskIntoConstraints = false
        let reference = CancellationReferenceView(frame: NSRect(x: 0, y: 0, width: 1200, height: 40))
        reference.isRichText = false
        reference.font = .systemFont(ofSize: 18)
        reference.string = "native:"
        reference.setAccessibilityLabel("原生取消对照输入框")
        reference.report = { [weak self] payload in self?.emit(kind: "native-reference", payload: payload) }
        referenceScroll.documentView = reference
        content.addSubview(referenceScroll)

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.suppressesIncrementalRendering = false
        if let observerURL = Bundle.main.url(forResource: "runtime-observer", withExtension: "js"),
           let observerSource = try? String(contentsOf: observerURL, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(
                source: observerSource,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
            config.userContentController.add(self, name: "runtimeObserver")
        }
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
            webView.bottomAnchor.constraint(equalTo: referenceLabel.topAnchor, constant: -8),
            referenceLabel.leadingAnchor.constraint(equalTo: diag.leadingAnchor),
            referenceLabel.trailingAnchor.constraint(equalTo: diag.trailingAnchor),
            referenceScroll.topAnchor.constraint(equalTo: referenceLabel.bottomAnchor, constant: 4),
            referenceScroll.leadingAnchor.constraint(equalTo: diag.leadingAnchor),
            referenceScroll.trailingAnchor.constraint(equalTo: diag.trailingAnchor),
            referenceScroll.heightAnchor.constraint(equalToConstant: 48),
            referenceScroll.bottomAnchor.constraint(equalTo: diag.topAnchor, constant: -8),
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

        // 仅本应用、本窗口的特殊按键；不监听全局、不吞键、不申请权限。
        localKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp]) { [weak self] event in
            MainActor.assumeIsolated {
                guard let self, event.window === self.window,
                      [UInt16(53), 36, 76, 49, 51, 117].contains(event.keyCode) else { return event }
                self.emit(kind: "native-key", payload: [
                    "keyCode": event.keyCode, "type": event.type.rawValue,
                    "modifiers": event.modifierFlags.rawValue, "repeat": event.isARepeat,
                    "responder": String(describing: type(of: self.window.firstResponder)),
                    "referenceFocused": self.window.firstResponder === reference,
                    "referenceText": reference.string, "referenceMarked": reference.hasMarkedText(),
                    "eventTime": event.timestamp,
                ])
                return event
            }
        }

        updateDiagnostics(pageStatus: "loading")
        emit(kind: "host", payload: [
            "event": "launch",
            "baseline": info.baseline,
            "source_sha256": info.sourceSHA,
            "bundled_sha256": info.bundleSHA,
            "observer_sha256": info.observerSHA,
        ])

        guard let entry = Bundle.main.url(forResource: "entry", withExtension: "html") else {
            updateDiagnostics(pageStatus: "ERROR: entry.html missing from bundle")
            return
        }
        // 只授权读取本 bundle 的资源目录；不暴露 bundle 外任意文件路径。
        let readAccess = entry.deletingLastPathComponent()
        webView.loadFileURL(entry, allowingReadAccessTo: readAccess)
        pollPrototypeState()
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let localKeyMonitor { NSEvent.removeMonitor(localKeyMonitor) }
        emit(kind: "host", payload: ["event": "terminate"])
    }

    func updateDiagnostics(pageStatus: String) {
        let csp = info.cspInjected ? "CSP-injected" : "CSP-asis"
        diagnostics.stringValue =
            "baseline \(info.baseline) | entry \(info.entryName) | source \(String(info.sourceSHA.prefix(12))) → bundled \(String(info.bundleSHA.prefix(12))) (\(csp)) | page: \(pageStatus)"
    }

    func emit(kind: String, payload: Any) {
        let record: [String: Any] = [
            "kind": kind,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "payload": payload,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
              let line = String(data: data, encoding: .utf8) else { return }
        print("INKORA_RUNTIME \(line)")
        fflush(stdout)
        // Prototype-only evidence sink. No document, model, or input mutation.
        do {
            try FileManager.default.createDirectory(
                at: closureLogURL.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            if !FileManager.default.fileExists(atPath: closureLogURL.path) {
                guard FileManager.default.createFile(atPath: closureLogURL.path, contents: nil) else {
                    throw CocoaError(.fileWriteUnknown)
                }
            }
            let handle = try FileHandle(forWritingTo: closureLogURL)
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: Data((line + "\n").utf8))
        } catch {
            print("INKORA_EVIDENCE_WRITE_FAILED \(error.localizedDescription)")
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "runtimeObserver" else { return }
        emit(kind: "dom-event", payload: message.body)
    }

    /// 只读取 M0 验收所需的有限标量；不序列化模型/视图循环对象，不驱动页面。
    func pollPrototypeState() {
        Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let webView = self.webView else { return }
                webView.evaluateJavaScript("window.__inkoraRuntimeObserver?.snapshot?.() ?? null") { result, error in
                    let status: String
                    if let error { status = "no prototype state (\(error.localizedDescription))" }
                    else if let snapshot = result as? [String: Any] {
                        let signature = try? JSONSerialization.data(
                            withJSONObject: snapshot,
                            options: [.sortedKeys]
                        )
                        if signature != self.lastSnapshotSignature {
                            self.emit(kind: "snapshot", payload: snapshot)
                            self.lastSnapshotSignature = signature
                        }
                        let revision = snapshot["revision"] ?? "?"
                        let mode = (snapshot["sourceMode"] as? Bool) == true ? "source" : "visual"
                        let composing = snapshot["composing"] ?? false
                        status = "revision=\(revision) mode=\(mode) composing=\(composing) observer=\(self.info.observerSHA.prefix(12))"
                    }
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
