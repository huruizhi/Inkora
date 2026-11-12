import AppKit
import WebKit
import XCTest

final class SidebarNavigationTests: XCTestCase {
  @MainActor
  func testFullSizeTitlebarReachesWebViewWithoutCoveringSystemButtons() throws {
    let bundle =
      ProcessInfo.processInfo.environment["INKORA_SIDEBAR_RESOURCE_BUNDLE"]
      .flatMap(Bundle.init(path:)) ?? Bundle(for: Self.self)
    _ = try XCTUnwrap(EditorResourceSchemeHandler(bundle: bundle), "Native测试资源必须包含实际build/editor")
    let document = InkoraDocument(editorResourceBundle: bundle)
    try document.read(from: Data("# 正文标题\n".utf8), ofType: "net.daringfireball.markdown")
    document.makeWindowControllers()
    let controller = try XCTUnwrap(document.windowControllers.first)
    let window = try XCTUnwrap(controller.window)
    defer {
      document.removeWindowController(controller)
      window.close()
    }
    XCTAssertFalse(window.isVisible)
    let webView = try XCTUnwrap(window.contentViewController?.view as? WKWebView)
    let frameView = try XCTUnwrap(window.contentView?.superview)
    frameView.layoutSubtreeIfNeeded()
    let editorFrame = webView.convert(webView.bounds, to: frameView)
    XCTAssertEqual(editorFrame.maxY, frameView.bounds.maxY, accuracy: 1)
    let toolPoint = NSPoint(x: frameView.bounds.maxX - 30, y: frameView.bounds.maxY - 14)
    let hit = try XCTUnwrap(frameView.hitTest(toolPoint))
    XCTAssertTrue(hit === webView || hit.isDescendant(of: webView), "标题行工具必须可被WK点击，而非系统拖动层")
    let close = try XCTUnwrap(window.standardWindowButton(.closeButton))
    XCTAssertLessThan(close.convert(close.bounds, to: frameView).maxX, 90)
    XCTAssertEqual(window.titleVisibility, .hidden)
    XCTAssertTrue(window.titlebarAppearsTransparent)
    XCTAssertFalse(window.isVisible)
    try waitForJavaScript("!!document.querySelector('#editor')", in: webView)
    let titlePoint = NSPoint(x: frameView.bounds.midX, y: frameView.bounds.maxY - 14)
    let dragDeadline = Date().addingTimeInterval(5)
    while frameView.hitTest(titlePoint)?.identifier?.rawValue != "WindowTitlebarDragSurface",
      Date() < dragDeadline
    {
      RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    let titleHit = try XCTUnwrap(frameView.hitTest(titlePoint))
    XCTAssertEqual(
      titleHit.identifier?.rawValue, "WindowTitlebarDragSurface",
      "标题文字与空白必须把鼠标事件交给原生窗口拖动，而不是Web内容")
    for reduced in [false, true] {
      if reduced {
        webView.configuration.userContentController.addUserScript(
          WKUserScript(
            source: """
              const originalMatchMedia = window.matchMedia.bind(window);
              window.matchMedia = query => query === '(prefers-reduced-motion: reduce)'
                ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
                : originalMatchMedia(query);
              window.inkoraReducedMotionFixture = true;
              """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.reload()
        try waitForJavaScript(
          "window.inkoraReducedMotionFixture === true && !!document.querySelector('#editor')",
          in: webView)
      }
      XCTAssertEqual(
        try javaScript(
          "window.inkoraGeometryEditor = document.querySelector('#editor.ProseMirror'); !!window.inkoraGeometryEditor",
          in: webView) as? Bool, true)
      for width: CGFloat in [1280, 600, 480] {
        window.setContentSize(NSSize(width: width, height: 700))
        frameView.layoutSubtreeIfNeeded()
        let start = try XCTUnwrap(
          try javaScript(
            """
            (() => {document.querySelector('.analysis-panel-toggle').click();
            const panel=document.querySelector('.analysis-panel');
            return [panel.dataset.sidebarPhase, matchMedia('(prefers-reduced-motion: reduce)').matches,
              getComputedStyle(panel.querySelector('.analysis-panel-body')).opacity];})()
            """, in: webView) as? [Any])
        if start[1] as? Bool == true {
          XCTAssertEqual(start[0] as? String, "open")
        } else {
          XCTAssertEqual(start[0] as? String, "reserving")
          XCTAssertEqual(start[2] as? String, "0", "正文让位阶段侧栏内容必须隐藏")
        }
        try waitForJavaScript(
          "document.querySelector('.analysis-panel').dataset.sidebarPhase === 'open'", in: webView)
        try assertGeometry(in: webView, width: Double(width), open: true)
        // Stable open resize must move the workspace and panel edge together.
        window.setContentSize(NSSize(width: width + 12, height: 700))
        frameView.layoutSubtreeIfNeeded()
        try assertGeometry(in: webView, width: Double(width + 12), open: true)
        _ = try javaScript(
          "for(let i=0;i<3;i++) document.querySelector('.analysis-panel-toggle').click()",
          in: webView)
        try waitForJavaScript(
          "document.querySelector('.analysis-panel').dataset.sidebarPhase === 'closed'", in: webView
        )
        try assertGeometry(in: webView, width: Double(width + 12), open: false)
        XCTAssertFalse(window.isVisible)
        XCTAssertEqual(
          try javaScript(
            "window.inkoraGeometryEditor !== null && window.inkoraGeometryEditor === document.querySelector('#editor.ProseMirror')",
            in: webView)
            as? Bool, true)
        XCTAssertEqual(document.bridgeRevision, 0)
        XCTAssertFalse(document.isDocumentEdited)
      }
    }
  }

  @MainActor
  private func javaScript(_ script: String, in view: WKWebView) throws -> Any? {
    var completed = false
    var result: Any?
    var failure: Error?
    view.evaluateJavaScript(script) { value, error in
      result = value
      failure = error
      completed = true
    }
    let deadline = Date().addingTimeInterval(5)
    while !completed && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.005))
    }
    guard completed else { throw EditorBridgeError.requestTimedOut }
    if let failure { throw failure }
    return result
  }

