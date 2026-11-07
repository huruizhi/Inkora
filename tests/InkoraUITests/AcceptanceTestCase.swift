import AppKit
import XCTest

/// Capture at record-time, before test defers terminate the application.
class AcceptanceTestCase: XCTestCase {
  @MainActor private var diagnosticApp: XCUIApplication?
  @MainActor private var snapshotURL: URL?

  @MainActor
  func diagnosticApplication() -> XCUIApplication {
    let app = XCUIApplication()
    if let source = ProcessInfo.processInfo.environment["INKORA_MARKDOWN_SNAPSHOT_SOURCE"]
      ?? ProcessInfo.processInfo.environment["TEST_RUNNER_INKORA_MARKDOWN_SNAPSHOT_SOURCE"]
    {
      let url = URL(fileURLWithPath: source).deletingLastPathComponent()
        .appendingPathComponent("\(UUID().uuidString).md")
      snapshotURL = url
      app.launchEnvironment["INKORA_MARKDOWN_SNAPSHOT_SOURCE"] = url.path
    }
    app.launchArguments = [
      "-ApplePersistenceIgnoreState", "YES", "-AppleInterfaceStyle", "Light",
      "-INKTestDefaultsSuite", "InkoraUITests-\(UUID().uuidString)",
      "--inkora-test-recovery-session", UUID().uuidString,
    ]
    diagnosticApp = app
    return app
  }

  override func record(_ issue: XCTIssue) {
    if Thread.isMainThread {
      MainActor.assumeIsolated {
        if let app = diagnosticApp {
          capture("failure-screen", app: app)
          attach(app.debugDescription, name: "failure-accessibility-tree")
        }
        if let snapshotURL,
          let log = try? String(
            contentsOf: snapshotURL.appendingPathExtension("log"), encoding: .utf8)
        {
          attach(log, name: "failure-app-bridge-log")
        } else {
          attach(
            "App log unavailable before bridge initialization; see artifacts/logs.",
            name: "failure-app-log-unavailable")
        }
        if let snapshotURL, let data = try? Data(contentsOf: snapshotURL) {
          let attachment = XCTAttachment(
            data: data, uniformTypeIdentifier: "net.daringfireball.markdown")
          attachment.name = "failure-current-markdown.md"
          attachment.lifetime = .keepAlways
          add(attachment)
        } else {
          attach(
            "Bridge snapshot unavailable (editor not ready, composition or process failure).",
            name: "failure-snapshot-unavailable")
        }
        attach(
          "App/WebKit logs: artifacts/logs/document-open-ui-system.log; XCTest stdout: document-open-ui.log",
          name: "failure-log-location")
      }
    }
    super.record(issue)
  }

  @MainActor
  func capture(_ name: String, app: XCUIApplication) {
    let attachment = XCTAttachment(screenshot: app.screenshot())
    attachment.name = "acceptance-\(name)"
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func attach(_ text: String, name: String) {
    let attachment = XCTAttachment(string: text)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
}
