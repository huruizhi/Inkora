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

// MARK: - 系统 task 出口抽象
// 只有 WKURLSchemeTask 这个“系统出口”被抽象：WK 适配器与确定性非 UI 接缝
// （HandlerCheck 的 fake outlet）共同调用 AssetSchemeTaskCore 的真实状态机；
// broker、generation 轮换与 descriptor 读取全部保持真实实现。

protocol AssetTaskOutlet: AnyObject {
    var identity: ObjectIdentifier { get }
    var request: URLRequest? { get }
    func receive(response: URLResponse)
    func receive(data: Data)
    func finish()
    func fail(_ error: Error)
}

/// 生产出口：直接转发 WKURLSchemeTask；identity 绑定底层系统 task 对象，
/// 与 stop(urlSchemeTask) 传入的同一系统对象保持同一 identity。
final class WKSchemeTaskOutlet: AssetTaskOutlet {
    private let task: WKURLSchemeTask
    let identity: ObjectIdentifier

    init(_ task: WKURLSchemeTask) {
        self.task = task
        identity = ObjectIdentifier(task as AnyObject)
    }

    var request: URLRequest? { task.request }
    func receive(response: URLResponse) { task.didReceive(response) }
    func receive(data: Data) { task.didReceive(data) }
    func finish() { task.didFinish() }
    func fail(_ error: Error) { task.didFailWithError(error) }
}

// MARK: - 回调交付接缝
// 默认 MainTaskDelivery 保持真实 WK 路径的主队列交付行为；
// 确定性接缝可注入受控串行交付，复现 stop 与 completion 的先后两种顺序。

protocol TaskDeliverySeam {
    func async(_ block: @escaping () -> Void)
    func sync(_ block: @escaping () -> Void)
}

final class MainTaskDelivery: TaskDeliverySeam {
    func async(_ block: @escaping () -> Void) {
        DispatchQueue.main.async(execute: block)
    }

    func sync(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.sync(execute: block)
        }
    }
}

// MARK: - WK 适配器

final class AssetSchemeHandler: NSObject, WKURLSchemeHandler {
    private let core: AssetSchemeTaskCore

    init(broker: ResourceBroker, log: EventLog) {
        core = AssetSchemeTaskCore(broker: broker, log: log)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        core.start(WKSchemeTaskOutlet(urlSchemeTask))
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        core.stop(identity: ObjectIdentifier(urlSchemeTask as AnyObject))
    }
}

// MARK: - 真实 start/stop 状态机
// WK 适配器与 fake task 接缝共同调用的唯一实现；语义与原 WKURLSchemeHandler
// 方法一致（active/canceled 集合 + 串行状态队列 + 交付队列回调）。

final class AssetSchemeTaskCore {
    private let broker: ResourceBroker
    private let log: EventLog
    private let state = DispatchQueue(label: "inkora.prototype.asset-scheme.state")
    private let delivery: TaskDeliverySeam
    private var canceled: Set<ObjectIdentifier> = []
    private var active: Set<ObjectIdentifier> = []

    init(broker: ResourceBroker, log: EventLog, delivery: TaskDeliverySeam = MainTaskDelivery()) {
        self.broker = broker
        self.log = log
        self.delivery = delivery
    }

    func start(_ outlet: AssetTaskOutlet) {
        let identifier = outlet.identity
        guard let url = outlet.request?.url,
              url.scheme == "inkora-asset", url.host == "resource",
              url.pathComponents.count == 2,
              let token = UUID(uuidString: url.lastPathComponent) else {
            outlet.fail(NSError(domain: "InkoraAssetScheme", code: 400))
            return
        }
        _ = state.sync { active.insert(identifier) }
        log.emit("wk-request", ["token": token.uuidString])
        broker.read(token: token) { result in
            self.delivery.async {
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
                    outlet.fail(NSError(
                        domain: "InkoraAssetScheme",
                        code: 409,
                        userInfo: [NSLocalizedDescriptionKey: "document-generation-changed"]
                    ))
                    self.log.emit("wk-stale-document-rejected", ["token": token.uuidString])
                    return
                }
                if let data = result.data, let mime = result.mimeType {
                    let response = URLResponse(url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil)
                    outlet.receive(response: response)
                    outlet.receive(data: data)
                    outlet.finish()
                    self.log.emit("wk-complete", ["token": token.uuidString, "sha256": result.sha256 ?? "none"])
                } else {
                    outlet.fail(NSError(
                        domain: "InkoraAssetScheme",
                        code: 403,
                        userInfo: [NSLocalizedDescriptionKey: result.error ?? "resource-rejected"]
                    ))
                    self.log.emit("wk-complete", ["token": token.uuidString, "error": result.error ?? "resource-rejected"])
                }
            }
        }
    }

    func stop(identity identifier: ObjectIdentifier) {
        let cancel = {
            self.state.sync {
                // 只有仍 active 的任务才标记 canceled：已完成任务的 identity 不残留，
                // 防止系统 task 对象地址复用后，无关新任务被 canceled 集合误抑制。
                if self.active.remove(identifier) != nil {
                    self.canceled.insert(identifier)
                }
            }
            self.log.emit("wk-cancel")
        }
        delivery.sync(cancel)
    }
}