  @MainActor
  private func waitForJavaScript(_ predicate: String, in view: WKWebView) throws {
    let deadline = Date().addingTimeInterval(8)
    while Date() < deadline {
      if try javaScript(predicate, in: view) as? Bool == true { return }
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    XCTFail("WK条件未满足：\(predicate)")
    throw EditorBridgeError.requestTimedOut
  }

  @MainActor
  private func assertGeometry(in view: WKWebView, width: Double, open: Bool) throws {
    // Hidden WK can pause animation currentTime at zero despite elapsed wall time.
    // Finish real Web Animations before measuring terminal geometry; this does not
    // prove visible paint or elapsed transition timing (the original red is retained).
    RunLoop.current.run(until: Date().addingTimeInterval(0.3))
    let values = try XCTUnwrap(
      try javaScript(
        """
        (() => {
          document.body.getBoundingClientRect();
          document.getAnimations().forEach(animation => animation.finish());
          const rect = s => document.querySelector(s).getBoundingClientRect();
          const app = rect('#app'), panel = rect('.analysis-panel'), workspace = rect('.editor-workspace');
          const title = rect('.editor-titlebar'), tools = rect('.editor-corner-tools');
          const body = rect('.editor-host');
          return [innerWidth, app.left, panel.right, workspace.left, title.top, tools.left, tools.right, body.left];
        })()
        """, in: view) as? [Double])
    XCTAssertEqual(values[0], width, accuracy: 1)
    let expected = open ? min(240, width <= 640 ? width * 0.45 : 240) : 0
    XCTAssertEqual(values[3] - values[1], expected, accuracy: 1)
    if open {
      XCTAssertEqual(values[2], values[3], accuracy: 1)
      XCTAssertGreaterThanOrEqual(values[7] + 1, values[2])
    }
    XCTAssertEqual(values[4], 0, accuracy: 1)
    XCTAssertGreaterThanOrEqual(values[5], 90)
    XCTAssertLessThanOrEqual(values[6], width)
    let dragX = max(90, values[3]) + 20
    let frameView = try XCTUnwrap(view.superview)
    let dragPoint = NSPoint(x: dragX, y: frameView.bounds.maxY - 14)
    let deadline = Date().addingTimeInterval(3)
    while frameView.hitTest(dragPoint)?.identifier?.rawValue != "WindowTitlebarDragSurface",
      Date() < deadline
    {
      // Hidden WK can suspend its layout notifications until the next query.
      // Flush actual DOM layout; do not inject a synthetic geometry message.
      _ = try javaScript(
        "document.querySelector('.editor-titlebar').getBoundingClientRect().left", in: view)
      RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    XCTAssertEqual(
      frameView.hitTest(dragPoint)?.identifier?.rawValue,
      "WindowTitlebarDragSurface", "width=\(width), open=\(open)")
    XCTAssertNotEqual(
      frameView.hitTest(NSPoint(x: width - 30, y: frameView.bounds.maxY - 14))?.identifier?
        .rawValue,
      "WindowTitlebarDragSurface", "工具按钮保留Web点击")
    XCTAssertNotEqual(
      frameView.hitTest(NSPoint(x: dragX, y: frameView.bounds.maxY - 100))?.identifier?.rawValue,
      "WindowTitlebarDragSurface", "正文保留光标和选区操作")
  }

  @MainActor
  func testExistingDirtyTargetCardReusesSessionAndHitRevalidatesAfterSnapshot() throws {
    for hit in [false, true] {
      let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      defer { try? FileManager.default.removeItem(at: root) }
      let url = root.appendingPathComponent("target.md")
      let raw = "目标正文\n"
      try Data(raw.utf8).write(to: url)
      let catalog = try SidebarCatalog.scan(folder: root)
      let match = try catalog.search("目标", options: SidebarSearchOptions()).hits.first
      let file = try catalog.openFile(
        id: XCTUnwrap(catalog.files.first?.id), catalogID: catalog.id, hit: hit ? match : nil)
      let source = InkoraDocument()
      source.navigationReviewer = { $0(true) }
      var presented = false
      var snapshotRequested = false
      var snapshotCompletion: ((Result<BridgeSnapshot, Error>) -> Void)?
      let editor = EditorViewController(
        document: source, sidebarWindowPresenter: { _ in presented = true })
      let sourceWindow = NSWindow(contentViewController: editor)
      let sourceController = NSWindowController(window: sourceWindow)
      source.addWindowController(sourceController)
      let target = InkoraDocument()
      try target.readSidebarFile(data: file.data, url: url, modified: file.modified)
      target.updateChangeCount(.changeDone)
      let resourceBundle =
        !hit
        ? (ProcessInfo.processInfo.environment["INKORA_SIDEBAR_RESOURCE_BUNDLE"].flatMap(
          Bundle.init(path:)) ?? Bundle(for: Self.self))
        : Bundle.main
      let targetEditor = EditorViewController(
        document: target, resourceBundle: resourceBundle,
        sidebarSnapshotRequester: { completion in
          snapshotRequested = true
          snapshotCompletion = completion
        })
      let targetWindow = NSWindow(contentViewController: targetEditor)
      let targetController = NSWindowController(window: targetWindow)
      target.addWindowController(targetController)
      NSDocumentController.shared.addDocument(target)
      var draftNode: WKWebView?
      if !hit {
        let targetWeb = try XCTUnwrap(targetEditor.view as? WKWebView)
        try waitForJavaScript("!!document.querySelector('#editor')", in: targetWeb)
        _ = try javaScript(
          """
          document.querySelector('.editor-mode-source').click();
          let area = document.querySelector('textarea#editor');
          area.value = '目标未保存编辑\\n';
          area.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:'编辑'}));
          document.querySelector('.source-draft-apply').click();
          document.querySelector('.editor-mode-source').click();
          area = document.querySelector('textarea#editor');
          window.targetDraftNode = area;
          area.value = '尚未提交的目标草稿\\n';
          area.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:'草稿'}));
          """, in: targetWeb)
        draftNode = targetWeb
      }
      defer {
        source.removeWindowController(sourceController)
        target.removeWindowController(targetController)
        NSDocumentController.shared.removeDocument(target)
        sourceWindow.close()
        targetWindow.close()
        target.updateChangeCount(.changeCleared)
      }
      var called = false
      var failure: Error?
      editor.navigateSidebarFile(file, access: SidebarWorkspaceBridge.FolderAccess(root)) {
        called = true
        failure = $0
      }
      if hit {
        XCTAssertTrue(snapshotRequested)
        XCTAssertFalse(called)
        try Data("等待快照期间的外改\n".utf8).write(to: url)
        snapshotCompletion?(
          .success(BridgeSnapshot(documentID: target.bridgeDocumentID, revision: 0, text: raw)))
        XCTAssertTrue(called)
        XCTAssertNotNil(failure)
        XCTAssertFalse(presented)
      } else {
        XCTAssertTrue(called)
        XCTAssertNil(failure)
        XCTAssertFalse(snapshotRequested, "普通卡片不得snapshot阻断目标dirty/源码草稿会话")
        XCTAssertTrue(presented)
        let targetWeb = try XCTUnwrap(draftNode)
        XCTAssertEqual(
          try javaScript("document.querySelector('textarea#editor').value", in: targetWeb)
            as? String, "尚未提交的目标草稿\n")
        XCTAssertEqual(
          try javaScript(
            "window.targetDraftNode === document.querySelector('textarea#editor')", in: targetWeb)
            as? Bool, true)
      }
      XCTAssertTrue(editor.document === source)
      XCTAssertTrue(targetController.window?.contentViewController === targetEditor)
      XCTAssertTrue(target.isDocumentEdited)
      XCTAssertFalse(sourceWindow.isVisible)
      XCTAssertFalse(targetWindow.isVisible)
    }
  }

  @MainActor
  func testPresentationBridgeRequiresAcceptedLoadAckAndSettlesTimeoutOrReload() throws {
    let delegate = SidebarPresentationDelegate()
    var commands: [BridgeNativeCommand] = []
    let bridge = EditorBridge(
      delegate: delegate, requestTimeout: .milliseconds(30),
      evaluator: { script, completion in
        let prefix = "window.inkora.receive("
        if script.hasPrefix(prefix), script.hasSuffix(")") {
          let literal = String(script.dropFirst(prefix.count).dropLast())
          if let json = try? JSONDecoder().decode(String.self, from: Data(literal.utf8)),
            let command = try? JSONDecoder().decode(BridgeNativeCommand.self, from: Data(json.utf8))
          {
            commands.append(command)
          }
        }
        completion(nil)
      })
    func receive(_ json: [String: Any]) throws {
      let event = try JSONDecoder().decode(
        BridgeEditorEvent.self, from: JSONSerialization.data(withJSONObject: json))
      try event.validate()
      bridge.receiveEditorEvent(event)
    }
    bridge.loadDocument(documentID: "presentation-doc", revision: 0, text: "正文\r\n")
    try receive(["protocolVersion": 1, "type": "ready"])
    let load = try XCTUnwrap(commands.last { $0.type == .loadDocument })
    XCTAssertFalse(bridge.canPresentDocument)
    try receive([
      "protocolVersion": 1, "type": "stateChanged", "requestID": load.requestID,
      "state": [
        "documentID": "presentation-doc", "revision": 0, "dirty": false, "canUndo": false,
        "canRedo": false,
      ],
    ])
    XCTAssertTrue(bridge.canPresentDocument)
    var results: [Error?] = []
    bridge.presentDocument(title: "标题.md") { results.append($0) }
    let title = try XCTUnwrap(commands.last)
    XCTAssertEqual(title.loadRequestID, load.requestID)
    XCTAssertNil(title.text)
    try title.validate()
    func ack(_ command: BridgeNativeCommand, loadID: String) throws {
      try receive([
        "protocolVersion": 1, "type": "presentationApplied", "requestID": command.requestID,
        "documentID": "presentation-doc", "revision": 0, "loadRequestID": loadID,
        "outcome": "applied",
      ])
    }
    try ack(title, loadID: "old-load")
    XCTAssertEqual(results.count, 1)
    XCTAssertNotNil(results[0])
    bridge.presentDocument(range: (0, 2)) { results.append($0) }
    let reveal = try XCTUnwrap(commands.last)
    try ack(reveal, loadID: load.requestID)
    XCTAssertEqual(results.count, 2)
    XCTAssertNil(results[1])
    bridge.presentDocument(range: (0, 2)) { results.append($0) }
    let timedOut = try XCTUnwrap(commands.last)
    let deadline = Date().addingTimeInterval(2)
    while results.count < 3 && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertEqual(results.count, 3)
    XCTAssertNotNil(results.last!)
    try ack(timedOut, loadID: load.requestID)
    XCTAssertEqual(results.count, 3)
    bridge.presentDocument(range: (0, 2)) { results.append($0) }
    let cancelled = try XCTUnwrap(commands.last)
    bridge.loadDocument(documentID: "presentation-doc", revision: 0, text: "正文\r\n")
    XCTAssertFalse(bridge.canPresentDocument)
    XCTAssertEqual(results.count, 4)
    XCTAssertNotNil(results.last!)
    try ack(cancelled, loadID: load.requestID)
    XCTAssertEqual(results.count, 4)
  }

  @MainActor
  func testCancelledOpenReviewKeepsSourceThroughProductionBridgeTicket() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try Data("目标\n".utf8).write(to: root.appendingPathComponent("target.md"))
    let source = InkoraDocument()
    var review: ((Bool) -> Void)?
    source.navigationReviewer = { review = $0 }
    let editor = EditorViewController(
      document: source, sidebarDocumentFactory: { _ in InkoraDocument() })
    let window = NSWindow(contentViewController: editor)
    let controller = NSWindowController(window: window)
    source.addWindowController(controller)
    defer {
      if let active = editor.document {
        active.removeWindowController(controller)
        NSDocumentController.shared.removeDocument(active)
      }
      window.close()
    }
    var replies: [[String: Any]] = []
    var error: Error?
    let bridge = SidebarWorkspaceBridge(
      current: { .init(documentID: source.bridgeDocumentID, revision: source.bridgeRevision) },
      chooseFolder: { _ in XCTFail("无需选择目录") }, mayOpen: { _, done in done(true) },
      openFile: { _, _, _ in XCTFail("必须使用验证数据") },
      openVerifiedFile: { file, lease, completion in
        editor.navigateSidebarFile(file, access: lease) { failure in
          error = failure
          completion(failure)
        }
      },
      replySink: { json in
        if let value = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] {
          replies.append(value)
        }
      })
    bridge.useFolder(SidebarWorkspaceBridge.FolderAccess(root))
    func send(_ action: String, id: String, fields: [String: Any] = [:]) throws {
      var json: [String: Any] = [
        "action": action, "requestID": id,
        "documentID": source.bridgeDocumentID, "revision": source.bridgeRevision,
      ]
      json.merge(fields) { _, new in new }
      bridge.receive(
        String(decoding: try JSONSerialization.data(withJSONObject: json), as: UTF8.self),
        trustedMainFrame: true)
    }
    try send("ready", id: "ready")
    let deadline = Date().addingTimeInterval(5)
    while !replies.contains(where: { $0["kind"] as? String == "catalog" }) && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    let reply = try XCTUnwrap(replies.last { $0["kind"] as? String == "catalog" })
    let catalog = try XCTUnwrap(reply["catalog"] as? [String: Any])
    let files = try XCTUnwrap(catalog["files"] as? [[String: Any]])
    let binding: [String: Any] = [
      "contextID": try XCTUnwrap(reply["contextID"]), "catalogID": try XCTUnwrap(catalog["id"]),
    ]
    var open = binding
    open["fileID"] = try XCTUnwrap(files.first?["id"])
    try send("open", id: "open-cancel", fields: open)
    XCTAssertNotNil(review)
    var cancel = binding
    cancel["targetOpenRequestID"] = "open-cancel"
    try send("cancelSearch", id: "cancel", fields: cancel)
    review?(true)
    XCTAssertNotNil(error)
    XCTAssertTrue(editor.document === source)
    XCTAssertTrue(source.windowControllers.first === controller)
    XCTAssertTrue(
      replies.contains {
        $0["kind"] as? String == "cancelled" && $0["cancelledOpen"] as? Bool == true
      })
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  func testChangedOrDeletedTargetDuringReviewKeepsSourceWindow() throws {
    for delete in [false, true] {
      let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      defer { try? FileManager.default.removeItem(at: root) }
      let url = root.appendingPathComponent("target.md")
      try Data("原目标\n".utf8).write(to: url)
      let catalog = try SidebarCatalog.scan(folder: root)
      let file = try catalog.openFile(id: XCTUnwrap(catalog.files.first?.id), catalogID: catalog.id)
      let source = InkoraDocument()
      try source.read(from: Data("源正文\n".utf8), ofType: "net.daringfireball.markdown")
      var review: ((Bool) -> Void)?
      source.navigationReviewer = { review = $0 }
      let editor = EditorViewController(
        document: source, sidebarDocumentFactory: { _ in InkoraDocument() })
      let window = NSWindow(contentViewController: editor)
      let controller = NSWindowController(window: window)
      source.addWindowController(controller)
      source.attachSidebarEditor(editor)
      defer {
        if let active = editor.document {
          active.removeWindowController(controller)
          NSDocumentController.shared.removeDocument(active)
        }
        window.close()
      }
      var error: Error?
      editor.navigateSidebarFile(file, access: SidebarWorkspaceBridge.FolderAccess(root)) {
        error = $0
      }
      if delete {
        try FileManager.default.removeItem(at: url)
      } else {
        try Data("外改目标\n".utf8).write(to: url)
      }
      review?(true)
      XCTAssertNotNil(error)
      XCTAssertTrue(editor.document === source)
      XCTAssertTrue(source.windowControllers.first === controller)
      XCTAssertEqual(source.text, "源正文\n")
      XCTAssertFalse(window.isVisible)
    }
  }

  @MainActor
  func testDelayedCloseReviewCannotNavigateAnotherDocument() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appendingPathComponent("target.md")
    try Data("目标\n".utf8).write(to: url)
    let catalog = try SidebarCatalog.scan(folder: root)
    let file = try catalog.openFile(id: XCTUnwrap(catalog.files.first?.id), catalogID: catalog.id)
    let source = InkoraDocument()
    source.updateChangeCount(.changeDone)
    var review: ((Bool) -> Void)?
    source.navigationReviewer = { review = $0 }
    var created = false
    let editor = EditorViewController(
      document: source,
      sidebarDocumentFactory: { _ in
        created = true
        return InkoraDocument()
      })
    var error: Error?
    editor.navigateSidebarFile(file, access: SidebarWorkspaceBridge.FolderAccess(root)) {
      error = $0
    }
    XCTAssertNotNil(review)
    let other = InkoraDocument()
    editor.document = other
    review?(true)
    XCTAssertNotNil(error)
    XCTAssertFalse(created)
    XCTAssertTrue(editor.document === other)
    XCTAssertTrue(source.isDocumentEdited)
    source.updateChangeCount(.changeCleared)
  }

