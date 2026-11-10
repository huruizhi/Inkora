import XCTest

@MainActor
final class SidebarWorkspaceBridgeTests: XCTestCase {
  private func request(_ action: String, context: String? = nil, extra: [String: Any] = [:])
    -> String
  {
    var body: [String: Any] = [
      "action": action, "requestID": UUID().uuidString,
      "documentID": "document", "revision": 0,
    ]
    body["contextID"] = context
    body.merge(extra) { _, new in new }
    return String(data: try! JSONSerialization.data(withJSONObject: body), encoding: .utf8)!
  }

  private func folder() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: url) }
    return url
  }

  private func parse(_ json: String) -> [String: Any] {
    try! JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
  }

  func testUntrustedAndStaleContextsCannotChooseOrOpen() async throws {
    var replies: [[String: Any]] = []
    var choices = 0
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: 0) },
      chooseFolder: { _ in choices += 1 }, mayOpen: { _, done in done(true) },
      openFile: { _, _, _ in XCTFail("unexpected open") },
      replySink: { replies.append(self.parse($0)) })
    bridge.receive(request("ready"), trustedMainFrame: false)
    XCTAssertTrue(replies.isEmpty)
    bridge.receive(request("ready"), trustedMainFrame: true)
    let oldContext = try XCTUnwrap(replies.last?["contextID"] as? String)
    bridge.receive(request("ready"), trustedMainFrame: true)
    let context = try XCTUnwrap(replies.last?["contextID"] as? String)
    XCTAssertNotEqual(oldContext, context)
    bridge.receive(request("chooseFolder", context: oldContext), trustedMainFrame: true)
    bridge.receive(
      request("chooseFolder", context: context, extra: ["revision": 1]), trustedMainFrame: true)
    XCTAssertEqual(choices, 0)
    bridge.receive(request("chooseFolder", context: context), trustedMainFrame: true)
    XCTAssertEqual(choices, 1)
  }

  func testDelayedFolderSelectionCannotReplaceNewContext() async throws {
    var replies: [[String: Any]] = []
    var pending: ((URL?) -> Void)?
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: 0) },
      chooseFolder: { pending = $0 }, mayOpen: { _, done in done(true) },
      openFile: { _, _, _ in XCTFail("unexpected open") },
      replySink: { replies.append(self.parse($0)) })
    bridge.receive(request("ready"), trustedMainFrame: true)
    let context = try XCTUnwrap(replies.last?["contextID"] as? String)
    bridge.receive(request("chooseFolder", context: context), trustedMainFrame: true)
    bridge.receive(request("ready"), trustedMainFrame: true)
    pending?(try folder())
    try await Task.sleep(for: .milliseconds(80))
    XCTAssertEqual(replies.map { $0["kind"] as? String }, ["ready", "ready"])
  }

  func testRefreshSearchVerifiedOpenAndExternalChangeInvalidation() async throws {
    let root = try folder()
    let raw = Data("\u{FEFF}# 标题\r\nalpha\r\n".utf8)
    let url = root.appendingPathComponent("a.md")
    try raw.write(to: url)
    var replies: [[String: Any]] = []
    var opened: SidebarCatalog.OpenedFile?
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: 0, fileURL: url) },
      chooseFolder: { _ in XCTFail("unexpected chooser") }, mayOpen: { _, done in done(true) },
      openFile: { _, _, _ in XCTFail("must consume verified bytes") },
      openVerifiedFile: { file, _, done in
        opened = file
        done(nil)
      },
      replySink: { replies.append(self.parse($0)) })
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    let context = try XCTUnwrap(replies.first?["contextID"] as? String)
    for _ in 0..<100 {
      if replies.contains(where: { $0["kind"] as? String == "catalog" }) { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let catalog = try XCTUnwrap(replies.last?["catalog"] as? [String: Any])
    XCTAssertEqual((catalog["files"] as? [[String: Any]])?.first?["isCurrent"] as? Bool, true)
    let catalogID = try XCTUnwrap(catalog["id"] as? String)
    bridge.receive(
      request(
        "search", context: context,
        extra: [
          "catalogID": catalogID,
          "query": "alpha",
          "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false],
        ]), trustedMainFrame: true)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "search" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let result = try XCTUnwrap(replies.last?["result"] as? [String: Any])
    let hit = try XCTUnwrap((result["hits"] as? [[String: Any]])?.first)
    let fileID = try XCTUnwrap(hit["fileID"] as? String)
    let hitID = try XCTUnwrap(hit["hitID"] as? String)
    bridge.receive(
      request(
        "open", context: context,
        extra: [
          "catalogID": catalogID,
          "fileID": fileID, "hitID": "invented",
        ]), trustedMainFrame: true)
    XCTAssertNil(opened)
    XCTAssertEqual(replies.last?["kind"] as? String, "error")
    bridge.receive(
      request(
        "open", context: context,
        extra: [
          "catalogID": catalogID,
          "fileID": fileID, "hitID": hitID,
        ]), trustedMainFrame: true)
    XCTAssertEqual(opened?.data, raw)
    XCTAssertEqual(opened?.location?.utf16Location, 7)
    try Data("changed".utf8).write(to: url)
    bridge.pollChanges()
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "invalidated" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "invalidated")
    XCTAssertEqual(replies.last?["catalogID"] as? String, catalogID)
    bridge.receive(
      request(
        "open", context: context,
        extra: [
          "catalogID": catalogID,
          "fileID": fileID, "hitID": hitID,
        ]), trustedMainFrame: true)
    XCTAssertEqual(replies.last?["kind"] as? String, "error")
  }

  func testFolderLeaseBalancesReplacementAndDestroyDuringScan() async throws {
    final class Scope: @unchecked Sendable {
      let lock = NSLock()
      var count = 0
      func change(_ amount: Int) {
        lock.lock()
        defer { lock.unlock() }
        count += amount
      }
      func value() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return count
      }
    }
    let scope = Scope()
    let root = try folder()
    try Data(String(repeating: "alpha", count: 100_000).utf8).write(
      to: root.appendingPathComponent("a.md"))
    var bridge: SidebarWorkspaceBridge? = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: 0) }, chooseFolder: { _ in },
      mayOpen: { _, done in done(true) }, openFile: { _, _, _ in })
    weak var weakBridge = bridge
    bridge?.useFolder(
      .init(
        root,
        startAccess: { _ in
          scope.change(1)
          return true
        },
        stopAccess: { _ in scope.change(-1) }))
    XCTAssertEqual(scope.value(), 1)
    bridge?.receive(request("ready"), trustedMainFrame: true)
    bridge = nil
    XCTAssertNil(weakBridge)
    for _ in 0..<100 {
      if scope.value() == 0 { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(scope.value(), 0)
  }
  func testLateOpenErrorAndSupersededSearchCannotReplyIntoNewContext() async throws {
    let root = try folder()
    try Data("alpha".utf8).write(to: root.appendingPathComponent("a.md"))
    var replies: [[String: Any]] = []
    var pendingOpen: ((Error?) -> Void)?
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: 0) },
      chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in },
      openVerifiedFile: { _, _, done in pendingOpen = done },
      replySink: { replies.append(self.parse($0)) })
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    let context = try XCTUnwrap(replies.first?["contextID"] as? String)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "catalog" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let catalog = try XCTUnwrap(replies.last?["catalog"] as? [String: Any])
    let catalogID = try XCTUnwrap(catalog["id"] as? String)
    let fileID = try XCTUnwrap((catalog["files"] as? [[String: Any]])?.first?["id"] as? String)
    bridge.receive(
      request("open", context: context, extra: ["catalogID": catalogID, "fileID": fileID]),
      trustedMainFrame: true)
    XCTAssertNotNil(pendingOpen)
    bridge.receive(
      request(
        "search", context: context,
        extra: [
          "catalogID": catalogID,
          "query": "alpha",
          "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false],
        ]), trustedMainFrame: true)
    bridge.receive(request("ready"), trustedMainFrame: true)
    let count = replies.count
    pendingOpen?(SidebarCatalogError.staleFile)
    try await Task.sleep(for: .milliseconds(80))
    XCTAssertEqual(replies.count, count)
    XCTAssertEqual(replies.last?["kind"] as? String, "catalog")
  }

  func testTimerReleasedOffMainInvalidatesOnInstallationThread() async throws {
    // Ownership transfers to the background task; all accesses are ordered by
    // task completion. This box is only needed to force the last release there.
    final class Owner: @unchecked Sendable {
      var timer: SidebarWorkspaceBridge.WatchTimer?
      init(_ timer: SidebarWorkspaceBridge.WatchTimer) { self.timer = timer }
    }
    XCTAssertTrue(Thread.isMainThread)
    var invalidations = 0
    let timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
      XCTFail("invalidated timer must not fire")
    }
    let owner = Owner(
      SidebarWorkspaceBridge.WatchTimer(
        timer,
        onInvalidated: {
          XCTAssertTrue(Thread.isMainThread)
          XCTAssertFalse(timer.isValid)
          invalidations += 1
        }))
    weak var weakOwner = owner.timer
    await Task.detached {
      XCTAssertFalse(Thread.isMainThread)
      // Exercise explicit cancellation and the last release in a worker thread.
      // Both paths must hand only the registration back to its installation queue.
      owner.timer?.invalidate()
      owner.timer = nil
    }.value
    XCTAssertNil(weakOwner)
    for _ in 0..<100 {
      if invalidations == 1 { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(invalidations, 1)
    XCTAssertFalse(timer.isValid)
    try await Task.sleep(for: .milliseconds(30))
    XCTAssertEqual(invalidations, 1)
  }

}
