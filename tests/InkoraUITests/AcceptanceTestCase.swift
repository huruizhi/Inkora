import AppKit
import XCTest

/// Capture at record-time, before test defers terminate the application.
class AcceptanceTestCase: XCTestCase {
  nonisolated(unsafe) private var recordingDiagnostics = false
  @MainActor private var diagnosticApp: XCUIApplication?
  @MainActor private var snapshotURL: URL?

  @MainActor
  func diagnosticApplication(fixedPresentation: Bool = false) -> XCUIApplication {
    let app = XCUIApplication()
    if fixedPresentation { app.launchEnvironment["INKORA_TEST_FIXED_PRESENTATION"] = "1" }
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
    if Thread.isMainThread && !recordingDiagnostics {
      recordingDiagnostics = true
      defer { recordingDiagnostics = false }
      // XCTestCase is not Sendable. This synchronous borrow stays on the
      // checked main thread and never escapes the record callback.
      nonisolated(unsafe) let testCase = self
      MainActor.assumeIsolated {
        if let app = testCase.diagnosticApp {
          let screen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
          screen.name = "acceptance-failure-screen"
          screen.lifetime = .keepAlways
          testCase.add(screen)
          if app.state != .notRunning {
            testCase.attach(app.debugDescription, name: "failure-accessibility-tree")
          }
        }
        if let snapshotURL = testCase.snapshotURL,
          let log = try? String(
            contentsOf: snapshotURL.appendingPathExtension("log"), encoding: .utf8)
        {
          testCase.attach(log, name: "failure-app-bridge-log")
        } else {
          testCase.attach(
            "App log unavailable before bridge initialization; see artifacts/logs.",
            name: "failure-app-log-unavailable")
        }
        if let snapshotURL = testCase.snapshotURL, let data = try? Data(contentsOf: snapshotURL) {
          let attachment = XCTAttachment(
            data: data, uniformTypeIdentifier: "net.daringfireball.markdown")
          attachment.name = "failure-current-markdown.md"
          attachment.lifetime = .keepAlways
          testCase.add(attachment)
        } else {
          testCase.attach(
            "Bridge snapshot unavailable (editor not ready, composition or process failure).",
            name: "failure-snapshot-unavailable")
        }
        testCase.attach(
          "App/WebKit logs: artifacts/logs/document-open-ui-system.log; XCTest stdout: document-open-ui.log",
          name: "failure-log-location")
      }
    }
    super.record(issue)
  }

  @MainActor
  func capture(_ name: String, app: XCUIApplication) {
    let attachment = XCTAttachment(screenshot: app.windows.firstMatch.screenshot())
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