  @MainActor
  func testVerifiedBytesEstablishDiskBaselineAndRejectExternalChange() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appendingPathComponent("文档.md")
    let bytes = Data([0xEF, 0xBB, 0xBF]) + Data("# 标题\r\n".utf8)
    try bytes.write(to: url)
    let date = try url.resourceValues(forKeys: [.contentModificationDateKey])
      .contentModificationDate!
    let document = InkoraDocument()
    try document.readSidebarFile(data: bytes, url: url, modified: date)
    XCTAssertEqual(try document.data(ofType: "net.daringfireball.markdown"), bytes)
    document.refreshFileState()
    XCTAssertEqual(document.fileState, .current)
    try Data("外部修改\n".utf8).write(to: url)
    try FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: url.path)
    document.refreshFileState()
    XCTAssertEqual(document.fileState, .externalChange)
    XCTAssertThrowsError(
      try document.write(
        to: url, ofType: "net.daringfireball.markdown", for: .saveOperation,
        originalContentsURL: url))
    XCTAssertEqual(try Data(contentsOf: url), Data("外部修改\n".utf8))
  }

  @MainActor
  func testNavigationReusesWindowAndCancellationOrReadFailureKeepsSource() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appendingPathComponent("target.md")
    let bytes = Data("目标\r\n".utf8)
    try bytes.write(to: url)
    let catalog = try SidebarCatalog.scan(folder: root)
    let file = try catalog.openFile(id: XCTUnwrap(catalog.files.first?.id), catalogID: catalog.id)
    let documents = NSDocumentController.shared
    var fail = false
    let source = InkoraDocument()
    try source.read(from: Data("原文\r\n".utf8), ofType: "net.daringfireball.markdown")
    let editor = EditorViewController(
      document: source, sidebarDocumentController: documents,
      sidebarDocumentFactory: { _ in
        if fail { throw CocoaError(.fileReadUnknown) }
        return InkoraDocument()
      })
    let window = NSWindow(contentViewController: editor)
    let controller = NSWindowController(window: window)
    source.addWindowController(controller)
    source.attachSidebarEditor(editor)
    let lease = SidebarWorkspaceBridge.FolderAccess(root)
    source.navigationReviewer = { $0(false) }
    var error: Error?
    editor.navigateSidebarFile(file, access: lease) { error = $0 }
    XCTAssertNotNil(error)
    XCTAssertTrue(editor.document === source)
    XCTAssertEqual(source.text, "原文\r\n")
    source.navigationReviewer = { $0(true) }
    fail = true
    editor.navigateSidebarFile(file, access: lease) { error = $0 }
    XCTAssertNotNil(error)
    XCTAssertTrue(editor.document === source)
    fail = false
    editor.navigateSidebarFile(file, access: lease) { error = $0 }
    XCTAssertNil(error)
    let target = try XCTUnwrap(editor.document)
    XCTAssertFalse(target === source)
    XCTAssertTrue(target.windowControllers.first === controller)
    XCTAssertTrue(window.contentViewController === editor)
    XCTAssertTrue(target.sidebarFolderAccess === lease)
    XCTAssertEqual(target.text, "目标\r\n")
    XCTAssertTrue(source.windowControllers.isEmpty)
    target.removeWindowController(controller)
    documents.removeDocument(target)
    target.close()
    window.close()
  }
}

