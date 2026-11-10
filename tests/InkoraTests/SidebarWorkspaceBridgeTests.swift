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

  func testSameDocumentTypingDoesNotLoseScanCompletionOrWatcher() async throws {
    let root = try folder()
    let url = root.appendingPathComponent("a.md")
    try Data("alpha".utf8).write(to: url)
    var revision = 0
    var replies: [[String: Any]] = []
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: revision) },
      chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in },
      replySink: { replies.append(self.parse($0)) })
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    // Completion cannot run until this main-actor turn yields.
    revision = 1
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "catalog" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "catalog")
    try Data("changed".utf8).write(to: url)
    bridge.pollChanges()
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "invalidated" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "invalidated")
    let context = try XCTUnwrap(replies.first?["contextID"] as? String)
    // A directory request already queued at revision 0 remains valid at revision 1.
    bridge.receive(request("refresh", context: context), trustedMainFrame: true)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "catalog" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "catalog")
  }

  func testSameDocumentTypingDoesNotLoseSearchCompletion() async throws {
    let root = try folder()
    try Data("alpha".utf8).write(to: root.appendingPathComponent("a.md"))
    var revision = 0
    var replies: [[String: Any]] = []
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: revision) },
      chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in },
      replySink: { replies.append(self.parse($0)) })
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    let context = try XCTUnwrap(replies.first?["contextID"] as? String)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "catalog" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let catalog = try XCTUnwrap(replies.last?["catalog"] as? [String: Any])
    bridge.receive(
      request(
        "search", context: context,
        extra: [
          "catalogID": catalog["id"]!,
          "query": "alpha",
          "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false],
        ]), trustedMainFrame: true)
    revision = 1
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "search" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "search")
    XCTAssertEqual(
      ((replies.last?["result"] as? [String: Any])?["hits"] as? [[String: Any]])?.count, 1)
  }

  func testCrossDocumentScanCompletionCannotReply() async throws {
    let root = try folder()
    try Data("alpha".utf8).write(to: root.appendingPathComponent("a.md"))
    var documentID = "document"
    var replies: [[String: Any]] = []
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: documentID, revision: 0) },
      chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in },
      replySink: { replies.append(self.parse($0)) })
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    documentID = "other-document"
    try await Task.sleep(for: .milliseconds(100))
    XCTAssertEqual(replies.map { $0["kind"] as? String }, ["ready"])
  }

  func testNavigationTicketRechecksBytesAndEveryRequestBoundary() async throws {
    let root = try folder()
    let url = root.appendingPathComponent("a.md")
    let bytes = Data("alpha".utf8)
    try bytes.write(to: url)
    var revision = 0
    var documentID = "document"
    var replies: [[String: Any]] = []
    var opened: SidebarCatalog.OpenedFile?
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: documentID, revision: revision) },
      chooseFolder: { _ in }, mayOpen: { _, done in done(true) },
      openFile: { _, _, _ in XCTFail("unverified fallback") },
      openVerifiedFile: { file, _, done in
        opened = file
        done(nil)
      },
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
    func openTicket() throws -> SidebarCatalog.OpenedFile {
      opened = nil
      bridge.receive(
        request(
          "open", context: context,
          extra: ["revision": revision, "catalogID": catalogID, "fileID": fileID]),
        trustedMainFrame: true)
      return try XCTUnwrap(opened)
    }
    let first = try openTicket()
    let fresh = try first.revalidatedForNavigation()
    XCTAssertEqual(fresh.data, bytes)
    // Preserve the original mtime: exact content/version must still detect changes.
    let modified = try XCTUnwrap(first.modified)
    try Data("other".utf8).write(to: url)
    try FileManager.default.setAttributes([.modificationDate: modified], ofItemAtPath: url.path)
    XCTAssertThrowsError(try fresh.revalidatedForNavigation())
    try bytes.write(to: url)
    let second = try openTicket()
    let refreshed = try second.revalidatedForNavigation()
    revision = 1
    XCTAssertThrowsError(try refreshed.revalidatedForNavigation())
    let third = try openTicket()
    let fourth = try openTicket()
    XCTAssertThrowsError(try third.revalidatedForNavigation())
    XCTAssertNoThrow(try fourth.revalidatedForNavigation())
    documentID = "other"
    XCTAssertThrowsError(try fourth.revalidatedForNavigation())
    documentID = "document"
    let beforeRefresh = try openTicket()
    bridge.receive(
      request("refresh", context: context, extra: ["revision": revision]), trustedMainFrame: true)
    XCTAssertThrowsError(try beforeRefresh.revalidatedForNavigation())
    for _ in 0..<100 {
      if (replies.last?["catalog"] as? [String: Any])?["id"] as? String != catalogID { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    // A load/ready rotates context even if the document identity stays the same.
    bridge.receive(request("ready", extra: ["revision": revision]), trustedMainFrame: true)
    XCTAssertThrowsError(try fourth.revalidatedForNavigation())
  }

  func testCrossDocumentSearchCompletionCannotReply() async throws {
    let root = try folder()
    try Data("alpha".utf8).write(to: root.appendingPathComponent("a.md"))
    var documentID = "document"
    var replies: [[String: Any]] = []
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: documentID, revision: 0) },
      chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in },
      replySink: { replies.append(self.parse($0)) })
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    let context = try XCTUnwrap(replies.first?["contextID"] as? String)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "catalog" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let catalog = try XCTUnwrap(replies.last?["catalog"] as? [String: Any])
    let count = replies.count
    bridge.receive(
      request(
        "search", context: context,
        extra: [
          "catalogID": catalog["id"]!,
          "query": "alpha",
          "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false],
        ]), trustedMainFrame: true)
    documentID = "other"
    try await Task.sleep(for: .milliseconds(100))
    XCTAssertEqual(replies.count, count)
  }

  func testTargetedCancellationRevokesPendingOpenAndTicketsWithoutHurtingNewIntent() async throws {
    let root = try folder()
    let url = root.appendingPathComponent("a.md")
    try Data("alpha".utf8).write(to: url)
    var replies: [[String: Any]] = []
    var pending: [(Bool) -> Void] = []
    var opened: [SidebarCatalog.OpenedFile] = []
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: "document", revision: 0) },
      chooseFolder: { _ in }, mayOpen: { _, done in pending.append(done) },
      openFile: { _, _, _ in XCTFail("verified only") },
      openVerifiedFile: { file, _, done in
        opened.append(file)
        done(nil)
      },
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
    func open(_ id: String, hit: String? = nil) {
      var fields: [String: Any] = ["requestID": id, "catalogID": catalogID, "fileID": fileID]
      fields["hitID"] = hit
      bridge.receive(request("open", context: context, extra: fields), trustedMainFrame: true)
    }
    func cancel(
      _ openID: String?, searchID: String? = nil, inContext: String? = nil, inCatalog: String? = nil
    ) {
      var fields: [String: Any] = ["catalogID": inCatalog ?? catalogID]
      fields["targetOpenRequestID"] = openID
      fields["targetSearchRequestID"] = searchID
      bridge.receive(
        request("cancelSearch", context: inContext ?? context, extra: fields),
        trustedMainFrame: true)
    }
    open("first")
    cancel("first")
    XCTAssertEqual(replies.last?["cancelledOpen"] as? Bool, true)
    pending[0](true)
    XCTAssertTrue(opened.isEmpty)
    open("second")
    pending[1](true)
    let second = try XCTUnwrap(opened.last)
    XCTAssertNoThrow(try second.revalidatedForNavigation())
    cancel("second")
    XCTAssertThrowsError(try second.revalidatedForNavigation())
    open("third")
    open("fourth")
    cancel("third")
    XCTAssertEqual(replies.last?["cancelledOpen"] as? Bool, false)
    pending[2](true)
    XCTAssertEqual(opened.count, 1)
    pending[3](true)
    let fourth = try XCTUnwrap(opened.last)
    XCTAssertEqual(opened.count, 2)
    XCTAssertNoThrow(try fourth.revalidatedForNavigation())
    let count = replies.count
    cancel("fourth", inContext: "old-context")
    cancel("fourth", inCatalog: "old-catalog")
    XCTAssertEqual(replies.count, count)
    XCTAssertNoThrow(try fourth.revalidatedForNavigation())
    cancel("second")
    XCTAssertEqual(replies.last?["cancelledOpen"] as? Bool, false)
    XCTAssertNoThrow(try fourth.revalidatedForNavigation())
    bridge.receive(
      request(
        "search", context: context,
        extra: [
          "requestID": "search-intent", "catalogID": catalogID,
          "query": "alpha",
          "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false],
        ]), trustedMainFrame: true)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "search" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    let hit = try XCTUnwrap(
      ((replies.last?["result"] as? [String: Any])?["hits"] as? [[String: Any]])?.first?["hitID"]
        as? String)
    bridge.receive(
      request(
        "search", context: context,
        extra: [
          "requestID": "new-search", "catalogID": catalogID,
          "query": "alpha",
          "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false],
        ]), trustedMainFrame: true)
    cancel(nil, searchID: "search-intent")
    XCTAssertEqual(replies.last?["cancelledSearch"] as? Bool, false)
    for _ in 0..<100 {
      if replies.last?["requestID"] as? String == "new-search" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "search")
    let newHit = try XCTUnwrap(
      ((replies.last?["result"] as? [String: Any])?["hits"] as? [[String: Any]])?.first?["hitID"]
        as? String)
    XCTAssertNotEqual(hit, newHit)
    cancel(nil, searchID: "new-search")
    XCTAssertEqual(replies.last?["cancelledSearch"] as? Bool, true)
    open("stale-hit", hit: newHit)
    XCTAssertEqual(replies.last?["kind"] as? String, "error")
    XCTAssertEqual(pending.count, 4)
    // Cancelling search/open leaves the catalog and change watcher operational.
    try Data("changed".utf8).write(to: url)
    bridge.pollChanges()
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "invalidated" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    XCTAssertEqual(replies.last?["kind"] as? String, "invalidated")
  }

}
