import Foundation
import WebKit

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let resources: [String: (String, String)] = [
        "/index.html": ("index", "html"),
        "/app.js": ("app", "js"),
        "/app.css": ("app", "css")
    ]
    private let log: EventLog

    init(log: EventLog) { self.log = log }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url,
              url.scheme == "inkora-host", url.host == "bundle",
              let resource = resources[url.path],
              let fileURL = Bundle.main.url(forResource: resource.0, withExtension: resource.1),
              let data = try? Data(contentsOf: fileURL) else {
            urlSchemeTask.didFailWithError(NSError(domain: "InkoraBundleScheme", code: 404))
            return
        }
        let mime: String
        switch resource.1 {
        case "html": mime = "text/html"
        case "js": mime = "text/javascript"
        default: mime = "text/css"
        }
        let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: "utf-8")
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private let broker: ResourceBroker
    private let log: EventLog
    private let state = DispatchQueue(label: "inkora.prototype.asset-scheme.state")
    private var canceled: Set<ObjectIdentifier> = []
    private var active: Set<ObjectIdentifier> = []

    init(broker: ResourceBroker, log: EventLog) {
        self.broker = broker
        self.log = log
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        let identifier = ObjectIdentifier(urlSchemeTask as AnyObject)
        guard let url = urlSchemeTask.request.url,
              url.scheme == "inkora-asset", url.host == "resource",
              url.pathComponents.count == 2,
              let token = UUID(uuidString: url.lastPathComponent) else {
            urlSchemeTask.didFailWithError(NSError(domain: "InkoraAssetScheme", code: 400))
            return
        }
        _ = state.sync { active.insert(identifier) }
        log.emit("wk-request", ["token": token.uuidString])
        broker.read(token: token) { result in
            DispatchQueue.main.async {
                let mayCallback = self.state.sync { () -> Bool in
                    let allowed = self.active.remove(identifier) != nil && !self.canceled.contains(identifier)
                    self.canceled.remove(identifier)
                    return allowed
                }
                guard mayCallback else {
                    self.log.emit("wk-callback-suppressed", ["token": token.uuidString])
                    return
                }
                guard self.broker.isCurrent(token: token) else {
                    urlSchemeTask.didFailWithError(NSError(
                        domain: "InkoraAssetScheme",
                        code: 409,
                        userInfo: [NSLocalizedDescriptionKey: "document-generation-changed"]
                    ))
                    self.log.emit("wk-stale-document-rejected", ["token": token.uuidString])
                    return
                }
                if let data = result.data, let mime = result.mimeType {
                    let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil)
                    urlSchemeTask.didReceive(response)
                    urlSchemeTask.didReceive(data)
                    urlSchemeTask.didFinish()
                    self.log.emit("wk-complete", ["token": token.uuidString, "sha256": result.sha256 ?? "none"])
                } else {
                    urlSchemeTask.didFailWithError(NSError(
                        domain: "InkoraAssetScheme",
                        code: 403,
                        userInfo: [NSLocalizedDescriptionKey: result.error ?? "resource-rejected"]
                    ))
                    self.log.emit("wk-complete", ["token": token.uuidString, "error": result.error ?? "resource-rejected"])
                }
            }
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        let identifier = ObjectIdentifier(urlSchemeTask as AnyObject)
        let cancel = {
            self.state.sync {
                self.canceled.insert(identifier)
                self.active.remove(identifier)
            }
            self.log.emit("wk-cancel")
        }
        if Thread.isMainThread {
            cancel()
        } else {
            DispatchQueue.main.sync(execute: cancel)
        }
    }
}