@MainActor
private final class SidebarPresentationDelegate: EditorBridgeDelegate {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge) {}
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState) {}
}

@MainActor
private final class DragRecordingWindow: NSWindow {
  var draggedEvents: [NSEvent] = []
  override func performDrag(with event: NSEvent) { draggedEvents.append(event) }
}

extension SidebarNavigationTests {
  @MainActor
  func testTitlebarDoubleClickFillsDesktopAndRestoresAfterLayoutRefresh() throws {
    let screen = try XCTUnwrap(NSScreen.main)
    let desktop = screen.visibleFrame
    let window = DragRecordingWindow(
      contentRect: NSRect(x: desktop.midX - 240, y: desktop.midY - 160, width: 480, height: 320),
      styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    let surface = WindowTitlebarDragSurface(frame: try XCTUnwrap(window.contentView).bounds)
    surface.autoresizingMask = [.width, .height]
    window.contentView = surface
    defer { window.close() }
    let original = window.frame

    try doubleClickTitlebar(surface, in: window)
    XCTAssertEqual(window.frame, desktop, "双击应填满当前桌面可用区域")
    XCTAssertFalse(window.styleMask.contains(.fullScreen))
    XCTAssertEqual(window.draggedEvents.count, 1, "第二次按下必须放大，不能再次拖动")
    surface.clear()  // Real WK resize invalidates geometry before publishing the next layout.
    try doubleClickTitlebar(surface, in: window)
    XCTAssertEqual(window.frame, original, "几何刷新后再次双击仍应恢复原尺寸和位置")

    try doubleClickTitlebar(surface, in: window)
    let resized = original.offsetBy(dx: 20, dy: 10)
    window.setFrame(resized, display: false)
    try doubleClickTitlebar(surface, in: window)
    XCTAssertEqual(window.frame, desktop)
    try doubleClickTitlebar(surface, in: window)
    XCTAssertEqual(window.frame, resized, "手动移动后应记住新的恢复位置")
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  func testTitlebarDoubleClickRejectsControlsBodyAndNonresizableWindow() throws {
    let window = DragRecordingWindow(
      contentRect: NSRect(x: 100, y: 100, width: 600, height: 400),
      styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    let surface = WindowTitlebarDragSurface(frame: try XCTUnwrap(window.contentView).bounds)
    window.contentView = surface
    defer { window.close() }
    let original = window.frame
    for point in [NSPoint(x: 30, y: 14), NSPoint(x: 570, y: 14), NSPoint(x: 200, y: 100)] {
      try doubleClickTitlebar(surface, in: window, at: point)
      XCTAssertEqual(window.frame, original)
    }
    XCTAssertTrue(window.draggedEvents.isEmpty)
    window.styleMask.remove(.resizable)
    try doubleClickTitlebar(surface, in: window)
    XCTAssertEqual(window.frame, original)
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  private func doubleClickTitlebar(
    _ surface: WindowTitlebarDragSurface, in window: NSWindow,
    at point: NSPoint = NSPoint(x: 200, y: 14)
  ) throws {
    surface.apply(
      TitlebarDragLayout(
        protocolVersion: 1, type: "titlebarLayout",
        viewportWidth: surface.bounds.width, viewportHeight: surface.bounds.height,
        left: 90, right: surface.bounds.width - 50, top: 0, bottom: 28))
    for count in 1...2 {
      let event = try XCTUnwrap(
        NSEvent.mouseEvent(
          with: .leftMouseDown, location: surface.convert(point, to: nil), modifierFlags: [],
          timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
          context: nil, eventNumber: count, clickCount: count, pressure: 1))
      surface.mouseDown(with: event)
    }
  }

  @MainActor
  func testTitlebarDragHandsOriginalMouseDownToWindowAndRejectsControls() throws {
    let window = DragRecordingWindow(
      contentRect: NSRect(x: 0, y: 0, width: 600, height: 400),
      styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    let surface = WindowTitlebarDragSurface(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
    window.contentView = surface
    defer { window.close() }
    surface.apply(
      TitlebarDragLayout(
        protocolVersion: 1, type: "titlebarLayout",
        viewportWidth: 600, viewportHeight: 400, left: 90, right: 470, top: 0, bottom: 28))
    func event(_ x: Double, _ y: Double, type: NSEvent.EventType = .leftMouseDown) throws -> NSEvent
    {
      try XCTUnwrap(
        NSEvent.mouseEvent(
          with: type,
          location: surface.convert(NSPoint(x: x, y: y), to: nil), modifierFlags: [],
          timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
          context: nil, eventNumber: 1, clickCount: 1, pressure: 1))
    }
    let down = try event(200, 14)
    surface.mouseDown(with: down)
    XCTAssertEqual(window.draggedEvents.count, 1)
    XCTAssertTrue(window.draggedEvents.first === down)
    for other in [
      try event(500, 14), try event(200, 100), try event(30, 14),
      try event(200, 14, type: .rightMouseDown),
    ] {
      surface.mouseDown(with: other)
    }
    window.isMovable = false
    surface.mouseDown(with: down)
    XCTAssertEqual(window.draggedEvents.count, 1)
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  func testTitlebarInvalidGeometryAndResetRemoveDragAuthority() {
    let parent = NSView(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
    let surface = WindowTitlebarDragSurface(frame: parent.bounds)
    parent.addSubview(surface)
    let point = surface.convert(NSPoint(x: 200, y: 14), to: parent)
    func layout(width: Double = 600, left: Double = 90, bottom: Double = 28) -> TitlebarDragLayout {
      TitlebarDragLayout(
        protocolVersion: 1, type: "titlebarLayout",
        viewportWidth: width, viewportHeight: 400, left: left, right: 470, top: 0, bottom: bottom)
    }
    surface.apply(layout())
    XCTAssertTrue(surface.hitTest(point) === surface)
    surface.clear()
    XCTAssertNil(surface.hitTest(point))
    for invalid in [layout(width: 900), layout(left: 0), layout(bottom: 100), layout(left: .nan)] {
      surface.apply(layout())
      surface.apply(invalid)
      XCTAssertNil(surface.hitTest(point))
    }
  }
}
