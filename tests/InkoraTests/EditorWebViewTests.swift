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
  func testReloadedDiskContentStartsWithCleanHistory() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "before")
    try await replaceEditorText(in: webView, with: "local")
    try await waitForEditorCommand(.undo, enabled: true, in: controller)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("reload-\(UUID()).md")
    defer { try? FileManager.default.removeItem(at: url) }
    try Data("external".utf8).write(to: url)
    document.fileURL = url
    try document.reloadFromDisk()
    // loadedEditor owns a standalone controller instead of a document window.
    controller.reloadDocument()
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "external"
    }
    try await waitForEditorCommand(.undo, enabled: false, in: controller)
    XCTAssertFalse(controller.canPerformEditorCommand(.redo))
    XCTAssertFalse(document.isDocumentEdited)
    let snapshot = try await requestText(from: controller)
    XCTAssertEqual(snapshot, "external")
    document.close()
  }

  @MainActor
  func testNativeUndoAndRedoFollowEditorState() async throws {
    let (_, controller, webView) = try await loadedEditor(initialText: "before")
    XCTAssertFalse(controller.canPerformEditorCommand(.undo))
    XCTAssertFalse(controller.canPerformEditorCommand(.redo))

    try await replaceEditorText(in: webView, with: "after")
    try await waitForEditorCommand(.undo, enabled: true, in: controller)

    controller.inkoraUndo(nil)
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "before"
    }
    try await waitForEditorCommand(.redo, enabled: true, in: controller)

    controller.inkoraRedo(nil)
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "after"
    }
    try await waitForEditorCommand(.undo, enabled: true, in: controller)
  }

  @MainActor
  func testNativeEditorCommandsAreSerializedAtCurrentRevision() throws {
    let delegate = RecordingBridgeDelegate()
    var scripts: [String] = []
    let bridge = EditorBridge(
      delegate: delegate,
      evaluator: { script, completion in
        scripts.append(script)
        completion(nil)
      }
    )
    bridge.loadDocument(documentID: "command-doc", revision: 0, text: "before")
    bridge.receiveEditorEvent(readyEvent())
    bridge.receiveEditorEvent(
      stateEvent(documentID: "command-doc", revision: 0, canUndo: true, canRedo: false)
    )
    var completions: [String] = []

    bridge.executeEditorCommand(.undo) { error in
      XCTAssertNil(error)
      completions.append("undo")
    }
    bridge.executeEditorCommand(.redo) { error in
      XCTAssertNil(error)
      completions.append("redo")
    }

    var commands = try scripts.compactMap(decodeBridgeCommand).filter {
      $0.type == .executeCommand
    }
    XCTAssertEqual(commands.count, 1)
    XCTAssertEqual(commands[0].command, .undo)
    let undoRequestID = commands[0].requestID

    bridge.receiveEditorEvent(
      stateEvent(
        requestID: undoRequestID,
        documentID: "command-doc",
        revision: 1,
        canUndo: false,
        canRedo: true
      )
    )

    commands = try scripts.compactMap(decodeBridgeCommand).filter {
      $0.type == .executeCommand
    }
    XCTAssertEqual(commands.count, 2)
    XCTAssertEqual(commands[1].command, .redo)
    XCTAssertEqual(commands[1].revision, 1)
    bridge.receiveEditorEvent(
      stateEvent(
        requestID: commands[1].requestID,
        documentID: "command-doc",
        revision: 2,
        canUndo: true,
        canRedo: false
      )
    )
    XCTAssertEqual(completions, ["undo", "redo"])
  }

  @MainActor
  func testSnapshotBarrierTimesOutWhenTheEditorStopsReplying() async throws {
    let delegate = SilentBridgeDelegate()
    let bridge = EditorBridge(
      delegate: delegate,
      requestTimeout: .milliseconds(50),
      evaluator: { _, completion in completion(nil) }
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

    let recoveryView = try XCTUnwrap(controller.view as? EditorRecoveryView)
    XCTAssertTrue(recoveryView.messageLabel.stringValue.contains("resources are missing"))
  }

  @MainActor
  func testTimeoutDiagnosticsContainRequestMetadataButNotDocumentText() async throws {
    let secretText = "private markdown body 机密"
    var events: [BridgeDiagnosticEvent] = []
    let diagnostics = BridgeDiagnostics { event in events.append(event) }
    let delegate = RecordingBridgeDelegate()
    let bridge = EditorBridge(
      delegate: delegate,
      requestTimeout: .milliseconds(25),
      evaluator: { _, completion in completion(nil) },
      diagnostics: diagnostics
    )
    bridge.loadDocument(documentID: "diagnostic-doc", revision: 7, text: secretText)
    bridge.receiveEditorEvent(readyEvent())

    let result = await withCheckedContinuation { continuation in
      bridge.requestSnapshot { continuation.resume(returning: $0) }
    }

    guard case .failure(let error) = result else {
      return XCTFail("Expected snapshot timeout")
    }
    XCTAssertEqual(
      error.localizedDescription, EditorBridgeError.requestTimedOut.localizedDescription)
    let timeoutEvent = try XCTUnwrap(
      events.last { $0.name == .snapshotFailed && $0.category == "timeout" }
    )
    XCTAssertNotNil(timeoutEvent.requestID)
    XCTAssertEqual(timeoutEvent.revision, 7)
    XCTAssertFalse(String(describing: events).contains(secretText))
  }

  @MainActor
  func testInvalidEditorMessageStopsSubsequentSnapshots() throws {
    var events: [BridgeDiagnosticEvent] = []
    let diagnostics = BridgeDiagnostics { event in events.append(event) }
    let delegate = RecordingBridgeDelegate()
    let bridge = EditorBridge(
      delegate: delegate,
      evaluator: { _, completion in completion(nil) },
      diagnostics: diagnostics
    )
    bridge.loadDocument(documentID: "invalid-message-doc", revision: 2, text: "safe")
    bridge.receiveEditorEvent(readyEvent())
    bridge.receiveEditorEvent(
      BridgeEditorEvent(
        protocolVersion: BridgeProtocolV1.version,
        type: .editorError,
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

    var result: Result<String, Error>?
    bridge.requestSnapshot { result = $0 }

    XCTAssertEqual(delegate.unavailableErrors.count, 1)
    guard case .failure(let error) = result else {
      return XCTFail("Expected invalid message to disable snapshots")
    }
    XCTAssertEqual(
      error.localizedDescription, EditorBridgeError.editorUnavailable.localizedDescription)
    XCTAssertTrue(events.contains { $0.name == .invalidMessage })
  }

  @MainActor
  func testProcessTerminationReloadsTheMostRecentConfirmedSnapshot() async throws {
    let (_, controller, webView) = try await loadedEditor(initialText: "initial")
    try await replaceEditorText(in: webView, with: "confirmed")
    let confirmedSnapshot = try await requestText(from: controller)
    XCTAssertEqual(confirmedSnapshot, "confirmed")
    try await replaceEditorText(in: webView, with: "not confirmed")

    controller.webViewWebContentProcessDidTerminate(webView)

    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "confirmed"
    }
    let recoveredSnapshot = try await requestText(from: controller)
    XCTAssertEqual(recoveredSnapshot, "confirmed")
  }

  @MainActor
  func testFailedRecoveryKeepsSavingDisabled() throws {
    var shouldFailRecovery = false
    var events: [BridgeDiagnosticEvent] = []
    let diagnostics = BridgeDiagnostics { event in events.append(event) }
    let delegate = RecordingBridgeDelegate()
    let bridge = EditorBridge(
      delegate: delegate,
      evaluator: { _, completion in
        completion(shouldFailRecovery ? InjectedBridgeFailure() : nil)
      },
      diagnostics: diagnostics
    )
    bridge.loadDocument(documentID: "recovery-doc", revision: 4, text: "confirmed")
    bridge.receiveEditorEvent(readyEvent())
    bridge.webContentProcessDidTerminate()
    shouldFailRecovery = true
    bridge.prepareForRecovery()
    bridge.receiveEditorEvent(readyEvent())

    var result: Result<String, Error>?
    bridge.requestSnapshot { result = $0 }

    XCTAssertEqual(delegate.unavailableErrors.count, 2)
    guard case .failure(let error) = result else {
      return XCTFail("Expected failed recovery to keep saving disabled")
    }
    XCTAssertEqual(
      error.localizedDescription, EditorBridgeError.editorUnavailable.localizedDescription)
    XCTAssertTrue(
      events.contains {
        $0.name == .bridgeUnavailable && $0.category == "javascript_evaluation"
      }
    )
  }

  @MainActor
  func testRemoteErrorActionsRetryNotifyAndStopSaving() throws {
    var events: [BridgeDiagnosticEvent] = []
    let diagnostics = BridgeDiagnostics { event in events.append(event) }
    let delegate = RecordingBridgeDelegate()
    let bridge = EditorBridge(
      delegate: delegate,
      evaluator: { _, completion in completion(nil) },
      diagnostics: diagnostics
    )
    bridge.loadDocument(documentID: "mapping-doc", revision: 9, text: "confirmed")
    bridge.receiveEditorEvent(readyEvent())

    bridge.requestSnapshot { _ in }
    let firstRequestID = try XCTUnwrap(
      events.last { $0.name == .snapshotRequested }?.requestID
    )
    bridge.receiveEditorEvent(
      errorEvent(
        requestID: firstRequestID,
        code: .staleRevision,
        action: .retry
      )
    )
    XCTAssertEqual(events.filter { $0.name == .snapshotRequested }.count, 2)

    let retryRequestID = try XCTUnwrap(
      events.last { $0.name == .snapshotRequested }?.requestID
    )
    bridge.receiveEditorEvent(
      errorEvent(
        requestID: retryRequestID,
        code: .commandRejected,
        action: .notify
      )
    )
    XCTAssertEqual(delegate.recoverableErrors.count, 1)

    bridge.receiveEditorEvent(
      errorEvent(
        requestID: nil,
        code: .internalError,
        action: .stopSaving
      )
    )
    var disabledResult: Result<String, Error>?
    bridge.requestSnapshot { disabledResult = $0 }

    guard case .failure(let error) = disabledResult else {
      return XCTFail("Expected stop_saving to disable snapshots")
    }
    XCTAssertEqual(
      error.localizedDescription, EditorBridgeError.editorUnavailable.localizedDescription)
    XCTAssertTrue(
      events.contains { $0.name == .remoteError && $0.category == "internal_error" }
    )
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
    for fixture in ["crlf", "no-final-newline", "unicode", "utf8-bom", "mixed-eol"] {
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
  func testEditedSnapshotKeepsCRLFLineEndingsAndUnicode() async throws {
    let (_, controller, webView) = try await loadedEditor(
      initialText: "# 标题\r\n正文 e\u{0301} 👩‍💻\r\n"
    )

    // Source-mode documents edit through a textarea; set its value directly
    // and dispatch a real input event so the kernel observes the change.
    let replacement = "第一行\n第二行 组合 e\u{0301}"
    let data = try JSONEncoder().encode(replacement)
    let literal = try XCTUnwrap(String(data: data, encoding: .utf8))
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor');
        editor.value = \(literal);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      })()
      """
    )
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == replacement
    }

    let snapshot = try await requestText(from: controller)

    XCTAssertEqual(snapshot, "第一行\r\n第二行 组合 e\u{0301}")
  }

  @MainActor
  func testSnapshotRejectsUncommittedCompositionAndKeepsContent() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "<x>before</x>")
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor');
        editor.dispatchEvent(new Event('compositionstart'));
        editor.value = '<x>中文</x>';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      })()
      """
    )
    XCTAssertFalse(document.isDocumentEdited, "Composition intermediate state is not published")
    do {
      _ = try await requestText(from: controller)
      XCTFail("Uncommitted composition must not produce a snapshot")
    } catch {
      XCTAssertFalse(document.isDocumentEdited)
    }
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('#editor').dispatchEvent(new Event('compositionend'))"
    )
    let snapshot = try await requestText(from: controller)
    XCTAssertEqual(snapshot, "<x>中文</x>")
    XCTAssertTrue(document.isDocumentEdited)
  }

  @MainActor
  func testBackgroundRecoveryRejectsCompositionWithoutBlurOrHistoryChanges() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "<x>before</x>")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(
      "recovery-ime-\(UUID())")
    defer {
      document.close()
      try? FileManager.default.removeItem(at: root)
    }
    let store = RecoveryStore(directory: root)
    document.configureRecovery(store: store)
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor');
        editor.focus();
        editor.value = '<x>committed</x>';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.recoveryBlurCount = 0;
        editor.addEventListener('blur', () => window.recoveryBlurCount++);
        editor.dispatchEvent(new Event('compositionstart'));
        editor.value = '<x>中间态</x>';
        editor.setSelectionRange(5, 5);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      })()
      """)
    do {
      let snapshot: BridgeSnapshot = try await withCheckedThrowingContinuation { continuation in
        controller.requestRecoverySnapshot { continuation.resume(with: $0) }
      }
      try document.writeRecovery(snapshot)
      XCTFail("Composition must not yield a recovery snapshot")
    } catch { XCTAssertTrue(store.discover().drafts.isEmpty) }
    let blur = try await webView.evaluateJavaScript("window.recoveryBlurCount") as? Int
    XCTAssertEqual(blur, 0)
    let selection =
      try await webView.evaluateJavaScript("document.querySelector('#editor').selectionStart")
      as? Int
    XCTAssertEqual(selection, 5)
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('#editor').dispatchEvent(new Event('compositionend'))")
    let snapshot: BridgeSnapshot = try await withCheckedThrowingContinuation { continuation in
      controller.requestRecoverySnapshot { continuation.resume(with: $0) }
    }
    try document.writeRecovery(snapshot)
    XCTAssertEqual(store.discover().drafts.first?.data, Data("<x>中间态</x>".utf8))
    XCTAssertTrue(controller.canPerformEditorCommand(.undo))
    XCTAssertFalse(controller.canPerformEditorCommand(.redo))
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
    XCTFail("Timed out waiting for JavaScript value; last value: \(String(describing: lastValue))")
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
      // HTML textarea.value normalizes CRLF/CR to LF; disk/snapshot assertions
      // below still require the original line endings byte for byte.
      $0 as? String
        == initialText.replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
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

  @MainActor
  private func waitForEditorCommand(
    _ command: BridgeEditorCommand,
    enabled: Bool,
    in controller: EditorViewController
  ) async throws {
    for _ in 0..<40 {
      if controller.canPerformEditorCommand(command) == enabled {
        return
      }
      try await Task.sleep(for: .milliseconds(50))
    }
    XCTFail("Editor command state did not update: \(command)")
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

private func readyEvent() -> BridgeEditorEvent {
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
}

private func errorEvent(
  requestID: String?,
  code: BridgeErrorCode,
  action: BridgeRecoveryAction
) -> BridgeEditorEvent {
  BridgeEditorEvent(
    protocolVersion: BridgeProtocolV1.version,
    type: .editorError,
    requestID: requestID,
    documentID: "mapping-doc",
    revision: 9,
    state: nil,
    text: nil,
    code: code,
    action: action,
    message: "Fixed diagnostic message"
  )
}

private func stateEvent(
  requestID: String? = nil,
  documentID: String,
  revision: Int,
  canUndo: Bool,
  canRedo: Bool
) -> BridgeEditorEvent {
  BridgeEditorEvent(
    protocolVersion: BridgeProtocolV1.version,
    type: .stateChanged,
    requestID: requestID,
    documentID: nil,
    revision: nil,
    state: BridgeEditorState(
      documentID: documentID,
      revision: revision,
      dirty: canUndo,
      canUndo: canUndo,
      canRedo: canRedo
    ),
    text: nil,
    code: nil,
    action: nil,
    message: nil
  )
}

private func decodeBridgeCommand(from script: String) throws -> BridgeNativeCommand? {
  let prefix = "window.inkora.receive("
  guard script.hasPrefix(prefix), script.hasSuffix(")") else { return nil }
  let literal = String(script.dropFirst(prefix.count).dropLast())
  let serialized = try JSONDecoder().decode(String.self, from: Data(literal.utf8))
  return try JSONDecoder().decode(BridgeNativeCommand.self, from: Data(serialized.utf8))
}

private struct InjectedBridgeFailure: LocalizedError {
  var errorDescription: String? { "Injected failure" }
}

@MainActor
private final class SilentBridgeDelegate: EditorBridgeDelegate {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {}
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState) {}
}

@MainActor
private final class RecordingBridgeDelegate: EditorBridgeDelegate {
  private(set) var unavailableErrors: [Error] = []
  private(set) var recoverableErrors: [Error] = []

  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {}
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState) {}
  func editorBridge(_ bridge: EditorBridge, didReceiveRecoverableError error: Error) {
    recoverableErrors.append(error)
  }
  func editorBridge(_ bridge: EditorBridge, didBecomeUnavailable error: Error) {
    unavailableErrors.append(error)
  }
}
