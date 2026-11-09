import Foundation
import WebKit

// INK-PROT-040 handler-check：直接驱动真实 AssetSchemeTaskCore + ResourceBroker 执行路径。
// 替身仅限两类明确受限出口：AssetTaskOutlet（替系统 WKURLSchemeTask 出口）与调度接缝
// （HeldDelivery/GatedScheduling 控制时序）。broker 状态机、generation 轮换、
// descriptor 逐组件读取、SHA/MIME 校验全部为真实实现；不实例化 WKWebView/App/NSApplication。
// 非 UI 纯 CLI：scope-start=false 不是 OS 授权证据，只断言逻辑层时序。

private var failures: [String] = []
private var passed = 0

private func expect(_ condition: @autoclosure () -> Bool, _ name: String, _ detail: String = "") {
    if condition() {
        passed += 1
        print("PASS \(name)")
    } else {
        failures.append(name)
        print("FAIL \(name) \(detail)")
    }
}

/// 系统出口替身：记录 didReceive/didFinish/didFailWithError 顺序；
/// identity 可显式指定，用于确定性模拟系统 task 对象地址复用。
private final class TaskIdentityToken {}

final class RecordingOutlet: AssetTaskOutlet {
    let identity: ObjectIdentifier
    let request: URLRequest?
    /// 持有默认 identity 的来源对象：ObjectIdentifier 只存地址不持引用，
    /// 不持有会造成地址复用、两次 outlet identity 碰撞（与被测风险同构）。
    private let identityHolder: AnyObject
    private let lock = NSLock()
    private(set) var calls: [String] = []

    init(request: URLRequest?, identity: ObjectIdentifier? = nil) {
        self.request = request
        identityHolder = identity == nil ? TaskIdentityToken() : NSNull()
        self.identity = identity ?? ObjectIdentifier(identityHolder)
    }

    func receive(response: URLResponse) { record("response:\(response.mimeType ?? "-")") }
    func receive(data: Data) { record("data:\(data.count)") }
    func finish() { record("finish") }
    func fail(_ error: Error) { record("fail:\((error as NSError).code)") }

    private func record(_ entry: String) {
        lock.lock()
        calls.append(entry)
        lock.unlock()
    }

    var terminals: [String] { calls.filter { $0 == "finish" || $0.hasPrefix("fail") } }
}

/// 交付接缝替身：回调块入队持有、按指令执行；stop 的 sync 语义原地执行，
/// 使“completion 已入队但未执行时 stop 先落地”与反向顺序都可确定性复现。
final class HeldDelivery: TaskDeliverySeam {
    private let lock = NSLock()
    private var pending: [() -> Void] = []

    func async(_ block: @escaping () -> Void) {
        lock.lock()
        pending.append(block)
        lock.unlock()
    }

    func sync(_ block: @escaping () -> Void) { block() }

    var pendingCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return pending.count
    }

    @discardableResult
    func runOne() -> Bool {
        lock.lock()
        guard !pending.isEmpty else {
            lock.unlock()
            return false
        }
        let block = pending.removeFirst()
        lock.unlock()
        block()
        return true
    }
}

/// 读取调度接缝替身：把真实读取操作驻停到测试放行；读取本体仍是真实执行。
final class GatedScheduling: ReadScheduling {
    private let gate = DispatchSemaphore(value: 0)
    private let done = DispatchSemaphore(value: 0)
    private let queue = DispatchQueue(label: "handler-check.read", attributes: .concurrent)

    func perform(_ operation: @escaping () -> Void) {
        queue.async {
            self.gate.wait()
            operation()
            self.done.signal()
        }
    }

    func releaseRead() { gate.signal() }
    func waitReadDone() {
        guard done.wait(timeout: .now() + 5) == .success else {
            fputs("HANDLER CHECK TIMED OUT: read did not finish\n", stderr)
            exit(1)
        }
        queue.sync(flags: .barrier) {}
    }
}

// 验证真实WK适配器的持有关系；不实例化WKWebView或系统界面。
private final class SystemTaskProbe: NSObject, WKURLSchemeTask {
    let request: URLRequest
    init(request: URLRequest) { self.request = request }
    func didReceive(_ response: URLResponse) {}
    func didReceive(_ data: Data) {}
    func didFinish() {}
    func didFailWithError(_ error: Error) {}
}

// MARK: - 内存事件记录

final class EventRecorder {
    private let lock = NSLock()
    private(set) var lines: [String] = []

    lazy var sink: (String) -> Void = { line in
        self.lock.lock()
        self.lines.append(line)
        self.lock.unlock()
    }

