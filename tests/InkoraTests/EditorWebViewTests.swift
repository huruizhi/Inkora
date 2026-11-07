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
  func testBridgeFailsSnapshotExplicitlyBeforeReady() throws {
    let delegate = SilentBridgeDelegate()
    let bridge = EditorBridge(delegate: delegate, requestTimeout: .milliseconds(50))
    let webView = WKWebView(frame: .zero)
    bridge.attach(webView: webView)
    bridge.loadDocument(documentID: "timeout-doc", revision: 0, text: "")

    var result: Result<String, Error>?
    bridge.requestSnapshot { snapshotResult in
      result = snapshotResult
    }

    guard case .failure(let error) = result else {
      return XCTFail("Expected a pre-ready snapshot to fail")
    }
    XCTAssertEqual(
      error.localizedDescription,
      EditorBridgeError.editorNotReady.localizedDescription
    )
  }

  @MainActor
  func testReloadReplaysTheQueuedDocumentAfterASecondReadyHandshake() async throws {
    let bundle = Bundle(for: Self.self)
    let initialText = "# Reloaded\n"
    let document = InkoraDocument()
    try document.read(from: Data(initialText.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)

    _ = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('#editor')?.value ?? null"
    ) { $0 as? String == initialText }
    _ = try await webView.evaluateJavaScript("document.querySelector('#editor').value = 'stale'")

    webView.reload()
    let reloaded = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('#editor')?.value ?? null"
    ) { $0 as? String == initialText }

    XCTAssertEqual(reloaded as? String, initialText)
  }

  @MainActor
  func testMissingEditorResourcesProduceAnInitializationErrorView() throws {
    let bundleURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("MissingEditor-\(UUID().uuidString).bundle", isDirectory: true)
    let contentsURL = bundleURL.appendingPathComponent("Contents", isDirectory: true)
    let resourcesURL = contentsURL.appendingPathComponent("Resources", isDirectory: true)
    try FileManager.default.createDirectory(at: resourcesURL, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: bundleURL) }
    let info: [String: Any] = [
      "CFBundleIdentifier": "com.huruizhi.InkoraTests.MissingEditor",
      "CFBundleName": "MissingEditor",
      "CFBundlePackageType": "BNDL",
      "CFBundleVersion": "1",
    ]
    let infoData = try PropertyListSerialization.data(
      fromPropertyList: info,
      format: .xml,
      options: 0
    )
    try infoData.write(to: contentsURL.appendingPathComponent("Info.plist"))
    let missingBundle = try XCTUnwrap(Bundle(url: bundleURL))

    let document = InkoraDocument()
    let controller = EditorViewController(document: document, resourceBundle: missingBundle)
    controller.loadViewIfNeeded()

    let label = try XCTUnwrap(controller.view as? NSTextField)
    XCTAssertTrue(label.stringValue.contains("resources are missing"))
  }

  @MainActor
  func testOnlyTheBundledEditorOriginMayNavigateOrServeResources() throws {
    XCTAssertTrue(
      EditorNavigationPolicy.allows(
        try XCTUnwrap(URL(string: "inkora-editor://app/index.html"))
      )
    )
    XCTAssertFalse(EditorNavigationPolicy.allows(try XCTUnwrap(URL(string: "about:blank"))))
    XCTAssertFalse(
      EditorNavigationPolicy.allows(
        try XCTUnwrap(URL(string: "inkora-editor://other/index.html"))
      )
    )
    XCTAssertFalse(
      EditorNavigationPolicy.allows(try XCTUnwrap(URL(string: "https://example.com")))
    )
    XCTAssertFalse(EditorNavigationPolicy.allows(try XCTUnwrap(URL(string: "about:srcdoc"))))

    let handler = try XCTUnwrap(EditorResourceSchemeHandler(bundle: Bundle(for: Self.self)))
    XCTAssertNoThrow(
      try handler.resolve(URL(string: "inkora-editor://app/index.html"))
    )
    XCTAssertThrowsError(
      try handler.resolve(URL(string: "inkora-editor://other/index.html"))
    )
    XCTAssertThrowsError(
      try handler.resolve(URL(string: "inkora-editor://app/../Info.plist"))
    )
    XCTAssertThrowsError(
      try handler.resolve(URL(string: "inkora-editor://app/index.html?remote=1"))
    )
  }

  func testEditorCSPAllowsScriptsOnlyFromTheBundledOrigin() throws {
    let bundle = Bundle(for: Self.self)
    let indexURL = try XCTUnwrap(
      bundle.url(forResource: "index", withExtension: "html", subdirectory: "editor")
    )
    let html = try String(contentsOf: indexURL, encoding: .utf8)

    XCTAssertTrue(html.contains("script-src inkora-editor://app"))
    XCTAssertTrue(html.contains("connect-src 'none'"))
    XCTAssertTrue(html.contains("frame-src 'none'"))
    XCTAssertFalse(html.contains("script-src http:"))
    XCTAssertFalse(html.contains("script-src https:"))
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
