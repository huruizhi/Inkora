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
      script: editorTextScript
    ) { ($0 as? String)?.contains("中文 🚀") == true }

    XCTAssertTrue((value as? String)?.contains("中文 🚀") == true)
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
    let initialText = "<custom-tag>Reloaded</custom-tag>\n"
    let document = InkoraDocument()
    try document.read(from: Data(initialText.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)

    _ = try await waitForJavaScriptValue(
      in: webView,
      script: editorTextScript
    ) { $0 as? String == initialText }
    _ = try await webView.evaluateJavaScript("document.querySelector('#editor').value = 'stale'")

    webView.reload()
    let reloaded = try await waitForJavaScriptValue(
      in: webView,
      script: editorTextScript
    ) { $0 as? String == initialText }

    XCTAssertEqual(reloaded as? String, initialText)
  }

  @MainActor
  func testFastInputAndConcurrentSnapshotsCaptureTheCurrentRevision() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "before")
    try await replaceEditorText(in: webView, with: "快速保存")

    let snapshots = try await requestTexts(count: 2, from: controller)

    XCTAssertEqual(snapshots, ["快速保存", "快速保存"])
    XCTAssertGreaterThanOrEqual(document.bridgeRevision, 1)
  }

  @MainActor
  func testEditingAfterSnapshotRequestDoesNotMutateCapturedText() async throws {
    let (_, controller, webView) = try await loadedEditor(initialText: "before")
    try await replaceEditorText(in: webView, with: "save point")

    let snapshotTask = Task { @MainActor in
      try await self.requestText(from: controller)
    }
    await Task.yield()
    try await replaceEditorText(in: webView, with: "later edit")
    let snapshot = try await snapshotTask.value

    XCTAssertEqual(snapshot, "save point")
    let later = try await requestText(from: controller)
    XCTAssertEqual(later, "later edit")
  }

  @MainActor
  func testUndoThenSnapshotReturnsTheSavedDocumentVersion() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "before")
    try await replaceEditorText(in: webView, with: "after")
    _ = try await requestText(from: controller)
    let revision = document.bridgeRevision
    XCTAssertGreaterThanOrEqual(revision, 1)

    let command = BridgeNativeCommand(
      protocolVersion: BridgeProtocolV1.version,
      type: .executeCommand,
      requestID: "undo-integration",
      documentID: document.bridgeDocumentID,
      revision: revision,
      text: nil,
      command: .undo
    )
    let commandData = try JSONEncoder().encode(command)
    let serialized = try XCTUnwrap(String(data: commandData, encoding: .utf8))
    let literalData = try JSONEncoder().encode(serialized)
    let literal = try XCTUnwrap(String(data: literalData, encoding: .utf8))
    _ = try await webView.evaluateJavaScript("window.inkora.receive(\(literal))")
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "before"
    }

    let snapshot = try await requestText(from: controller)
    XCTAssertEqual(snapshot, "before")
  }

  @MainActor
  func testSnapshotBarrierTimesOutWhenTheEditorStopsReplying() async throws {
    let delegate = SilentBridgeDelegate()
    let bridge = EditorBridge(
      delegate: delegate,
      requestTimeout: .milliseconds(50),
      evaluator: { _, _ in }
    )
    bridge.loadDocument(documentID: "timeout-doc", revision: 0, text: "timeout")
    bridge.receiveEditorEvent(
      BridgeEditorEvent(
        protocolVersion: BridgeProtocolV1.version,
        type: .ready,
        requestID: nil,
        documentID: nil,
        revision: nil,
        state: nil,
        text: nil,
        code: nil,
        action: nil,
        message: nil
      )
    )

    let result = await withCheckedContinuation { continuation in
      bridge.requestSnapshot { snapshotResult in
        continuation.resume(returning: snapshotResult)
      }
    }

    guard case .failure(let error) = result else {
      return XCTFail("Expected snapshot timeout")
    }
    XCTAssertEqual(
      error.localizedDescription,
      EditorBridgeError.requestTimedOut.localizedDescription
    )
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

  @MainActor
  private func loadedEditor(
    initialText: String
  ) async throws -> (InkoraDocument, EditorViewController, WKWebView) {
    let bundle = Bundle(for: Self.self)
    let document = InkoraDocument()
    try document.read(from: Data(initialText.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == initialText
    }
    return (document, controller, webView)
  }

  @MainActor
  private func replaceEditorText(in webView: WKWebView, with text: String) async throws {
    let data = try JSONEncoder().encode(text)
    let literal = try XCTUnwrap(String(data: data, encoding: .utf8))
    let script = """
      (() => {
        const editor = document.querySelector('#editor');
        editor.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        return document.execCommand('insertText', false, \(literal));
      })()
      """
    _ = try await webView.evaluateJavaScript(script)
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == text
    }
  }

  @MainActor
  private func requestText(from controller: EditorViewController) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      controller.requestText { result in
        continuation.resume(with: result)
      }
    }
  }

  @MainActor
  private func requestTexts(
    count: Int,
    from controller: EditorViewController
  ) async throws -> [String] {
    try await withCheckedThrowingContinuation { continuation in
      var results: [String] = []
      var finished = false
      for _ in 0..<count {
        controller.requestText { result in
          guard !finished else { return }
          switch result {
          case .success(let text):
            results.append(text)
            if results.count == count {
              finished = true
              continuation.resume(returning: results)
            }
          case .failure(let error):
            finished = true
            continuation.resume(throwing: error)
          }
        }
      }
    }
  }

  private var editorTextScript: String {
    """
    (() => {
      const editor = document.querySelector('#editor');
      if (!editor) return null;
      return editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent;
    })()
    """
  }
}

@MainActor
private final class SilentBridgeDelegate: EditorBridgeDelegate {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {}
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState) {}
}