    func events(of type: String) -> [[String: String]] {
        lock.lock()
        defer { lock.unlock() }
        return lines.compactMap { line in
            guard let data = line.data(using: .utf8),
                  let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: String],
                  object["type"] == type else { return nil }
            return object
        }
    }

    /// 确定性等待某类事件达到目标数：读取 lease 的 scope-stop 由 deinit 异步提交，
    /// 事件必然发生（无随机性），只等待其入队完成；有界轮次防挂死。
    func drainUntil(log: EventLog, type: String, count: Int, limit: Int = 10_000) -> Bool {
        for _ in 0..<limit {
            log.synchronize()
            if events(of: type).count >= count { return true }
        }
        return false
    }
}

// MARK: - 真实 fixture

struct HandlerFixture {
    let root: URL
    let png: Data
    let manifest: FixtureManifest
    let goodEncoded = "assets/%E5%9B%BE%20100%25.png"
    let badSHAEncoded = "assets/wrongsha.png"

    init(directory: URL) throws {
        root = directory
        png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")!
        let assets = root.appendingPathComponent("assets", isDirectory: true)
        try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
        try png.write(to: assets.appendingPathComponent("图 100%.png"))
        try png.write(to: assets.appendingPathComponent("wrongsha.png"))
        manifest = FixtureManifest(
            schemaVersion: 1,
            runID: UUID(),
            createdBy: "handler-check",
            files: [
                FixtureFileRecord(
                    relativePath: "assets/图 100%.png",
                    kind: "png",
                    sha256: dataSHA256(png),
                    expected: "read"
                ),
                FixtureFileRecord(
                    relativePath: "assets/wrongsha.png",
                    kind: "png",
                    sha256: String(repeating: "0", count: 64),
                    expected: "sha-mismatch"
                )
            ]
        )
    }
}

/// 每个场景独立的真实 broker + 真实状态机，只有出口/时序是替身。
struct Harness {
    let recorder = EventRecorder()
    let log: EventLog
    let gated = GatedScheduling()
    let delivery = HeldDelivery()
    let broker: ResourceBroker
    let core: AssetSchemeTaskCore

    init(fixture: HandlerFixture) {
        log = EventLog(recording: recorder.sink)
        broker = ResourceBroker(log: log, scheduling: gated)
        broker.authorize(root: fixture.root, manifest: fixture.manifest)
        core = AssetSchemeTaskCore(broker: broker, log: log, delivery: delivery)
    }

    func flushLog() { log.synchronize() }

    func outlet(token: UUID, identity: ObjectIdentifier? = nil) -> RecordingOutlet {
        RecordingOutlet(
            request: URLRequest(url: URL(string: "inkora-asset://resource/\(token.uuidString)")!),
            identity: identity
        )
    }
}

// MARK: - 场景

let scratch = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    .appendingPathComponent("ink-prot-040-handler-check-\(UUID().uuidString)", isDirectory: true)
try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
let fixture = try HandlerFixture(directory: scratch)

// S1 成功路径：单次完成 + lease 持有到读结束 + 真实数据返回
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)

    expect(h.delivery.pendingCount == 0, "s1-no-callback-before-read-done")
    h.flushLog()
    expect(h.recorder.events(of: "scope-start").count == 1, "s1-scope-start-once-while-inflight")
    expect(h.recorder.events(of: "scope-stop").isEmpty, "s1-lease-held-while-read-parked")
    expect(h.broker.currentScopeCount == 1, "s1-lease-count-held-while-read-parked", String(h.broker.currentScopeCount))
    expect(h.recorder.events(of: "native-read-start").count == 1, "s1-native-read-start-logged")

    h.gated.releaseRead()
    h.gated.waitReadDone()
    expect(h.recorder.drainUntil(log: h.log, type: "scope-stop", count: 1), "s1-scope-stop-after-read-end")
    expect(h.broker.currentScopeCount == 0, "s1-lease-count-released-after-read", String(h.broker.currentScopeCount))
    expect(h.delivery.pendingCount == 1, "s1-completion-queued-once")
    expect(h.delivery.runOne(), "s1-delivery-executes")
    expect(outlet.calls == ["response:image/png", "data:\(fixture.png.count)", "finish"], "s1-single-completion-sequence", outlet.calls.description)
    expect(outlet.terminals.count == 1, "s1-exactly-one-terminal")
    h.flushLog()
    expect(h.recorder.events(of: "wk-request").count == 1, "s1-wk-request-logged")
    expect(h.recorder.events(of: "wk-complete").count == 1, "s1-wk-complete-logged")
    expect(h.recorder.events(of: "wk-callback-suppressed").isEmpty, "s1-no-suppression")
} catch {
    failures.append("s1-setup")
    print("FAIL s1-setup \(error)")
}

