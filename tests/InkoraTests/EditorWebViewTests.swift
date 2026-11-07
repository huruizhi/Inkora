import WebKit
import XCTest

final class EditorWebViewTests: XCTestCase {
  @MainActor
  func testEditorViewControllerLoadsAndReceivesInitialText() async throws {
    let bundle = Bundle(for: Self.self)
    let initialText = "# 中文 🚀\n"
    let document = InkoraDocument()
    try document.read(
      from: Data(initialText.utf8),
      ofType: "net.daringfireball.markdown"
    )
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)

    let value = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('#editor')?.value ?? null"
    ) { $0 as? String == initialText }

    XCTAssertEqual(value as? String, initialText)
    XCTAssertEqual(webView.url?.scheme, "inkora-editor")
  }

  @MainActor
  func testBridgeTimesOutWhenEditorDoesNotReply() async throws {
    let delegate = SilentBridgeDelegate()
    let bridge = EditorBridge(delegate: delegate, requestTimeout: .milliseconds(50))
    let webView = WKWebView(frame: .zero)
    bridge.attach(webView: webView)
    webView.loadHTMLString("<script>window.inkora = { receive() {} };</script>", baseURL: nil)

    let ready = try await waitForJavaScriptValue(
      in: webView,
      script: "window.inkora !== undefined",
      interval: .milliseconds(25)
    ) { $0 as? Bool == true }
    XCTAssertEqual(ready as? Bool, true)
    bridge.loadDocument(documentID: "timeout-doc", revision: 0, text: "")

    let result = await withCheckedContinuation { continuation in
      bridge.requestSnapshot { result in
        continuation.resume(returning: result)
      }
    }

    guard case .failure(let error) = result else {
      return XCTFail("Expected the Bridge request to time out")
    }
    XCTAssertEqual(
      error.localizedDescription,
      EditorBridgeError.requestTimedOut.localizedDescription
    )
  }

  @MainActor
  func testUnmodifiedMarkdownSavesThroughBridgeByteForByte() async throws {
    let bundle = Bundle(for: Self.self)
    for fixture in ["crlf", "no-final-newline", "unicode"] {
      let fixtureURL = try XCTUnwrap(
        bundle.url(
          forResource: fixture,
          withExtension: "md",
          subdirectory: "fixtures"
        )
      )
      let original = try Data(contentsOf: fixtureURL)
      let document = InkoraDocument(editorResourceBundle: bundle)
      try document.read(from: original, ofType: "net.daringfireball.markdown")
      document.makeWindowControllers()

      let controller = try XCTUnwrap(
        document.windowControllers.first?.contentViewController
      )
      let webView = try XCTUnwrap(controller.view as? WKWebView)
      let ready = try await waitForJavaScriptValue(
        in: webView,
        script: "window.inkora !== undefined && document.querySelector('#editor') !== null"
      ) { $0 as? Bool == true }
      XCTAssertEqual(ready as? Bool, true, "Editor did not load: \(fixture)")

      let outputDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent("InkoraTests-\(UUID().uuidString)", isDirectory: true)
      try FileManager.default.createDirectory(
        at: outputDirectory,
        withIntermediateDirectories: true
      )
      defer { try? FileManager.default.removeItem(at: outputDirectory) }
      let outputURL = outputDirectory.appendingPathComponent("\(fixture)-round-trip.md")

      try await withCheckedThrowingContinuation {
        (continuation: CheckedContinuation<Void, Error>) in
        document.save(
          to: outputURL,
          ofType: "net.daringfireball.markdown",
          for: .saveAsOperation
        ) { error in
          if let error {
            continuation.resume(throwing: error)
          } else {
            continuation.resume()
          }
        }
      }

      XCTAssertEqual(
        try Data(contentsOf: outputURL),
        original,
        "Fixture changed through Bridge save: \(fixture)"
      )
      document.close()
    }
  }

  @MainActor
  private func waitForJavaScriptValue(
    in webView: WKWebView,
    script: String,
    attempts: Int = 40,
    interval: Duration = .milliseconds(50),
    until predicate: (Any?) -> Bool
  ) async throws -> Any? {
    var lastValue: Any?
    for _ in 0..<attempts {
      lastValue = try await webView.evaluateJavaScript(script)
      if predicate(lastValue) {
        return lastValue
      }
      try await Task.sleep(for: interval)
    }
    return lastValue
  }
}

@MainActor
private final class SilentBridgeDelegate: EditorBridgeDelegate {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {}
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState) {}
}
