import AppKit
import WebKit
import XCTest

final class CodeToolsHostlessTests: XCTestCase {
  @MainActor
  func testLanguageCompletionUsesOneSourceChangeAndSavesExactBytes() throws {
    let raw = "\u{FEFF}前\r\n\r\n~~~js\t title=demo\r\nconst x = 1;\r\n~~~\r\n"
    try withEditor(raw) { document, controller, web, _, url in
      _ = try js(
        """
        (()=>{const i=document.querySelector('[role=combobox]');i.focus();i.value='py';
        i.dispatchEvent(new Event('input',{bubbles:true}));return true})()
        """, web)
      XCTAssertEqual(try snapshot(controller), presentation(raw))
      XCTAssertEqual(
        try js("document.querySelector('[role=option][aria-selected=true]').dataset.language", web)
          as? String, "python")
      _ = try js(
        "document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));true",
        web)
      let expected = raw.replacingOccurrences(of: "~~~js", with: "~~~python")
      XCTAssertEqual(try snapshot(controller), presentation(expected))
      try history(.undo, controller)
      XCTAssertEqual(try snapshot(controller), presentation(raw))
      try history(.redo, controller)
      XCTAssertEqual(try snapshot(controller), presentation(expected))
      var saved = false
      var failure: Error?
      document.save(to: url, ofType: "net.daringfireball.markdown", for: .saveOperation) {
        failure = $0
        saved = true
      }
      try spin { saved }
      XCTAssertNil(failure)
      XCTAssertEqual(try snapshot(controller), presentation(expected))
      XCTAssertEqual(try Data(contentsOf: url), Data(expected.utf8))
    }
  }

  @MainActor
  func testWideNarrowGutterAlignmentScrollAndCandidateHitTesting() throws {
    let raw =
      "```js\n" + String(repeating: "x", count: 160) + "\nsecond\nthird\n```\n\n```unknown\nx\n```"
    try withEditor(raw) { _, controller, web, window, _ in
      _ = try js(
        """
        try{window.codeToolsStoredNumbers=localStorage.getItem('inkora.code.line-numbers.v1')}catch{}
        window.codeToolsInitialNumbers=document.querySelector('[aria-label="显示代码行号"]').getAttribute('aria-pressed');
        if(codeToolsInitialNumbers!=='true')document.querySelector('[aria-label="显示代码行号"]').click();
        window.codeToolsOriginalNode=document.querySelector('pre code');true
        """, web)
      defer {
        _ = try? js(
          "if(document.querySelector('[aria-label=\"显示代码行号\"]').getAttribute('aria-pressed')!==codeToolsInitialNumbers)document.querySelector('[aria-label=\"显示代码行号\"]').click();try{if(codeToolsStoredNumbers===null)localStorage.removeItem('inkora.code.line-numbers.v1');else if(typeof codeToolsStoredNumbers==='string')localStorage.setItem('inkora.code.line-numbers.v1',codeToolsStoredNumbers)}catch{};true",
          web)
      }
      for width: CGFloat in [900, 360] {
        window.setContentSize(NSSize(width: width, height: 600))
        window.contentView?.layoutSubtreeIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        let geometry =
          try js(
            """
            (()=>{const p=document.querySelector('.inkora-code-body>pre'),g=document.querySelector('.code-line-numbers'),c=p.querySelector('code');
            const first=(el)=>{const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,1);return r.getBoundingClientRect().top;};
            const left=g.getBoundingClientRect().left;p.scrollLeft=p.scrollWidth;
            return [innerWidth,document.documentElement.scrollWidth,p.scrollWidth>p.clientWidth,
            Math.abs(first(g)-first(c)),g.getBoundingClientRect().left===left,g.textContent,c===codeToolsOriginalNode]})()
            """, web) as? [Any]
        XCTAssertEqual((geometry?[0] as? Double) ?? 0, Double(width), accuracy: 1)
        XCTAssertLessThanOrEqual((geometry?[1] as? Double) ?? .infinity, Double(width) + 1)
        XCTAssertEqual(geometry?[2] as? Bool, true)
        XCTAssertLessThanOrEqual((geometry?[3] as? Double) ?? .infinity, 1)
        XCTAssertEqual(geometry?[4] as? Bool, true)
        XCTAssertEqual(geometry?[5] as? String, "1\n2\n3")
        XCTAssertEqual(geometry?[6] as? Bool, true)
        let candidate =
          try js(
            """
            (()=>{const i=document.querySelector('[role=combobox]');i.focus();i.value='v';i.dispatchEvent(new Event('input',{bubbles:true}));
            const list=document.querySelector('[role=listbox]'),r=list.getBoundingClientRect();const b=list.querySelector('[role=option]'),q=b.getBoundingClientRect();
            const input=i.getBoundingClientRect();return [r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,
              document.elementFromPoint(q.x+q.width/2,q.y+q.height/2)===b,input.top>=0&&input.bottom<=innerHeight]})()
            """, web) as? [Bool]
        XCTAssertEqual(candidate, [true, true, true])
        _ = try js(
          "document.querySelector('[role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));true",
          web)
        XCTAssertEqual(try snapshot(controller), presentation(raw))
        XCTAssertFalse(window.isVisible)
      }
    }
  }

  @MainActor
  func testQueryCompositionAndMermaidReadingLayout() throws {
    let raw = "```mermaid\ngraph TD; A-->B\n```\n\n尾"
    try withEditor(raw) { _, controller, web, _, _ in
      _ = try js("document.querySelector('.mermaid-preview button').click();true", web)
      try wait("document.querySelector('.mermaid-preview')?.dataset.state==='ready'", web)
      _ = try js(
        """
        (()=>{document.querySelector('.mermaid-preview').click();const i=document.querySelector('[role=combobox]');
        i.focus();i.value='py';i.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        i.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.codeToolsQuery=i;
        return true})()
        """, web)
      XCTAssertEqual(
        try js(
          "codeToolsQuery.isConnected&&document.activeElement===codeToolsQuery&&codeToolsQuery.value==='py'",
          web) as? Bool, true)
      XCTAssertEqual(try snapshot(controller), presentation(raw))
      _ = try js(
        """
        codeToolsQuery.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
        codeToolsQuery.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        const e=document.querySelector('#editor'),p=e.querySelector('p');e.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(true);
        getSelection().removeAllRanges();getSelection().addRange(r);true
        """, web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
      XCTAssertEqual(
        try js("getComputedStyle(document.querySelector('.inkora-code-body')).display", web)
          as? String, "none")
      _ = try js("document.querySelector('.mermaid-preview').click();true", web)
      XCTAssertEqual(
        try js("getComputedStyle(document.querySelector('.inkora-code-body')).display", web)
          as? String, "grid")
      XCTAssertEqual(try snapshot(controller), presentation(raw))
    }
  }
  private func presentation(_ raw: String) -> String {
    // InkoraDocument retains BOM as file metadata; the Bridge carries decoded text.
    raw.hasPrefix("\u{FEFF}") ? String(raw.dropFirst()) : raw
  }

  @MainActor
  private func withEditor(
    _ raw: String,
    body: (InkoraDocument, EditorViewController, WKWebView, NSWindow, URL) throws -> Void
  ) throws {
    let bundle =
      ProcessInfo.processInfo.environment["INKORA_CODE_RESOURCE_BUNDLE"].flatMap(
        Bundle.init(path:)) ?? Bundle(for: Self.self)
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "inkora-code-186-\(UUID().uuidString)")
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
    XCTAssertEqual(try snapshot(controller), presentation(raw))
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
