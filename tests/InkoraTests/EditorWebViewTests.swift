import WebKit
import XCTest

final class EditorWebViewTests: XCTestCase {
  @MainActor
  func testLongDocumentsHaveOneScrollOwner() async throws {
    for prefix in ["<custom>source</custom>\n\n", "# Structured\n\n"] {
      let text = prefix + String(repeating: "长正文内容\n\n", count: 200)
      let document = InkoraDocument()
      try document.read(from: Data(text.utf8), ofType: "net.daringfireball.markdown")
      let controller = EditorViewController(
        document: document, resourceBundle: Bundle(for: Self.self))
      controller.loadViewIfNeeded()
      let webView = try XCTUnwrap(controller.view as? WKWebView)
      _ = try await waitForJavaScriptValue(
        in: webView, script: "!!document.querySelector('#editor')"
      ) {
        $0 as? Bool == true
      }
      webView.setFrameSize(NSSize(width: 900, height: 700))
      let metrics =
        try await webView.evaluateJavaScript(
          """
          (() => {
            const root = document.scrollingElement;
            const editor = document.querySelector('#editor');
            editor.scrollTop = 100;
            return [root.scrollHeight, root.clientHeight,
                    editor.scrollHeight, editor.clientHeight, editor.scrollTop];
          })()
          """) as! [Int]
      XCTAssertLessThanOrEqual(metrics[0], metrics[1], "Page must not scroll")
      XCTAssertGreaterThan(metrics[2], metrics[3], "Editor owns overflow")
      XCTAssertGreaterThan(metrics[4], 0, "Content remains scrollable")
      _ = try await requestText(from: controller)
    }
  }

