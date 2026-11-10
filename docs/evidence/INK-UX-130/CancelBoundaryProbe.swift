import Foundation

enum EditorResourceSchemeHandler { static let scheme = "inkora-editor" }
enum BridgeProtocolV1 { static let maxSafeRevision = 9_007_199_254_740_991 }
@main struct Probe {
  @MainActor static func main() async throws {
    let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    let root = directory.appendingPathComponent("fixture", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try Data("alpha\n".utf8).write(to: root.appendingPathComponent("a.md"))
    var replies: [[String: Any]] = []
    var pending: ((Bool) -> Void)?
    var opens = 0
    var ticket: SidebarCatalog.OpenedFile?
    let bridge = SidebarWorkspaceBridge(current: { .init(documentID: "document", revision: 0) },
      chooseFolder: { _ in preconditionFailure("no panels") },
      mayOpen: { _, done in pending = done }, openFile: { _, _, _ in preconditionFailure("verified callback expected") },
      openVerifiedFile: { file, _, done in opens += 1; ticket = file; done(nil) },
      replySink: { replies.append(try! JSONSerialization.jsonObject(with: Data($0.utf8)) as! [String: Any]) })
    bridge.useFolder(.init(root))
    bridge.receive("{\"action\":\"ready\",\"requestID\":\"ready\",\"documentID\":\"document\",\"revision\":0}", trustedMainFrame: true)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "catalog" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    precondition(replies.last?["kind"] as? String == "catalog")
    try JSONSerialization.data(withJSONObject: replies).write(to: directory.appendingPathComponent("native.json"))
    // Run the actual fixed Web connection with intercepted transport, without a DOM.
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["node", directory.appendingPathComponent("web.cjs").path]
    let pipe = Pipe()
    let input = Pipe()
    process.standardOutput = pipe
    process.standardInput = input
    try process.run()
    let openMessage = pipe.fileHandleForReading.availableData
    let webOpen = try JSONSerialization.jsonObject(with: openMessage) as! [String: Any]
    let open = try JSONSerialization.data(withJSONObject: webOpen["open"]!)
    bridge.receive(String(decoding: open, as: UTF8.self), trustedMainFrame: true)
    precondition(pending != nil && opens == 0)
    // The actual Web cancellation now happens while Native mayOpen is pending.
    try input.fileHandleForWriting.write(contentsOf: Data("cancel\n".utf8))
    let response = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    precondition(process.terminationStatus == 0)
    let web = try JSONSerialization.jsonObject(with: response) as! [String: Any]
    precondition(web["cancelPosted"] as? Bool == false)
    print("Web actual cancelSearch: transport posts before=\(web["countBeforeCancel"]!) after=\(web["countAfterCancel"]!), cancelPosted=false")
    // No cancel message exists to deliver to Native. User has already returned to list.
    pending?(true)
    precondition(opens == 1)
    let fresh = try ticket!.revalidatedForNavigation()
    precondition(fresh.data == Data("alpha\n".utf8))
    print("Native delayed mayOpen(true): verified open count=\(opens), old navigation ticket still valid=true")
    // Control: an actual new search DOES reach Native and supersedes navigation.
    let catalog = replies.first(where: { $0["kind"] as? String == "catalog" })!["catalog"] as! [String: Any]
    let context = replies.first!["contextID"] as! String
    let search: [String: Any] = ["action": "search", "requestID": "control-search", "documentID": "document", "revision": 0,
      "contextID": context, "catalogID": catalog["id"]!, "query": "beta",
      "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false]]
    bridge.receive(String(decoding: try JSONSerialization.data(withJSONObject: search), as: UTF8.self), trustedMainFrame: true)
    do { _ = try fresh.revalidatedForNavigation(); preconditionFailure("new Native request must revoke old ticket") }
    catch { print("Control real Native search: previous ticket rejected=true") }
  }
}
