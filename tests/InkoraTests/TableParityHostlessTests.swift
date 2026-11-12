import AppKit
import WebKit
import XCTest

final class TableParityHostlessTests: XCTestCase {
  @MainActor
  func testNativeParameterizedInsertSaveAndReopen() throws {
    let expected = "| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n|  |  |  |"
    try withEditor("") { document, controller, web, _, url in
      controller.performEditorCommand(.insertTable)
      try wait("!!document.querySelector('dialog[open]')", web)
      XCTAssertEqual(try snapshot(controller), "")
      _ = try js(
        """
        (()=>{const d=document.querySelector('dialog');d.querySelector('[name=columns]').value='3';
        d.querySelector('[name=rows]').value='4';d.querySelector('form').requestSubmit();return true})()
        """, web)
      XCTAssertEqual(try snapshot(controller), expected)
      XCTAssertEqual(try js("document.querySelectorAll('table tr').length", web) as? Int, 4)
      XCTAssertEqual(
        try js("getSelection().anchorNode.parentElement.closest('th')?.textContent", web)
          as? String, "列 1")
      var saved = false
      var failure: Error?
      document.save(to: url, ofType: "net.daringfireball.markdown", for: .saveOperation) { error in
        failure = error
        saved = true
      }
      try spin { saved }
      XCTAssertNil(failure)
      XCTAssertEqual(try snapshot(controller), expected)
      try spin { !document.isDocumentEdited }
      XCTAssertEqual(try Data(contentsOf: url), Data(expected.utf8))
      let reopened = InkoraDocument()
      try reopened.read(from: url, ofType: "net.daringfireball.markdown")
      XCTAssertEqual(reopened.text, expected)
    }
  }

  @MainActor
  func testSyntheticPointerDragFeedbackDropAndCancellation() throws {
    let raw = "| A | C | B |\n| :--- | ---: | :---: |\n| 1 | c | b |\n| 2 | d | e |"
    try withEditor(raw) { _, controller, web, _, _ in
      try wait(
        "document.querySelector('[data-table-index=\"2\"]').getBoundingClientRect().width>0", web)
      _ = try js(
        """
        window.tablePointer=(type,x,y,target=document)=>target.dispatchEvent(new PointerEvent(type,
          {pointerId:17,clientX:x,clientY:y,button:0,bubbles:true,cancelable:true}));
        window.tableStart=()=>{const h=document.querySelector('[data-table-axis=column][data-table-index="2"]');
          const r=h.getBoundingClientRect();tablePointer('pointerdown',r.x+r.width/2,r.y+r.height/2,h);
          const t=document.querySelectorAll('th')[1].getBoundingClientRect();tablePointer('pointermove',t.x+t.width/2,t.y+10);};
        tableStart();true
        """, web)
      XCTAssertEqual(
        try js("document.querySelector('.table-drag-shade').hidden", web) as? Bool, false)
      XCTAssertEqual(
        try js("document.querySelector('.table-drop-indicator').dataset.targetIndex", web)
          as? String, "1")
      XCTAssertEqual(try snapshot(controller), raw)
      _ = try js(
        "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));tablePointer('pointerup',0,0);true",
        web)
      XCTAssertEqual(try snapshot(controller), raw)
      _ = try js("tableStart();tablePointer('pointerup',0,0);true", web)
      let expected = "| A | B | C |\n| :--- | :---: | ---: |\n| 1 | b | c |\n| 2 | e | d |"
      XCTAssertEqual(try snapshot(controller), expected)
      try history(.undo, controller)
      XCTAssertEqual(try snapshot(controller), raw)
      try history(.redo, controller)
      XCTAssertEqual(try snapshot(controller), expected)
      _ = try js(
        """
        (()=>{const h=document.querySelector('[data-table-axis=row][data-table-index="2"]');
        h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));return true})()
        """, web)
      XCTAssertEqual(
        try snapshot(controller),
        "| A | B | C |\n| :--- | :---: | ---: |\n| 2 | e | d |\n| 1 | b | c |")
    }
  }

