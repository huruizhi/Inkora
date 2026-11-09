import AppKit
import CryptoKit
import Foundation
import UniformTypeIdentifiers
import WebKit

@main
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    // 纯代码宿主没有 nib，必须显式创建并持有 delegate。
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { application.run() }
    }

    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var eventView: NSTextView!
    private var webView: WKWebView!
    private var log: EventLog!
    private var bookmarks: BookmarkStore!
    private var broker: ResourceBroker!
    private var locator: FixtureLocator?
    private var currentImagePath: String?
    private var pageReady = false
    private var pendingImage: ResourceCapability?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let item = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "退出图片验收宿主", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = appMenu
        menu.addItem(item)
        NSApp.mainMenu = menu
        do {
            log = try EventLog()
            bookmarks = try BookmarkStore(log: log)
            broker = ResourceBroker(log: log)
            locator = try loadLocator()
            buildWindow()
            wireEventDisplay()
            emitStartupState()
            restoreBookmarks()
        } catch {
            let alert = NSAlert(error: error)
            alert.runModal()
            NSApp.terminate(nil)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        log?.emit("host-terminate", ["cleanup": "fixture-preserved; scopes-owned-by-active-reads"])
    }

    private func loadLocator() throws -> FixtureLocator {
        let url = try applicationSupportDirectory().appendingPathComponent("fixture-locator.json")
        let data = try Data(contentsOf: url)
        let value = try JSONDecoder().decode(FixtureLocator.self, from: data)
        guard value.schemaVersion == 1 else { throw NSError(domain: "InkoraPrototype", code: 1, userInfo: [NSLocalizedDescriptionKey: "fixture locator schema 不支持"]) }
        return value
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 980, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "INK-PROT-032 本地图片授权宿主"
        window.center()

        let title = NSTextField(labelWithString: "原型问题：显式面板授权、书签恢复和文档隔离 broker 能否安全加载本地图片？")
        title.font = .boldSystemFont(ofSize: 15)
        title.maximumNumberOfLines = 2
        statusLabel = NSTextField(labelWithString: "正在初始化真实状态…")
        statusLabel.textColor = .secondaryLabelColor

        let markdownButton = NSButton(title: "1. 选择白名单 Markdown", target: self, action: #selector(selectMarkdown))
        let directoryButton = NSButton(title: "2. 选择白名单目录并加载图片", target: self, action: #selector(selectDirectory))
        let epochButton = NSButton(title: "切换文档 epoch", target: self, action: #selector(newEpoch))
        let revokeButton = NSButton(title: "撤销本原型授权", target: self, action: #selector(revokeAuthorization))
        let controls = NSStackView(views: [markdownButton, directoryButton, epochButton, revokeButton])
        controls.orientation = .horizontal
        controls.spacing = 8

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.setURLSchemeHandler(BundleSchemeHandler(log: log), forURLScheme: "inkora-host")
        configuration.setURLSchemeHandler(AssetSchemeHandler(broker: broker, log: log), forURLScheme: "inkora-asset")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self

        eventView = NSTextView()
        eventView.isEditable = false
        eventView.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
        let eventScroll = NSScrollView()
        eventScroll.hasVerticalScroller = true
        eventScroll.documentView = eventView
        eventScroll.heightAnchor.constraint(equalToConstant: 170).isActive = true

        let stack = NSStackView(views: [title, statusLabel, controls, webView, eventScroll])
        stack.orientation = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView = NSView()
        window.contentView?.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor, constant: -16),
            webView.heightAnchor.constraint(greaterThanOrEqualToConstant: 330)
        ])
        window.makeKeyAndOrderFront(nil)
        webView.load(URLRequest(url: URL(string: "inkora-host://bundle/index.html")!))
    }

    private func wireEventDisplay() {
        log.onLine = { [weak self] line in
            guard let self else { return }
            self.eventView.textStorage?.append(NSAttributedString(string: line + "\n"))
            self.eventView.scrollToEndOfDocument(nil)
            let encoded = try? JSONSerialization.data(withJSONObject: [line])
            if let encoded, var argument = String(data: encoded, encoding: .utf8) {
                argument.removeFirst()
                argument.removeLast()
                self.webView.evaluateJavaScript("window.appendEvent(\(argument))")
            }
        }
    }

    private func emitStartupState() {
        guard let locator else { return }
        let sandbox = sandboxIsActive()
        let binaryData = (Bundle.main.executableURL.flatMap { try? Data(contentsOf: $0) }) ?? Data()
        log.emit("host-start", [
            "os": ProcessInfo.processInfo.operatingSystemVersionString,
            "binarySHA256": dataSHA256(binaryData),
            "runID": locator.runID.uuidString,
            "fixtureManifestSHA256": locator.manifestSHA256,
            "sandboxActive": String(sandbox)
        ])
        statusLabel.stringValue = sandbox
            ? "Sandbox 已激活；runID \(locator.runID.uuidString)；尚未把定位路径当作授权。"
            : "Sandbox 未激活：本次结果无效，不会宣告授权通过。"
        log.emit(sandbox ? "sandbox-active" : "sandbox-inactive")
    }

    @objc private func selectMarkdown() {
        guard let locator else { return }
        let panel = NSOpenPanel()
        panel.message = "请选择控制脚本创建的白名单 Markdown；选择文件不应自动授权邻接图片。"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [UTType(filenameExtension: "md")!, UTType(filenameExtension: "markdown")!]
        panel.directoryURL = locator.fixtureRoot // 仅定位，不作为授权来源。
        log.emit("panel-open", ["kind": "markdown", "source": "user-action"])
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            guard response == .OK, let url = panel.url else {
                self.log.emit("panel-cancel", ["kind": "markdown", "source": "user-action"])
                return
            }
            self.log.emit("panel-selected", ["kind": "markdown", "source": "NSOpenPanel"])
            guard url.standardizedFileURL == locator.fixtureRoot.appendingPathComponent(locator.markdownRelativePath).standardizedFileURL else {
                self.log.emit("panel-rejected", ["kind": "markdown", "reason": "not-fixture-whitelist"])
                return
            }
            self.inspectMarkdownGrant(url: url, persist: true)
        }
    }

    @objc private func selectDirectory() {
        guard let locator else { return }
        let panel = NSOpenPanel()
        panel.message = "请选择控制脚本创建的完整白名单目录，授权后才验证 manifest 与加载图片。"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.directoryURL = locator.runRoot // 仅定位，不作为授权来源。
        log.emit("panel-open", ["kind": "directory", "source": "user-action"])
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            guard response == .OK, let url = panel.url else {
                self.log.emit("panel-cancel", ["kind": "directory", "source": "user-action"])
                return
            }
            self.log.emit("panel-selected", ["kind": "directory", "source": "NSOpenPanel"])
            guard url.standardizedFileURL == locator.fixtureRoot.standardizedFileURL else {
                self.log.emit("panel-rejected", ["kind": "directory", "reason": "not-current-fixture-root"])
                return
            }
            self.installDirectoryGrant(url: url, persist: true, source: "panel")
        }
    }

    @objc private func newEpoch() {
        broker.beginNewEpoch()
        pendingImage = nil
        currentImagePath = nil
        webView.evaluateJavaScript("window.clearImage('旧 epoch token 已失效；请重新选择目录。')")
    }

    @objc private func revokeAuthorization() {
        bookmarks.removeAll()
        broker.revoke()
        pendingImage = nil
        currentImagePath = nil
        webView.evaluateJavaScript("window.clearImage('授权与 token 已撤销。')")
    }

    private func restoreBookmarks() {
        guard let locator else { return }
        for restored in bookmarks.restore(runID: locator.runID) {
            switch restored.kind {
            case .markdownFile:
                inspectMarkdownGrant(url: restored.url, persist: false)
            case .fixtureDirectory:
                installDirectoryGrant(url: restored.url, persist: false, source: "bookmark-restore")
            }
        }
    }

    private func inspectMarkdownGrant(url: URL, persist: Bool) {
        guard let locator else { return }
        guard url.standardizedFileURL.path.hasPrefix(locator.runRoot.standardizedFileURL.path + "/") else {
            log.emit("authorization-rejected", ["reason": "markdown-outside-run-root"])
            return
        }
        let active = url.startAccessingSecurityScopedResource()
        log.emit("scope-start", ["kind": "markdown", "active": String(active), "count": active ? "1" : "0"])
        defer {
            if active { url.stopAccessingSecurityScopedResource() }
            log.emit("scope-stop", ["kind": "markdown", "active": String(active), "count": "0"])
        }
        let markdown = readAbsoluteFileNoFollow(url)
        logRead("markdown-read", result: markdown)
        guard markdown.status == .success, markdown.sha256 == locator.markdownSHA256 else {
            log.emit("authorization-rejected", ["reason": "markdown-sha-mismatch"])
            return
        }
        let imagePath: SafeRelativePath
        do { imagePath = try SafeRelativePath(encoded: locator.imageEncodedRelativePath) }
        catch {
            log.emit("native-read-result", ["kind": "adjacent-image", "status": "invalid-locator"])
            return
        }
        let adjacent = readFileNoFollow(root: url.deletingLastPathComponent(), path: imagePath)
        logRead("adjacent-image-read-with-file-grant", result: adjacent)
        if persist {
            saveBookmark(kind: .markdownFile, url: url, runID: locator.runID)
        }
    }

    private func installDirectoryGrant(url: URL, persist: Bool, source: String) {
        guard let locator else { return }
        guard url.standardizedFileURL.path.hasPrefix(locator.runRoot.standardizedFileURL.path + "/") else {
            log.emit("authorization-rejected", ["reason": "outside-run-root", "source": source])
            return
        }
        let active = url.startAccessingSecurityScopedResource()
        log.emit("scope-start", ["kind": "directory-validation", "active": String(active), "count": active ? "1" : "0"])
        defer {
            if active { url.stopAccessingSecurityScopedResource() }
            log.emit("scope-stop", ["kind": "directory-validation", "active": String(active), "count": "0"])
        }
        let read = readRelativeNoFollow(root: url, components: ["manifest.json"], maximumBytes: 1_000_000)
        logRead("manifest-read", result: read)
        guard read.status == .success, let data = read.data, dataSHA256(data) == locator.manifestSHA256,
              let manifest = try? JSONDecoder().decode(FixtureManifest.self, from: data),
              manifest.schemaVersion == 1, manifest.runID == locator.runID,
              manifest.files.contains(where: { $0.relativePath == (try? SafeRelativePath(encoded: locator.imageEncodedRelativePath).value) && $0.kind == "png" }) else {
            log.emit("authorization-rejected", ["reason": "manifest-or-whitelist-mismatch", "source": source])
            return
        }
        if persist { saveBookmark(kind: .fixtureDirectory, url: url, runID: locator.runID) }
        broker.authorize(root: url, manifest: manifest)
        do {
            let capability = try broker.register(encodedPath: locator.imageEncodedRelativePath)
            currentImagePath = "inkora-asset://resource/\(capability.token.uuidString)"
            pendingImage = capability
            presentPendingImage()
        } catch {
            log.emit("resource-token-error", ["error": String(describing: error)])
        }
    }

    private func presentPendingImage() {
        guard pageReady, let capability = pendingImage,
              broker.isCurrent(token: capability.token) else { return }
        let arguments = ["inkora-asset://resource/\(capability.token.uuidString)",
                         capability.documentID.uuidString, capability.epoch.uuidString]
        guard let encoded = try? JSONSerialization.data(withJSONObject: arguments),
              let json = String(data: encoded, encoding: .utf8) else { return }
        pendingImage = nil
        webView.evaluateJavaScript("window.showImage(...\(json))") { [weak self] _, error in
            if let error { self?.log.emit("wk-presentation-error", ["error": String(describing: error)]) }
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        pageReady = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        log.emit("wk-page-ready")
        presentPendingImage()
    }

    private func logRead(_ kind: String, result: NativeReadResult) {
        log.emit("native-read-result", [
            "kind": kind,
            "status": result.status.rawValue,
            "errno": result.errnoValue.map(String.init) ?? "none",
            "sha256": result.sha256 ?? "none"
        ])
    }

    private func saveBookmark(kind: BookmarkKind, url: URL, runID: UUID) {
        do {
            try bookmarks.save(kind: kind, url: url, runID: runID)
        } catch {
            log.emit("bookmark-error", ["kind": kind.rawValue, "action": "create", "error": String(describing: error)])
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let allowed = url.scheme == "inkora-host" && url.host == "bundle" && url.path == "/index.html"
        if !allowed {
            log.emit("navigation-rejected", ["scheme": url.scheme ?? "none", "host": url.host ?? "none"])
        }
        decisionHandler(allowed ? .allow : .cancel)
    }
}