  @MainActor
  func testProtectedMarkdownRendersAndPreservesSnapshotAfterBodyEdit() async throws {
    let text =
      "---\ntitle: 原样\n---\n\n# 标题\n\n正文\n\n| A  | B |\n| :--- | ---: |\n| x | y |\n\n参见 [[目标|别名]]。\n"
    let document = InkoraDocument()
    try document.read(from: Data(text.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(
      document: document, resourceBundle: Bundle(for: Self.self))
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)
    _ = try await waitForJavaScriptValue(
      in: webView, script: "!!document.querySelector('#editor table')"
    ) {
      $0 as? Bool == true
    }
    let original = try await requestText(from: controller)
    XCTAssertEqual(original, text)
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const p = document.querySelector('#editor > p');
        const range = document.createRange();
        range.setStart(p.firstChild, 0);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return document.execCommand('insertText', false, '修改');
      })()
      """)
    let edited = try await requestText(from: controller)
    XCTAssertEqual(edited, text.replacingOccurrences(of: "正文", with: "修改正文"))
    try await waitForEditorCommand(.undo, enabled: true, in: controller)
    controller.performEditorCommand(.undo)
    _ = try await waitForJavaScriptValue(
      in: webView, script: "document.querySelector('#editor > p').textContent"
    ) {
      $0 as? String == "正文"
    }
    let undone = try await requestText(from: controller)
    XCTAssertEqual(undone, text)
  }

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
    let webView = try XCTUnwrap(
      (controller.view as? WKWebView)
        ?? controller.view.subviews.compactMap { $0 as? WKWebView }.first)

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
    let webView = try XCTUnwrap(
      (controller.view as? WKWebView)
        ?? controller.view.subviews.compactMap { $0 as? WKWebView }.first)

    let beforeReload: BridgeSnapshot
    do {
      beforeReload = try await waitForSnapshot(from: controller)
    } catch {
      XCTFail("Snapshot before reload failed: \(error)")
      return
    }
    XCTAssertEqual(beforeReload.text, initialText)
    do {
      _ = try await webView.evaluateJavaScript(
        "document.documentElement.dataset.inkoraTestPage = 'before-reload'"
      )
    } catch {
      XCTFail("Marking the old page failed: \(error)")
      return
    }

    webView.reload()
    do {
      try await waitForReloadedEditor(in: webView)
    } catch {
      XCTFail("Waiting for the reloaded page failed: \(error)")
      return
    }
    let reloaded: BridgeSnapshot
    do {
      reloaded = try await waitForSnapshot(from: controller)
    } catch {
      XCTFail("Snapshot after reload failed: \(error)")
      return
    }

    XCTAssertEqual(reloaded.documentID, beforeReload.documentID)
    XCTAssertEqual(reloaded.revision, beforeReload.revision)
    XCTAssertEqual(reloaded.text, initialText)
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
  func testCombiningInputPreservesRawCaretAndNativeHistory() async throws {
    // Ordinary DOM text insertion through real WK/PM/Bridge. This is not
    // physical keyboard or system input-method composition evidence.
    for prefix in ["", "\u{FEFF}"] {
      let original = "AeZ\r\n"
      let expected = "Ae\u{301}Z\r\n"
      // Native owns the file's BOM marker; Bridge text excludes that marker.
      let (document, controller, webView) = try await loadedEditor(
        initialText: prefix + original, expectedSnapshotText: original)
      defer { withExtendedLifetime(document) {} }
      XCTAssertEqual(
        try document.data(ofType: "net.daringfireball.markdown"), Data((prefix + original).utf8))
      _ = try await webView.evaluateJavaScript(
        """
        (() => {
          const editor = document.querySelector('#editor');
          editor.focus();
          const range = document.createRange();
          range.setStart(editor.querySelector('p').firstChild, 2);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
        })()
        """)
      let before = try await requestText(from: controller)
      XCTAssertEqual(before, original)
      _ = try await webView.evaluateJavaScript(
        "document.execCommand('insertText', false, '\\u0301')")
      let edited: String
      do {
        edited = try await requestText(from: controller)
      } catch {
        XCTFail("Combining input must remain snapshot eligible: \(error)")
        return
      }
      XCTAssertEqual(Data(edited.utf8), Data(expected.utf8))
      let caret =
        try await webView.evaluateJavaScript(
          """
          (() => {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('#editor p'));
            range.setEnd(selection.anchorNode, selection.anchorOffset);
            return range.toString().length;
          })()
          """) as? Int
      XCTAssertEqual(caret, 3)
      try await waitForEditorCommand(.undo, enabled: true, in: controller)
      controller.inkoraUndo(nil)
      _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
        $0 as? String == "AeZ"
      }
      let undone = try await requestText(from: controller)
      XCTAssertEqual(undone, original)
      try await waitForEditorCommand(.redo, enabled: true, in: controller)
      controller.inkoraRedo(nil)
      _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
        $0 as? String == "Ae\u{301}Z"
      }
      let redone = try await requestText(from: controller)
      XCTAssertEqual(Data(redone.utf8), Data(expected.utf8))
    }
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
  func testImageImportKeepsEnqueueRevisionAndDoesNotRetryAfterItBecomesStale() throws {
    let delegate = RecordingBridgeDelegate()
    var scripts: [String] = []
    let bridge = EditorBridge(
      delegate: delegate,
      evaluator: { script, completion in
        scripts.append(script)
        completion(nil)
      }
    )
    bridge.loadDocument(documentID: "image-doc", revision: 4, text: "before")
    bridge.receiveEditorEvent(readyEvent())
    bridge.receiveEditorEvent(
      stateEvent(documentID: "image-doc", revision: 4, canUndo: true, canRedo: false))
    bridge.executeEditorCommand(.undo)
    var imageError: Error?
    bridge.applyImageImport(
      documentEpoch: UUID(), assetID: UUID(), uri: "inkora-draft://asset/test",
      alt: "", title: nil,
      displayURL: try XCTUnwrap(
        URL(string: "inkora-asset://resource/123e4567-e89b-12d3-a456-426614174000")),
      selectionAnchor: 1, selectionHead: 1
    ) { imageError = $0 }

    var commands = try scripts.compactMap(decodeBridgeCommand).filter {
      $0.type == .executeCommand || $0.type == .applyImageImport
    }
    XCTAssertEqual(commands.count, 1)
    bridge.receiveEditorEvent(
      stateEvent(
        requestID: commands[0].requestID, documentID: "image-doc", revision: 5,
        canUndo: false, canRedo: true))

    commands = try scripts.compactMap(decodeBridgeCommand).filter {
      $0.type == .executeCommand || $0.type == .applyImageImport
    }
    XCTAssertEqual(commands.count, 2)
    XCTAssertEqual(commands[1].type, .applyImageImport)
    XCTAssertEqual(commands[1].revision, 4, "Import must stay bound to its original raw revision")
    bridge.receiveEditorEvent(
      errorEvent(
        requestID: commands[1].requestID, code: .staleRevision, action: .retry))

    XCTAssertNotNil(imageError)
    commands = try scripts.compactMap(decodeBridgeCommand).filter {
      $0.type == .executeCommand || $0.type == .applyImageImport
    }
    XCTAssertEqual(commands.count, 2, "A stale import intent must not move to a newer selection")
  }

  @MainActor
  func testImageOwnerProofRejectsDescriptorAndRewriteAcrossRevision() throws {
    var scripts: [String] = []
    let bridge = EditorBridge(
      delegate: SilentBridgeDelegate(),
      evaluator: { script, completion in
        scripts.append(script)
        completion(nil)
      }
    )
    bridge.loadDocument(documentID: "image-doc", revision: 4, text: "current")
    bridge.receiveEditorEvent(readyEvent())
    bridge.receiveEditorEvent(
      stateEvent(documentID: "image-doc", revision: 4, canUndo: false, canRedo: false))
    let stale = BridgeImageOwnershipProof(
      documentID: "image-doc", revision: 3, raw: "old", imageURIs: ["Old.assets/a.png"])
    var descriptorError: Error?
    bridge.setImageDescriptors(
      documentEpoch: UUID(), ownership: stale, makeDescriptors: { [] },
      completion: { descriptorError = $0 })
    var rewriteError: Error?
    bridge.prepareImageSave(
      documentEpoch: UUID(), ownership: stale,
      rewrites: [
        BridgeImageRewrite(
          assetID: UUID().uuidString.lowercased(), from: "inkora-draft://asset/a",
          to: "Note.assets/a.png")
      ]
    ) { rewriteError = $0 }

    XCTAssertEqual(
      descriptorError?.localizedDescription,
      EditorBridgeError.staleRevision.localizedDescription)
    XCTAssertEqual(
      rewriteError?.localizedDescription,
      EditorBridgeError.staleRevision.localizedDescription)
    XCTAssertFalse(
      try scripts.compactMap(decodeBridgeCommand).contains {
        $0.type == .setImageDescriptors || $0.type == .prepareImageSave
      },
      "A stale proof must not enqueue resource mutations")
  }

  @MainActor
  func testAcknowledgedImageDescriptorLoadsVerifiedPNGThroughRealSchemeHandler() async throws {
    let scratch = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: scratch) }
    let png = Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )!
    let document = InkoraDocument()
    document.configureRecovery(store: RecoveryStore(directory: scratch))
    let asset = try document.importPastedPNG(png, authorizedDirectory: nil)
    try document.localImages().markInsertionAccepted(assetID: asset.id)
    let raw = "![verified](\(asset.markdownURI))\n"
    try document.read(from: Data(raw.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(
      document: document, resourceBundle: Bundle(for: Self.self))
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)
    _ = try await waitForJavaScriptValue(
      in: webView,
      script: """
        (() => {
          const image = document.querySelector('#editor .image-node img');
          return !!image && image.complete && image.naturalWidth === 1 && image.naturalHeight === 1;
        })()
        """
    ) { $0 as? Bool == true }
    let snapshot = try await requestSnapshot(from: controller)
    XCTAssertEqual(snapshot.text, raw)
    XCTAssertEqual(try snapshot.requireImageOwnership().imageURIs, [asset.markdownURI])
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
    withExtendedLifetime(document) {}
  }

  @MainActor
  func testStaleDescriptorProofIsRejectedBeforeBrokerProvisioning() throws {
    let bridge = EditorBridge(
      delegate: SilentBridgeDelegate(), evaluator: { _, completion in completion(nil) })
    bridge.loadDocument(documentID: "image-doc", revision: 4, text: "current")
    bridge.receiveEditorEvent(readyEvent())
    bridge.receiveEditorEvent(
      stateEvent(documentID: "image-doc", revision: 4, canUndo: false, canRedo: false))
    let broker = DocumentAssetBroker()
    let epoch = broker.beginDocument(documentID: "image-doc")
    let stale = BridgeImageOwnershipProof(
      documentID: "image-doc", revision: 3, raw: "old", imageURIs: ["a.png"])
    var providerRan = false
    var receivedError: Error?

    bridge.setImageDescriptors(
      documentEpoch: epoch, ownership: stale,
      makeDescriptors: {
        providerRan = true
        _ = try broker.provision(
          documentID: "image-doc", epoch: epoch,
          rootURL: FileManager.default.temporaryDirectory,
          percentEncodedRelativePath: "a.png", sha256: String(repeating: "0", count: 64),
          mimeType: "image/png")
        return []
      },
      completion: { receivedError = $0 })

    XCTAssertFalse(providerRan)
    XCTAssertEqual(broker.capabilityCounts.live, 0)
    XCTAssertEqual(broker.capabilityCounts.provisional, 0)
    XCTAssertEqual(
      receivedError?.localizedDescription,
      EditorBridgeError.staleRevision.localizedDescription)
  }

  @MainActor
  func testDescriptorAckAfterNewerStateRollsBackProvisionalCapability() throws {
    var scripts: [String] = []
    let bridge = EditorBridge(
      delegate: SilentBridgeDelegate(),
      evaluator: { script, completion in
        scripts.append(script)
        completion(nil)
      })
    bridge.loadDocument(documentID: "image-doc", revision: 4, text: "![a](a.png)")
    bridge.receiveEditorEvent(readyEvent())
    bridge.receiveEditorEvent(
      stateEvent(documentID: "image-doc", revision: 4, canUndo: false, canRedo: false))
    let broker = DocumentAssetBroker()
    let epoch = broker.beginDocument(documentID: "image-doc")
    let ownership = BridgeImageOwnershipProof(
      documentID: "image-doc", revision: 4, raw: "![a](a.png)", imageURIs: ["a.png"])
    var completionError: Error?
    var tokens: [UUID] = []

    bridge.setImageDescriptors(
      documentEpoch: epoch, ownership: ownership,
      makeDescriptors: {
        let capability = try broker.provision(
          documentID: "image-doc", epoch: epoch,
          rootURL: FileManager.default.temporaryDirectory,
          percentEncodedRelativePath: "a.png", sha256: String(repeating: "0", count: 64),
          mimeType: "image/png")
        tokens = [capability.token]
        return [
          BridgeImageDescriptor(
            href: "a.png", status: .ready, displayURL: capability.url.absoluteString,
            message: nil)
        ]
      },
      completion: { error in
        completionError = error
        if error == nil {
          try? broker.commitProvisional(tokens: tokens)
        } else {
          broker.discardProvisional(tokens: tokens)
        }
      })
    let command = try XCTUnwrap(
      scripts.compactMap(decodeBridgeCommand).last { $0.type == .setImageDescriptors })
    XCTAssertEqual(broker.capabilityCounts.provisional, 1)

    bridge.receiveEditorEvent(
      stateEvent(documentID: "image-doc", revision: 5, canUndo: true, canRedo: false))
    bridge.receiveEditorEvent(
      stateEvent(
        requestID: command.requestID, documentID: "image-doc", revision: 4,
        canUndo: false, canRedo: false))

    XCTAssertEqual(
      completionError?.localizedDescription,
      EditorBridgeError.staleRevision.localizedDescription)
    XCTAssertEqual(broker.capabilityCounts.live, 0)
    XCTAssertEqual(broker.capabilityCounts.provisional, 0)
    XCTAssertEqual(broker.read(token: try XCTUnwrap(tokens.first)).status, .stale)
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
    XCTAssertEqual(recoveryView.accessibilityIdentifier(), "EditorRecovery")
    XCTAssertEqual(recoveryView.retryButton.accessibilityIdentifier(), "ReloadEditorButton")
    XCTAssertEqual(recoveryView.retryButton.accessibilityRole(), .button)
    XCTAssertEqual(recoveryView.retryButton.title, "Reload Editor")
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
    let (document, controller, webView) = try await loadedEditor(initialText: "initial")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(
      "web-recovery-\(UUID())")
    let store = RecoveryStore(directory: root)
    document.configureRecovery(store: store)
    defer {
      document.close()
      try? FileManager.default.removeItem(at: root)
    }
    try await replaceEditorText(in: webView, with: "confirmed")
    let confirmedSnapshot = try await requestText(from: controller)
    XCTAssertEqual(confirmedSnapshot, "confirmed")
    try document.writeRecovery(
      BridgeSnapshot(
        documentID: document.bridgeDocumentID,
        revision: document.bridgeRevision, text: confirmedSnapshot))
    try await replaceEditorText(in: webView, with: "not confirmed")

    controller.webViewWebContentProcessDidTerminate(webView)

    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "confirmed"
    }
    let recoveredSnapshot = try await requestText(from: controller)
    XCTAssertEqual(recoveredSnapshot, "confirmed")
    XCTAssertTrue(document.isDocumentEdited, "Replaying an unsaved snapshot cannot mark it saved")
    XCTAssertEqual(store.discover().drafts.first?.data, Data("confirmed".utf8))
  }

  @MainActor
  func testProcessReplayOfLatestUnsavedSnapshotKeepsDirtyAndDraft() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "initial")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(
      "latest-recovery-\(UUID())")
    let store = RecoveryStore(directory: root)
    document.configureRecovery(store: store)
    defer {
      document.close()
      try? FileManager.default.removeItem(at: root)
    }
    try await replaceEditorText(in: webView, with: "unsaved")
    let text = try await requestText(from: controller)
    try document.writeRecovery(
      BridgeSnapshot(
        documentID: document.bridgeDocumentID,
        revision: document.bridgeRevision, text: text))
    _ = try await webView.evaluateJavaScript("window.inkoraRecoveryOldPage = true")
    controller.webViewWebContentProcessDidTerminate(webView)
    var reloaded = false
    for _ in 0..<100 {
      let ready = try? await webView.evaluateJavaScript(
        "window.inkoraRecoveryOldPage !== true && document.querySelector('#editor') !== null")
      if ready as? Bool == true {
        reloaded = true
        break
      }
      try await Task.sleep(for: .milliseconds(50))
    }
    XCTAssertTrue(reloaded, "A new Web page must load before checking recovered dirty")
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == "unsaved"
    }
    _ = try await requestText(from: controller)
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertEqual(store.discover().drafts.first?.data, Data("unsaved".utf8))
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
      let webView = try XCTUnwrap(
        (controller.view as? WKWebView)
          ?? controller.view.subviews.compactMap { $0 as? WKWebView }.first)
      let ready = try await waitForJavaScriptValue(
        in: webView,
        script: "window.inkora !== undefined && document.querySelector('#editor') !== null"
      ) { $0 as? Bool == true }
      XCTAssertEqual(ready as? Bool, true, "Editor did not load: \(fixture)")

      if fixture == "mixed-eol" {
        let snapshot = try await requestText(from: controller as! EditorViewController)
        XCTAssertEqual(Data(snapshot.utf8), original)
        XCTAssertThrowsError(try document.data(ofType: "net.daringfireball.markdown"))
        document.close()
        continue
      }

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

    let replacement = "第一行\n第二行 组合 e\u{0301}"
    try await enterSourceMode(in: webView)
    try await replaceSourceDraft(in: webView, with: replacement)
    try await applySourceDraft(in: webView)

    let snapshot = try await requestText(from: controller)

    XCTAssertEqual(snapshot, "第一行\r\n第二行 组合 e\u{0301}")
  }

  @MainActor
  func testCRLFStructuredGoldenSnapshotsAndBOMSaves() async throws {
    let bundle = Bundle(for: Self.self)
    for name in ["crlf-structured", "crlf-structured-final"] {
      for bom in [Data(), Data([0xEF, 0xBB, 0xBF])] {
        let inputURL = try XCTUnwrap(
          bundle.url(forResource: name + ".input", withExtension: "md", subdirectory: "fixtures"))
        let expectedURL = try XCTUnwrap(
          bundle.url(forResource: name + ".expected", withExtension: "md", subdirectory: "fixtures")
        )
        let input = try Data(contentsOf: inputURL)
        let expected = try Data(contentsOf: expectedURL)
        var snapshotController: EditorViewController?
        let document = InkoraDocument(snapshotRequester: { completion in
          snapshotController!.requestSnapshot(completion: completion)
        })
        try document.read(from: bom + input, ofType: "net.daringfireball.markdown")
        let controller = EditorViewController(document: document, resourceBundle: bundle)
        controller.loadViewIfNeeded()
        let webView = try XCTUnwrap(
          (controller.view as? WKWebView)
            ?? controller.view.subviews.compactMap { $0 as? WKWebView }.first)
        _ = try await waitForJavaScriptValue(
          in: webView,
          script: "document.querySelector('#editor.ProseMirror') !== null"
        ) { $0 as? Bool == true }
        let originalSnapshot = try await requestText(from: controller)
        XCTAssertEqual(Data(originalSnapshot.utf8), input)
        XCTAssertEqual(try document.data(ofType: "net.daringfireball.markdown"), bom + input)
        _ = try await webView.evaluateJavaScript(
          """
          (() => {
            const paragraph = document.querySelector('#editor p');
            const range = document.createRange();
            range.setStart(paragraph.firstChild, 0);
            range.collapse(true);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            return document.execCommand('insertText', false, '改后');
          })()
          """)
        let snapshot = try await requestText(from: controller)
        XCTAssertEqual(Data(snapshot.utf8), expected, "Snapshot: \(snapshot.debugDescription)")
        XCTAssertGreaterThan(document.bridgeRevision, 0)
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(
          "crlf-save-\(UUID()).md")
        defer { try? FileManager.default.removeItem(at: outputURL) }
        snapshotController = controller
        try await withCheckedThrowingContinuation {
          (continuation: CheckedContinuation<Void, Error>) in
          document.save(to: outputURL, ofType: "net.daringfireball.markdown", for: .saveAsOperation)
          {
            error in
            if let error { continuation.resume(throwing: error) } else { continuation.resume() }
          }
        }
        XCTAssertEqual(try Data(contentsOf: outputURL), bom + expected)
        controller.confirmSaved(
          BridgeSnapshot(
            documentID: document.bridgeDocumentID,
            revision: document.bridgeRevision, text: snapshot))
        document.close()
      }
    }
  }

  @MainActor
  func testBareCRConversionButtonLoadsEditableSessionWithUndo() async throws {
    let document = InkoraDocument(editorResourceBundle: Bundle(for: Self.self))
    try document.read(
      from: Data("<x>中文</x>\r第二行\r\n".utf8),
      ofType: "net.daringfireball.markdown")
    document.makeWindowControllers()
    defer { document.close() }
    let controller = try XCTUnwrap(
      document.windowControllers.first?.contentViewController as? EditorViewController)
    let stack = try XCTUnwrap(controller.view as? NSStackView)
    let button = try XCTUnwrap(stack.views.compactMap { $0 as? NSButton }.first)
    XCTAssertEqual(button.accessibilityIdentifier(), "ConvertBareCRToLF")
    XCTAssertEqual(button.keyEquivalent, "l")
    XCTAssertEqual(button.keyEquivalentModifierMask, [.command, .option])
    let webView = try XCTUnwrap(stack.views.compactMap { $0 as? WKWebView }.first)
    _ = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('#editor')?.readOnly"
    ) { $0 as? Bool == true }
    button.performClick(nil)
    _ = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('#editor.ProseMirror') !== null"
    ) { $0 as? Bool == true }
    let converted = try await requestText(from: controller)
    XCTAssertEqual(converted, "<x>中文</x>\n第二行\n")
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertFalse(
      controller.canPerformEditorCommand(.undo), "Conversion is an explicit irreversible boundary")
    try await enterSourceMode(in: webView)
    try await replaceSourceDraft(in: webView, with: "<x>修改</x>\n第二行\n")
    try await applySourceDraft(in: webView)
    try await waitForEditorCommand(.undo, enabled: true, in: controller)
    controller.performEditorCommand(.undo)
    let undone = try await requestText(from: controller)
    XCTAssertEqual(undone, "<x>中文</x>\n第二行\n")
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertFalse(document.isBareCRReadOnly)
    try await waitForEditorCommand(.redo, enabled: true, in: controller)
    controller.performEditorCommand(.redo)
    let redone = try await requestText(from: controller)
    XCTAssertEqual(redone, "<x>修改</x>\n第二行\n")
    XCTAssertTrue(document.isDocumentEdited)
  }

  @MainActor
  func testMixedAndBareCRRemainInSourceMode() async throws {
    for input in ["first\r\nsecond\nthird", "first\rsecond", "first\rsecond\r\nthird"] {
      let (document, controller, webView) = try await loadedEditor(initialText: input)
      let mode =
        try await webView.evaluateJavaScript(
          "document.querySelector('#editor') instanceof HTMLTextAreaElement ? 'read_only' : 'visual'"
        )
        as? String
      XCTAssertEqual(mode, document.isBareCRReadOnly ? "read_only" : "visual")
      if document.isBareCRReadOnly {
        let readOnly =
          try await webView.evaluateJavaScript("document.querySelector('#editor').readOnly")
          as? Bool
        XCTAssertEqual(readOnly, true)
      }
      let snapshot = try await requestText(from: controller)
      XCTAssertEqual(snapshot, input)
      document.close()
    }
  }

  @MainActor
  func testSnapshotRejectsUncommittedCompositionAndKeepsContent() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "before\n")
    try await beginSyntheticVisualComposition(in: webView, text: "中文")
    XCTAssertFalse(document.isDocumentEdited, "Composition intermediate state is not published")
    do {
      _ = try await requestText(from: controller)
      XCTFail("Uncommitted composition must not produce a snapshot")
    } catch EditorBridgeError.remote(.editorNotReady, .retry, _) {
      XCTAssertFalse(document.isDocumentEdited)
    } catch {
      XCTFail("Unexpected snapshot error: \(error)")
    }
    XCTAssertEqual(document.bridgeRevision, 0)
    let intermediateText =
      try await webView.evaluateJavaScript("document.querySelector('#editor').textContent")
      as? String
    XCTAssertEqual(intermediateText, "中文")
    try await endSyntheticVisualComposition(in: webView)
    let snapshot = try await requestText(from: controller)
    XCTAssertEqual(snapshot, "中文\n")
    XCTAssertEqual(document.bridgeRevision, 1)
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertTrue(controller.canPerformEditorCommand(.undo))
    XCTAssertFalse(controller.canPerformEditorCommand(.redo))
  }

  @MainActor
  func testDebouncedRecoveryPersistsThroughTheRealBridgeStateQuery() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "before")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(
      "real-recovery-\(UUID())")
    let store = RecoveryStore(directory: root)
    document.configureRecovery(store: store, snapshotRequester: controller.requestRecoverySnapshot)
    defer {
      document.close()
      try? FileManager.default.removeItem(at: root)
    }
    try await replaceEditorText(in: webView, with: "durable real bridge")
    for _ in 0..<40 {
      if !store.discover().drafts.isEmpty { break }
      try await Task.sleep(for: .milliseconds(100))
    }
    XCTAssertEqual(store.discover().drafts.first?.data, Data("durable real bridge".utf8))
    XCTAssertTrue(document.isDocumentEdited)
  }

  @MainActor
  func testBackgroundRecoveryRejectsCompositionWithoutBlurOrHistoryChanges() async throws {
    let (document, controller, webView) = try await loadedEditor(initialText: "before\n")
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(
      "recovery-ime-\(UUID())")
    defer {
      document.close()
      try? FileManager.default.removeItem(at: root)
    }
    let store = RecoveryStore(directory: root)
    document.configureRecovery(store: store)
    try await replaceEditorText(in: webView, with: "committed")
    let revisionBeforeComposition = document.bridgeRevision
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor.ProseMirror');
        editor.focus();
        window.recoveryBlurCount = 0;
        editor.addEventListener('blur', () => window.recoveryBlurCount++);
        const text = editor.querySelector('p').firstChild;
        editor.dispatchEvent(new Event('compositionstart', { bubbles: true }));
        text.data = '中间态';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        const range = document.createRange();
        range.setStart(text, 2);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      })()
      """)
    do {
      let snapshot: BridgeSnapshot = try await withCheckedThrowingContinuation { continuation in
        controller.requestRecoverySnapshot { continuation.resume(with: $0) }
      }
      try document.writeRecovery(snapshot)
      XCTFail("Composition must not yield a recovery snapshot")
    } catch EditorBridgeError.remote(.editorNotReady, .retry, _) {
      XCTAssertTrue(store.discover().drafts.isEmpty)
    } catch {
      XCTFail("Unexpected recovery snapshot error: \(error)")
    }
    XCTAssertEqual(document.bridgeRevision, revisionBeforeComposition)
    let blur = try await webView.evaluateJavaScript("window.recoveryBlurCount") as? Int
    XCTAssertEqual(blur, 0)
    let selection =
      try await webView.evaluateJavaScript("window.getSelection().anchorOffset")
      as? Int
    XCTAssertEqual(selection, 2)
    try await endSyntheticVisualComposition(in: webView)
    let snapshot: BridgeSnapshot = try await withCheckedThrowingContinuation { continuation in
      controller.requestRecoverySnapshot { continuation.resume(with: $0) }
    }
    try document.writeRecovery(snapshot)
    XCTAssertEqual(store.discover().drafts.first?.data, Data("中间态\n".utf8))
    XCTAssertEqual(document.bridgeRevision, revisionBeforeComposition + 1)
    XCTAssertTrue(controller.canPerformEditorCommand(.undo))
    XCTAssertFalse(controller.canPerformEditorCommand(.redo))
    controller.performEditorCommand(.undo)
    let undone = try await requestText(from: controller)
    XCTAssertEqual(undone, "committed\n")
    try await waitForEditorCommand(.redo, enabled: true, in: controller)
    controller.performEditorCommand(.redo)
    let redone = try await requestText(from: controller)
    XCTAssertEqual(redone, "中间态\n")
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
    initialText: String,
    expectedSnapshotText: String? = nil
  ) async throws -> (InkoraDocument, EditorViewController, WKWebView) {
    let bundle = Bundle(for: Self.self)
    let document = InkoraDocument()
    try document.read(from: Data(initialText.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(
      (controller.view as? WKWebView)
        ?? controller.view.subviews.compactMap { $0 as? WKWebView }.first)
    _ = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('#editor') !== null"
    ) { $0 as? Bool == true }
    let initialSnapshot = try await waitForSnapshot(from: controller)
    XCTAssertEqual(initialSnapshot.text, expectedSnapshotText ?? initialText)
    return (document, controller, webView)
  }

  @MainActor
  private func waitForReloadedEditor(in webView: WKWebView) async throws {
    var lastError: Error?
    for _ in 0..<40 {
      do {
        let ready =
          try await webView.evaluateJavaScript(
            "document.documentElement.dataset.inkoraTestPage !== 'before-reload' && document.querySelector('#editor') !== null"
          ) as? Bool
        if ready == true { return }
        lastError = nil
      } catch {
        // WKWebView rejects evaluation while the old page is being torn down.
        // A successful evaluation on the new page is still required below.
        lastError = error
      }
      try await Task.sleep(for: .milliseconds(50))
    }
    if let lastError { throw lastError }
    XCTFail("Timed out waiting for the reloaded editor page")
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
  private func enterSourceMode(in webView: WKWebView) async throws {
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.editor-mode-source').click()"
    )
    _ = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('textarea#editor') !== null"
    ) { $0 as? Bool == true }
  }

  @MainActor
  private func replaceSourceDraft(in webView: WKWebView, with text: String) async throws {
    let data = try JSONEncoder().encode(text)
    let literal = try XCTUnwrap(String(data: data, encoding: .utf8))
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('textarea#editor');
        editor.value = \(literal);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      })()
      """
    )
    _ = try await waitForJavaScriptValue(in: webView, script: editorTextScript) {
      $0 as? String == text
    }
  }

  @MainActor
  private func applySourceDraft(in webView: WKWebView) async throws {
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.source-draft-apply').click()"
    )
    _ = try await waitForJavaScriptValue(
      in: webView,
      script: "document.querySelector('.source-draft-apply').disabled"
    ) { $0 as? Bool == true }
  }

  @MainActor
  private func beginSyntheticVisualComposition(
    in webView: WKWebView,
    text replacement: String
  ) async throws {
    let data = try JSONEncoder().encode(replacement)
    let literal = try XCTUnwrap(String(data: data, encoding: .utf8))
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor.ProseMirror');
        const text = editor.querySelector('p').firstChild;
        editor.focus();
        editor.dispatchEvent(new Event('compositionstart', { bubbles: true }));
        text.data = \(literal);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      })()
      """
    )
  }

  @MainActor
  private func endSyntheticVisualComposition(in webView: WKWebView) async throws {
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('#editor.ProseMirror').dispatchEvent(new Event('compositionend', { bubbles: true }))"
    )
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
  private func requestSnapshot(from controller: EditorViewController) async throws
    -> BridgeSnapshot
  {
    try await withCheckedThrowingContinuation { continuation in
      controller.requestSnapshot { result in
        continuation.resume(with: result)
      }
    }
  }

  @MainActor
  private func waitForSnapshot(from controller: EditorViewController) async throws
    -> BridgeSnapshot
  {
    for _ in 0..<40 {
      do {
        return try await requestSnapshot(from: controller)
      } catch EditorBridgeError.editorNotReady {
        try await Task.sleep(for: .milliseconds(50))
      }
    }
    throw EditorBridgeError.editorNotReady
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
