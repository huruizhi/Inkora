import Foundation

private var failures: [String] = []

private func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
    if condition() {
        print("PASS \(name)")
    } else {
        failures.append(name)
        print("FAIL \(name)")
    }
}

private func expectError(_ expected: BrokerPolicyError, _ name: String, _ body: () throws -> Void) {
    do {
        try body()
        failures.append(name)
        print("FAIL \(name): accepted")
    } catch let error as BrokerPolicyError {
        expect(error == expected, "\(name) [\(error)]")
    } catch {
        failures.append(name)
        print("FAIL \(name): unexpected \(error)")
    }
}

do {
    let safe = try SafeRelativePath(encoded: "assets/%E5%9B%BE%20100%25.png")
    expect(safe.value == "assets/图 100%.png", "percent-decode-exactly-once")
} catch {
    failures.append("percent-decode-exactly-once")
}

expectError(.traversal, "reject-dot-dot") { _ = try SafeRelativePath(encoded: "assets/%2e%2e/out.png") }
expectError(.absolutePath, "reject-absolute") { _ = try SafeRelativePath(encoded: "/tmp/a.png") }
expectError(.otherScheme, "reject-other-scheme") { _ = try SafeRelativePath(encoded: "file://a.png") }
expectError(.unsupportedExtension, "reject-svg-active-content") { _ = try SafeRelativePath(encoded: "assets/a.svg") }
expectError(.malformedPercentEncoding, "reject-malformed-percent") { _ = try SafeRelativePath(encoded: "assets/a%2.png") }

do {
    let documentID = UUID()
    let token = UUID()
    var registry = CapabilityRegistry(documentID: documentID)
    let capability = try registry.register(encodedPath: "assets/a.png", token: token)
    let resolved = try registry.resolve(token, for: registry.current)
    expect(resolved == capability, "resolve-current-document-token")
    let other = DocumentIdentity(id: UUID(), epoch: registry.current.epoch)
    expectError(.wrongDocument, "reject-cross-document-token") { _ = try registry.resolve(token, for: other) }
    registry.beginNewEpoch()
    expectError(.staleEpoch, "reject-old-epoch-token") {
    _ = try registry.resolve(token, for: DocumentIdentity(id: documentID, epoch: capability.epoch))
    }
    expectError(.unknownToken, "reject-unknown-token") { _ = try registry.resolve(UUID(), for: registry.current) }
    registry.revoke()
    expectError(.revoked, "reject-after-revoke") { _ = try registry.resolve(token, for: registry.current) }
} catch {
    failures.append("capability-registry-setup")
}

var callbacks = CallbackGate()
let canceled = UUID()
expect(callbacks.start(canceled), "callback-task-start")
callbacks.cancel(canceled)
expect(!callbacks.complete(canceled), "cancel-prevents-completion-callback")
let completed = UUID()
expect(callbacks.start(completed), "second-callback-task-start")
expect(callbacks.complete(completed), "completion-delivered-once")
expect(!callbacks.complete(completed), "duplicate-completion-rejected")

if failures.isEmpty {
    print("MODEL CHECK PASSED: 16 assertions; no NSOpenPanel/bookmark/WK runtime claim")
    exit(0)
}
fputs("MODEL CHECK FAILED: \(failures.joined(separator: ", "))\n", stderr)
exit(1)