// S2 stop 在读取完成前落地：回调被抑制，无任何 didReceive/didFinish/didFail
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    h.core.stop(identity: outlet.identity)
    h.gated.releaseRead()
    h.gated.waitReadDone()

    expect(h.delivery.pendingCount == 1, "s2-completion-queued-once")
    h.delivery.runOne()
    expect(outlet.calls.isEmpty, "s2-stop-before-completion-no-task-callback", outlet.calls.description)
    expect(outlet.terminals.isEmpty, "s2-no-terminal-callback")
    h.flushLog()
    expect(h.recorder.events(of: "wk-callback-suppressed").count == 1, "s2-suppression-logged")
    expect(h.recorder.events(of: "wk-complete").isEmpty, "s2-no-complete-after-cancel")
    expect(h.recorder.drainUntil(log: h.log, type: "scope-stop", count: 1), "s2-lease-released-after-cancelled-read")
} catch {
    failures.append("s2-setup")
    print("FAIL s2-setup \(error)")
}

// S3 竞争顺序一：broker 已接受读取并排队 completion，交付块执行前 stop 落地
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    h.gated.releaseRead()
    h.gated.waitReadDone()
    expect(h.delivery.pendingCount == 1, "s3-completion-pending-before-stop")
    h.core.stop(identity: outlet.identity)
    h.delivery.runOne()
    expect(outlet.calls.isEmpty, "s3-stop-before-delivery-execution-suppresses", outlet.calls.description)
    h.flushLog()
    expect(h.recorder.events(of: "wk-callback-suppressed").count == 1, "s3-suppression-logged")

    // 抑制路径的 identity 清理：同 identity 复用（模拟地址复用）的新任务不被误伤
    let token2 = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let recycled = h.outlet(token: token2, identity: outlet.identity)
    h.core.start(recycled)
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.delivery.runOne()
    expect(recycled.calls.count == 3 && recycled.terminals == ["finish"], "s3-identity-clean-after-suppressed", recycled.calls.description)
} catch {
    failures.append("s3-setup")
    print("FAIL s3-setup \(error)")
}

// S4 竞争顺序二：completion 先交付完成，之后才 stop；不得二次回调、不得残留 identity
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.delivery.runOne()
    expect(outlet.terminals == ["finish"], "s4-completion-first")

    h.core.stop(identity: outlet.identity)
    expect(outlet.terminals.count == 1, "s4-late-stop-no-duplicate-terminal", outlet.calls.description)

    // 晚到 stop 不得把已完成 identity 残留进 canceled，误抑制地址复用后的新任务
    let token2 = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let recycled = h.outlet(token: token2, identity: outlet.identity)
    h.core.start(recycled)
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.delivery.runOne()
    expect(recycled.terminals == ["finish"], "s4-late-stop-leaves-no-identity-residue", recycled.calls.description)
} catch {
    failures.append("s4-setup")
    print("FAIL s4-setup \(error)")
}

// S5 读取在途时轮换 epoch：generation 拒绝旧结果，单次 409，无数据返回
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    h.broker.beginNewEpoch()
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.delivery.runOne()
    expect(outlet.calls == ["fail:409"], "s5-epoch-rotation-single-409", outlet.calls.description)
    h.flushLog()
    expect(h.recorder.events(of: "native-read-stale").count == 1, "s5-broker-stale-result-logged")
    expect(h.recorder.events(of: "wk-stale-document-rejected").count == 1, "s5-handler-stale-rejected-logged")
    expect(h.recorder.events(of: "wk-complete").isEmpty, "s5-no-complete-for-stale-generation")
    expect(h.recorder.drainUntil(log: h.log, type: "scope-stop", count: 1), "s5-lease-released-for-stale-read")
} catch {
    failures.append("s5-setup")
    print("FAIL s5-setup \(error)")
}

// S6 读取在途时 revoke：与 epoch 同样单次 409，lease 对称释放
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    h.broker.revoke()
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.delivery.runOne()
    expect(outlet.calls == ["fail:409"], "s6-revoke-inflight-single-409", outlet.calls.description)
    h.flushLog()
    expect(h.recorder.events(of: "wk-stale-document-rejected").count == 1, "s6-stale-rejected-logged")
    expect(h.recorder.drainUntil(log: h.log, type: "scope-stop", count: 1), "s6-lease-released-after-revoke")
} catch {
    failures.append("s6-setup")
    print("FAIL s6-setup \(error)")
}

