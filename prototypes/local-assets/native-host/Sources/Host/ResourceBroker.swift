import Foundation

struct BrokerReadResult {
    let data: Data?
    let mimeType: String?
    let sha256: String?
    let error: String?
}

private final class SecurityScopeLease {
    private let url: URL
    private let active: Bool
    private let counter: ScopeCounter

    init(url: URL, counter: ScopeCounter) {
        self.url = url
        self.counter = counter
        active = url.startAccessingSecurityScopedResource()
        counter.started(active: active)
    }

    deinit {
        if active { url.stopAccessingSecurityScopedResource() }
        counter.stopped(active: active)
    }
}

private final class ScopeCounter {
    private let lock = NSLock()
    private var count = 0
    private let log: EventLog

    init(log: EventLog) { self.log = log }

    func started(active: Bool) {
        lock.lock()
        if active { count += 1 }
        let snapshot = count
        lock.unlock()
        log.emit("scope-start", ["active": String(active), "count": String(snapshot)])
    }

    func stopped(active: Bool) {
        lock.lock()
        if active { count -= 1 }
        let snapshot = count
        lock.unlock()
        log.emit("scope-stop", ["active": String(active), "count": String(snapshot)])
    }

    func currentCount() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }
}

/// 读取调度接缝：只控制“何时执行读取操作”，默认在真实并发工作队列上立即执行；
/// 确定性非 UI 接缝可注入受控执行器。读取本身始终走真实 descriptor 路径。
protocol ReadScheduling {
    func perform(_ operation: @escaping () -> Void)
}

private struct WorkQueueReadScheduling: ReadScheduling {
    let queue: DispatchQueue

    func perform(_ operation: @escaping () -> Void) {
        queue.async(execute: operation)
    }
}

final class ResourceBroker {
    private let state = DispatchQueue(label: "inkora.prototype.resource-broker.state")
    private let work = DispatchQueue(label: "inkora.prototype.resource-broker.read", attributes: .concurrent)
    private let log: EventLog
    private let scopes: ScopeCounter
    private let readScheduling: ReadScheduling
    private var registry = CapabilityRegistry()
    private var rootURL: URL?
    private var expectedHashes: [String: String] = [:]
    private var generation = UUID()

    init(log: EventLog, scheduling: ReadScheduling? = nil) {
        self.log = log
        scopes = ScopeCounter(log: log)
        readScheduling = scheduling ?? WorkQueueReadScheduling(queue: work)
    }

    /// 当前活跃安全作用域读计数。非沙盒 CLI 下 startAccessing 亦返回 true，
    /// 计数可用作 lease 对称释放的断言，但不构成任何 OS 授权证据。
    var currentScopeCount: Int { scopes.currentCount() }

    var document: DocumentIdentity { state.sync { registry.current } }

    func isCurrent(token: UUID) -> Bool {
        state.sync { (try? registry.resolve(token, for: registry.current)) != nil }
    }

    func authorize(root: URL, manifest: FixtureManifest) {
        state.sync {
            registry = CapabilityRegistry()
            rootURL = root
            generation = UUID()
            expectedHashes = Dictionary(uniqueKeysWithValues: manifest.files.compactMap { record in
                guard record.kind == "png" || record.kind == "jpeg", let sha = record.sha256 else { return nil }
                return (record.relativePath, sha)
            })
        }
        log.emit("authorization-installed", ["document": document.id.uuidString, "epoch": document.epoch.uuidString])
    }

    func register(encodedPath: String) throws -> ResourceCapability {
        let capability = try state.sync { try registry.register(encodedPath: encodedPath) }
        log.emit("resource-token-created", [
            "document": capability.documentID.uuidString,
            "epoch": capability.epoch.uuidString,
            "token": capability.token.uuidString
        ])
        return capability
    }

    func beginNewEpoch() {
        state.sync {
            registry.beginNewEpoch()
            generation = UUID()
        }
        log.emit("document-epoch", ["document": document.id.uuidString, "epoch": document.epoch.uuidString])
    }

    func revoke() {
        state.sync {
            registry.revoke()
            rootURL = nil
            expectedHashes = [:]
            generation = UUID()
        }
        log.emit("authorization-revoked")
    }

    func read(token: UUID, completion: @escaping (BrokerReadResult) -> Void) {
        let prepared: (URL, ResourceCapability, String, UUID)
        do {
            prepared = try state.sync {
                let capability = try registry.resolve(token, for: registry.current)
                guard let rootURL else { throw BrokerPolicyError.revoked }
                guard let expected = expectedHashes[capability.relativePath.value] else {
                    throw BrokerPolicyError.unknownToken
                }
                return (rootURL, capability, expected, generation)
            }
        } catch {
            completion(BrokerReadResult(data: nil, mimeType: nil, sha256: nil, error: String(describing: error)))
            return
        }

        let lease = SecurityScopeLease(url: prepared.0, counter: scopes)
        log.emit("native-read-start", ["token": token.uuidString])
        readScheduling.perform {
            withExtendedLifetime(lease) {
                let deliver: (BrokerReadResult) -> Void = { output in
                    let accepted = self.state.sync { () -> Bool in
                        guard self.generation == prepared.3 else { return false }
                        completion(output)
                        return true
                    }
                    if !accepted {
                        self.log.emit("native-read-stale", ["token": token.uuidString])
                        completion(BrokerReadResult(data: nil, mimeType: nil, sha256: nil, error: "document-generation-changed"))
                    }
                }
                let result = readFileNoFollow(root: prepared.0, path: prepared.1.relativePath)
                guard result.status == .success, let data = result.data else {
                    self.log.emit("native-read-result", [
                        "token": token.uuidString,
                        "status": result.status.rawValue,
                        "errno": result.errnoValue.map(String.init) ?? "none"
                    ])
                    deliver(BrokerReadResult(data: nil, mimeType: nil, sha256: nil, error: result.detail))
                    return
                }
                let sha = dataSHA256(data)
                guard sha == prepared.2 else {
                    self.log.emit("native-read-result", ["token": token.uuidString, "status": "sha-mismatch", "sha256": sha])
                    deliver(BrokerReadResult(data: nil, mimeType: nil, sha256: sha, error: "fixture-sha-mismatch"))
                    return
                }
                guard let mime = detectedMIME(data, extension: prepared.1.relativePath.components.last?.split(separator: ".").last.map(String.init) ?? "") else {
                    self.log.emit("native-read-result", ["token": token.uuidString, "status": "mime-rejected", "sha256": sha])
                    deliver(BrokerReadResult(data: nil, mimeType: nil, sha256: sha, error: "mime-rejected"))
                    return
                }
                self.log.emit("native-read-result", ["token": token.uuidString, "status": "success", "sha256": sha])
                deliver(BrokerReadResult(data: data, mimeType: mime, sha256: sha, error: nil))
            }
        }
    }
}
