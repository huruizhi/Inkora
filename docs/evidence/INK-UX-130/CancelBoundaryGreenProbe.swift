import Foundation

enum EditorResourceSchemeHandler { static let scheme = "inkora-editor" }
enum BridgeProtocolV1 { static let maxSafeRevision = 9_007_199_254_740_991 }
@main struct Probe {
  @MainActor static func main() async throws {
    let mode = CommandLine.arguments[2]
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
    let webSearch = try JSONSerialization.jsonObject(with: pipe.fileHandleForReading.availableData) as! [String: Any]
    let search = try JSONSerialization.data(withJSONObject: webSearch["search"]!)
    bridge.receive(String(decoding: search, as: UTF8.self), trustedMainFrame: true)
    for _ in 0..<100 {
      if replies.last?["kind"] as? String == "search" { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    precondition(replies.last?["kind"] as? String == "search")
    let searchReply = try JSONSerialization.data(withJSONObject: replies.last!)
    try input.fileHandleForWriting.write(contentsOf: searchReply + Data("\n".utf8))
    let webOpen = try JSONSerialization.jsonObject(with: pipe.fileHandleForReading.availableData) as! [String: Any]
    let open = try JSONSerialization.data(withJSONObject: webOpen["open"]!)
    bridge.receive(String(decoding: open, as: UTF8.self), trustedMainFrame: true)
    precondition(pending != nil && opens == 0)
    if mode == "ticket" {
      pending?(true)
      precondition(opens == 1)
      _ = try ticket!.revalidatedForNavigation()
    }
    // Actual Web cancel happens after Native mayOpen or the review ticket is pending.
    try input.fileHandleForWriting.write(contentsOf: Data("cancel\n".utf8))
    let response = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    precondition(process.terminationStatus == 0)
    let web = try JSONSerialization.jsonObject(with: response) as! [String: Any]
    let cancel = try JSONSerialization.data(withJSONObject: web["cancel"]!)
    print("Web actual cancelSearch [\(mode)]: posts \(web["countBeforeCancel"]!)→\(web["countAfterCancel"]!), targets completed search + open")
    bridge.receive(String(decoding: cancel, as: UTF8.self), trustedMainFrame: true)
    precondition(replies.last?["kind"] as? String == "cancelled")
    precondition(replies.last?["cancelledSearch"] as? Bool == true && replies.last?["cancelledOpen"] as? Bool == true)
    if mode == "ticket" {
      do { _ = try ticket!.revalidatedForNavigation(); preconditionFailure("cancelled review ticket must reject") }
      catch { print("Native cancelled receipt: search=true/open=true; issued review ticket rejected=true") }
    } else {
      pending?(true)
      precondition(opens == 0)
      print("Native cancelled receipt: search=true/open=true; delayed mayOpen(true) verified opens=0")
    }
    // Completed search cancellation also removes the previously issued hit capability.
    bridge.receive(String(decoding: open, as: UTF8.self), trustedMainFrame: true)
    precondition(replies.last?["kind"] as? String == "error")
    print("Cancelled completed-search hit replay rejected=true")
  }
}