// S7 revoke 后新请求：同步失败路径也只回调一次
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    h.broker.revoke()
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    expect(h.delivery.pendingCount == 1, "s7-sync-error-queued-once")
    h.delivery.runOne()
    expect(outlet.calls == ["fail:409"], "s7-revoked-token-single-409", outlet.calls.description)
} catch {
    failures.append("s7-setup")
    print("FAIL s7-setup \(error)")
}

// S8 未知 token：同样单次终态
do {
    let h = Harness(fixture: fixture)
    let outlet = h.outlet(token: UUID())
    h.core.start(outlet)
    h.delivery.runOne()
    expect(outlet.calls == ["fail:409"], "s8-unknown-token-single-409", outlet.calls.description)
}

// S9 SHA 不匹配：真实读取成功但内容校验拒绝 → 403，无数据
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.badSHAEncoded).token
    let outlet = h.outlet(token: token)
    h.core.start(outlet)
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.delivery.runOne()
    expect(outlet.calls == ["fail:403"], "s9-sha-mismatch-single-403", outlet.calls.description)
    h.flushLog()
    expect(h.recorder.events(of: "wk-complete").count == 1, "s9-error-completion-logged")
} catch {
    failures.append("s9-setup")
    print("FAIL s9-setup \(error)")
}

// S10 非法请求：URL/token 不合法立即 400，不入 active、不触发 broker 读取
do {
    let h = Harness(fixture: fixture)
    let outlet = RecordingOutlet(request: URLRequest(url: URL(string: "inkora-asset://resource/not-a-uuid")!), identity: nil)
    h.core.start(outlet)
    expect(outlet.calls == ["fail:400"], "s10-malformed-request-immediate-400", outlet.calls.description)
    expect(h.delivery.pendingCount == 0, "s10-no-async-delivery")
    h.flushLog()
    expect(h.recorder.events(of: "wk-request").isEmpty, "s10-no-broker-read-for-bad-request")
}

// S11 两个并发任务互不串扰：各自恰好一次终态
do {
    let h = Harness(fixture: fixture)
    let tokenA = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let tokenB = try h.broker.register(encodedPath: fixture.goodEncoded).token
    let outletA = h.outlet(token: tokenA)
    let outletB = h.outlet(token: tokenB)
    h.core.start(outletA)
    h.core.start(outletB)
    h.gated.releaseRead()
    h.gated.releaseRead()
    h.gated.waitReadDone()
    h.gated.waitReadDone()
    expect(h.delivery.pendingCount == 2, "s11-both-completions-queued")
    h.delivery.runOne()
    h.delivery.runOne()
    expect(outletA.terminals.count == 1 && outletB.terminals.count == 1, "s11-independent-single-terminals")
    expect(!outletA.calls.isEmpty && !outletB.calls.isEmpty, "s11-both-delivered")
} catch {
    failures.append("s11-setup")
    print("FAIL s11-setup \(error)")
}

// S12 WKSchemeTaskOutlet强持有底层task，直至取消后的在途回调真正收口。
// 这排除了原报告所称“旧回调在途但底层task已释放并被同址复用”的默认路径。
do {
    let h = Harness(fixture: fixture)
    let token = try h.broker.register(encodedPath: fixture.goodEncoded).token
    weak var retainedTask: SystemTaskProbe?
    var identity: ObjectIdentifier?
    autoreleasepool {
        let task = SystemTaskProbe(request: URLRequest(url: URL(string: "inkora-asset://resource/\(token.uuidString)")!))
        retainedTask = task
        identity = ObjectIdentifier(task)
        h.core.start(WKSchemeTaskOutlet(task))
    }
    expect(retainedTask != nil, "s12-wk-system-task-retained-during-read")
    h.core.stop(identity: identity!)
    h.gated.releaseRead()
    h.gated.waitReadDone()
    expect(retainedTask != nil, "s12-wk-system-task-retained-until-delivery")
    h.delivery.runOne()
    expect(retainedTask == nil, "s12-wk-system-task-released-after-suppressed-delivery")
} catch {
    failures.append("s12-setup")
    print("FAIL s12-setup \(error)")
}

// exit() 不会执行顶层 defer，故在两个退出分支之前明确清理本轮唯一fixture。
do { try FileManager.default.removeItem(at: scratch) }
catch {
    failures.append("scratch-cleanup")
    print("FAIL scratch-cleanup \(error)")
}

if failures.isEmpty {
    print("HANDLER CHECK PASSED: \(passed) assertions; real AssetSchemeTaskCore/ResourceBroker path, no WKWebView/panel/OS-auth claim")
    exit(0)
}
fputs("HANDLER CHECK FAILED: \(failures.joined(separator: ", "))\n", stderr)
exit(1)