  @MainActor
  func testWideNarrowGridAndScrolledHandleHitTesting() throws {
    let raw =
      "| A | C | B |\n| --- | --- | --- |\n| " + String(repeating: "long", count: 30) + " | 中 | 😀 |"
    try withEditor(raw) { _, controller, web, window, _ in
      for width: CGFloat in [900, 360] {
        window.setContentSize(NSSize(width: width, height: 600))
        window.contentView?.layoutSubtreeIfNeeded()
        _ = try js("window.dispatchEvent(new Event('resize'));true", web)
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        let geometry =
          try js(
            """
            (()=>{const s=document.querySelector('.inkora-table-scroll');s.scrollLeft=s.scrollWidth;
            s.dispatchEvent(new Event('scroll'));return [document.documentElement.scrollWidth,innerWidth,s.scrollWidth>s.clientWidth]})()
            """, web) as? [Any]
        XCTAssertLessThanOrEqual(
          (geometry?[0] as? Double) ?? .infinity, ((geometry?[1] as? Double) ?? 0) + 1)
        XCTAssertEqual((geometry?[1] as? Double) ?? 0, Double(width), accuracy: 1)
        XCTAssertEqual(geometry?[2] as? Bool, true, "long table must scroll locally")
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        let hit =
          try js(
            """
            (()=>{const s=document.querySelector('.inkora-table-shell');s.classList.add('table-dragging');
            const h=s.querySelector('[data-table-axis=column][data-table-index="2"]'),r=h.getBoundingClientRect();
            const ok=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===h;s.classList.remove('table-dragging');return ok})()
            """, web) as? Bool
        XCTAssertEqual(hit, true)
        _ = try js("document.querySelector('[aria-label=\"调整表格规模\"]').click();true", web)
        let dialog =
          try js(
            """
            (()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect();
            const g=d.querySelector('[data-column="4"][data-row="6"]');g.dispatchEvent(new PointerEvent('pointerenter'));
            return [r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
              d.querySelector('output').textContent,d.querySelectorAll('[aria-selected=true]').length]})()
            """, web) as? [Any]
        XCTAssertEqual(dialog?[0] as? Bool, true)
        XCTAssertEqual(dialog?[1] as? String, "4 列 × 6 行（含表头）")
        XCTAssertEqual(dialog?[2] as? Int, 24)
        XCTAssertEqual(try snapshot(controller), raw)
        _ = try js(
          "document.querySelector('dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true",
          web)
        XCTAssertFalse(window.isVisible)
      }
      _ = try js(
        """
        document.querySelector('[aria-label="调整表格规模"]').click();
        document.querySelector('dialog [data-column="4"][data-row="6"]').click();true
        """, web)
      XCTAssertEqual(try js("document.querySelectorAll('tr').length", web) as? Int, 6)
      XCTAssertEqual(try js("document.querySelectorAll('th').length", web) as? Int, 4)
      XCTAssertNotEqual(try snapshot(controller), raw)
      try history(.undo, controller)
      XCTAssertEqual(try snapshot(controller), raw)
    }
  }

  @MainActor
  func testScaleInputCompositionKeepsFieldFocusAndCanCancelAfterEnd() throws {
    let raw = "| A |\n| --- |\n| one |"
    try withEditor(raw) { _, controller, web, _, _ in
      let preserved =
        try js(
          """
          (()=>{document.querySelector('[aria-label="调整表格规模"]').click();
          const d=document.querySelector('dialog'),f=d.querySelector('[name=columns]');f.focus();f.value='3';
          f.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
          d.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));d.querySelector('form').requestSubmit();
          window.tableComposingField=f;
          return f.isConnected&&document.activeElement===f&&f.value==='3';})()
          """, web) as? Bool
      XCTAssertEqual(preserved, true)
      XCTAssertEqual(try snapshot(controller), raw)
      _ = try js(
        """
        tableComposingField.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
        document.querySelector('dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true
        """, web)
      XCTAssertEqual(try js("tableComposingField.isConnected", web) as? Bool, false)
      XCTAssertEqual(try snapshot(controller), raw)
    }
  }

  @MainActor
  private func withEditor(
    _ raw: String,
    body: (InkoraDocument, EditorViewController, WKWebView, NSWindow, URL) throws -> Void
  ) throws {
    let bundle =
      ProcessInfo.processInfo.environment["INKORA_TABLE_RESOURCE_BUNDLE"].flatMap(
        Bundle.init(path:)) ?? Bundle(for: Self.self)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "inkora-table-182-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("sample.md")
    try Data(raw.utf8).write(to: url)
    let document = InkoraDocument()
    try document.read(from: url, ofType: "net.daringfireball.markdown")
    document.fileURL = url
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    let window = NSWindow(contentViewController: controller)
    window.setContentSize(NSSize(width: 900, height: 600))
    let web = try XCTUnwrap(controller.view as? WKWebView)
    document.attachSidebarEditor(controller)
    defer { window.close() }
    try wait("!!document.querySelector('#editor.ProseMirror')", web)
    XCTAssertEqual(try snapshot(controller), raw)
    try body(document, controller, web, window, url)
    var prepared = false
    var failure: Error?
    document.prepareForClose {
      failure = $0
      prepared = true
    }
    try spin { prepared }
    XCTAssertNil(failure)
    XCTAssertFalse(window.isVisible)
  }

  @MainActor private func spin(_ condition: () -> Bool) throws {
    let deadline = Date().addingTimeInterval(8)
    while !condition() && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    guard condition() else { throw EditorBridgeError.requestTimedOut }
  }
  @MainActor private func wait(_ script: String, _ web: WKWebView) throws {
    let deadline = Date().addingTimeInterval(8)
    while try js(script, web) as? Bool != true && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertEqual(try js(script, web) as? Bool, true)
  }
  @MainActor private func js(_ script: String, _ web: WKWebView) throws -> Any? {
    var done = false
    var value: Any?
    var failure: Error?
    web.evaluateJavaScript(script) { result, error in
      value = result
      failure = error
      done = true
    }
    try spin { done }
    if let failure { throw failure }
    return value
  }
  @MainActor private func snapshot(_ controller: EditorViewController) throws -> String {
    var result: Result<String, Error>?
    controller.requestText { result = $0 }
    try spin { result != nil }
    return try XCTUnwrap(result).get()
  }
  @MainActor private func history(
    _ command: BridgeEditorCommand, _ controller: EditorViewController
  ) throws {
    var ready = false
    controller.refreshEditorCommands { ready = true }
    try spin { ready }
    controller.performEditorCommand(command)
    ready = false
    controller.refreshEditorCommands { ready = true }
    try spin { ready }
  }
}
