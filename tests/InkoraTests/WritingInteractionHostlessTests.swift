import AppKit
import WebKit
import XCTest

final class WritingInteractionHostlessTests: XCTestCase {
  @MainActor
  func testHeadingContinuousTextWithoutIntermediateSnapshots() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys(["#", " ", "标", "题"], in: web)
      XCTAssertEqual(try snapshot(controller), "# 标题")
      XCTAssertEqual(
        try js("document.querySelector('#editor h1')?.textContent", in: web) as? String, "标题")
    }
  }

  @MainActor
  func testEmptyHeadingBackspaceRemovesFormatAndAcceptsText() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys(["#", "<Backspace>", "正", "文"], in: web)
      XCTAssertEqual(try snapshot(controller), "正文")
      XCTAssertEqual(try js("document.querySelectorAll('#editor h1').length", in: web) as? Int, 0)
    }
  }

  @MainActor
  func testConsecutiveSpacesRetainEveryTypedByte() throws {
    try withEditor("a") { controller, web in
      try focus("#editor p", in: web)
      try keys([" ", " ", " ", "b"], expectedTexts: ["a ", "a  ", "a   ", "a   b"], in: web)
      XCTAssertEqual(try snapshot(controller), "a   b")
    }
  }

  @MainActor
  func testListDeletionLiftsEmptyItemAndContinuesIntoPreviousParagraph() throws {
    try withEditor("上一段\n\n- 项目\n") { controller, web in
      try focus("#editor li p", in: web)
      try keys(Array(repeating: "<Backspace>", count: 5), in: web)
      XCTAssertEqual(try snapshot(controller), "上一\n")
      XCTAssertEqual(try js("document.querySelectorAll('#editor li').length", in: web) as? Int, 0)
    }
  }

  @MainActor
  func testTaskCheckboxAppearsWhileTypingAndWritesCheckedMarker() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys(["-", " ", "[", " ", "]", " ", "任", "务"], in: web)
      XCTAssertEqual(try snapshot(controller), "- [ ] 任务")
      let clicked = try js(
        "(() => {const c=document.querySelector('#editor input[type=checkbox]'); if(!c)return false;c.click();return true})()",
        in: web)
      XCTAssertEqual(clicked as? Bool, true)
      XCTAssertEqual(try snapshot(controller), "- [x] 任务")
    }
  }

  @MainActor
  func testExistingStandardTaskMarkdownHasCheckbox() throws {
    try withEditor("- [ ] 任务\n") { controller, web in
      XCTAssertEqual(
        try js("!!document.querySelector('#editor input[type=checkbox]')", in: web) as? Bool, true)
      XCTAssertEqual(try snapshot(controller), "- [ ] 任务\n")
    }
  }

  @MainActor
  func testLeadingSpacesStayVisibleAndKeepTheirCaret() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys([" ", " ", " ", "a"], expectedTexts: [" ", "  ", "   ", "   a"], in: web)
      XCTAssertEqual(try snapshot(controller), "   a")
    }
  }

  @MainActor
  func testHeadingTrailingSpacesRemainVisibleDuringTyping() throws {
    try withEditor("# 标题") { controller, web in
      try focus("#editor h1", in: web)
      try keys([" ", " ", " ", "b"], expectedTexts: ["标题 ", "标题  ", "标题   ", "标题   b"], in: web)
      XCTAssertEqual(try snapshot(controller), "# 标题   b")
    }
  }

  @MainActor
  func testListTrailingSpacesRemainVisibleDuringTyping() throws {
    try withEditor("- a") { controller, web in
      try focus("#editor li p", in: web)
      try keys([" ", " ", " ", "b"], expectedTexts: ["a ", "a  ", "a   ", "a   b"], in: web)
      XCTAssertEqual(try snapshot(controller), "- a   b")
    }
  }

  @MainActor
  func testEmptyTaskCheckboxCanToggleBeforeLabelIsTyped() throws {
    for suffix in ["", " "] {
      try withEditor("") { controller, web in
        try focus("#editor p", in: web)
        try keys(["-", " ", "[", " ", "]"] + (suffix.isEmpty ? [] : [" "]), in: web)
        XCTAssertEqual(try snapshot(controller), "- [ ]" + suffix)
        XCTAssertEqual(
          try js(
            "(() => {const c=document.querySelector('#editor input[type=checkbox]');if(!c)return false;c.click();return true})()",
            in: web) as? Bool, true)
        XCTAssertEqual(try snapshot(controller), "- [x]" + suffix)
      }
    }
  }

  @MainActor
  private func withEditor(_ raw: String, body: (EditorViewController, WKWebView) throws -> Void)
    throws
  {
    let bundle =
      ProcessInfo.processInfo.environment["INKORA_WRITING_RESOURCE_BUNDLE"]
      .flatMap(Bundle.init(path:)) ?? Bundle(for: Self.self)
    let document = InkoraDocument()
    try document.read(from: Data(raw.utf8), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    let window = NSWindow(contentViewController: controller)
    let web = try XCTUnwrap(controller.view as? WKWebView)
    document.attachSidebarEditor(controller)
    defer { window.close() }
    let deadline = Date().addingTimeInterval(8)
    while try js("!!document.querySelector('#editor.ProseMirror')", in: web) as? Bool != true
      && Date() < deadline
    {
      RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    XCTAssertEqual(try snapshot(controller), raw)
    try body(controller, web)
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  private func focus(_ selector: String, in web: WKWebView) throws {
    let data = try JSONSerialization.data(withJSONObject: [selector])
    let json = try XCTUnwrap(String(data: data, encoding: .utf8))
    XCTAssertEqual(
      try js(
        """
        (() => {const e=document.querySelector('#editor');e.focus();
        const p=document.querySelector(\(json)[0]);if(!p)return false;
        const r=document.createRange();r.selectNodeContents(p);r.collapse(false);
        const s=getSelection();s.removeAllRanges();s.addRange(r);return true})()
        """, in: web) as? Bool, true)
  }

  @MainActor
  private func keys(_ values: [String], expectedTexts: [String]? = nil, in web: WKWebView) throws {
    let data = try JSONEncoder().encode(values)
    let json = try XCTUnwrap(String(data: data, encoding: .utf8))
    _ = try js(
      """
      (() => {window.writingSequenceDone=false;window.writingSequenceEvents=[];
      const keys=\(json);let index=0;
      function next(){
        if(index===keys.length){window.writingSequenceDone=true;return;}
        const key=keys[index++],editor=document.querySelector('#editor');
        if(key==='<Backspace>'){
          const e=new KeyboardEvent('keydown',{key:'Backspace',keyCode:8,which:8,bubbles:true,cancelable:true});
          if(editor.dispatchEvent(e))document.execCommand('delete',false,null);
        }else document.execCommand('insertText',false,key);
        setTimeout(() => {
          const s=getSelection();window.writingSequenceEvents.push({key,html:editor.innerHTML,
            text:editor.textContent,anchor:s.anchorOffset,head:s.focusOffset,anchorNode:s.anchorNode?.nodeName});
          next();
        },40);
      }next();return true;})()
      """, in: web)
    let deadline = Date().addingTimeInterval(5)
    while try js("window.writingSequenceDone === true", in: web) as? Bool != true
      && Date() < deadline
    {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertEqual(try js("window.writingSequenceDone", in: web) as? Bool, true)
    if let expectedTexts {
      XCTAssertEqual(
        try js("window.writingSequenceEvents.map(e=>e.text)", in: web) as? [String], expectedTexts)
    }
    print("WRITING-TRACE", try js("JSON.stringify(window.writingSequenceEvents)", in: web) as Any)
  }

  @MainActor
  private func js(_ script: String, in web: WKWebView) throws -> Any? {
    var done = false
    var value: Any?
    var failure: Error?
    web.evaluateJavaScript(script) { result, error in
      value = result
      failure = error
      done = true
    }
    let deadline = Date().addingTimeInterval(5)
    while !done && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.005))
    }
    if let failure { throw failure }
    guard done else { throw EditorBridgeError.requestTimedOut }
    return value
  }

  @MainActor
  private func snapshot(_ controller: EditorViewController) throws -> String {
    var result: Result<String, Error>?
    controller.requestText { result = $0 }
    let deadline = Date().addingTimeInterval(5)
    while result == nil && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.005))
    }
    return try XCTUnwrap(result).get()
  }
}
