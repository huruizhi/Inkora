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
  func testQuoteAndMarkedTrailingSpacesPreserveSyntaxAndCaret() throws {
    for row in [
      (raw: "> a", selector: "#editor blockquote p", mark: "blockquote"),
      (raw: "**a**", selector: "#editor p", mark: "strong"),
      (raw: "# **a**", selector: "#editor h1", mark: "strong"),
      (raw: "[a](./url)", selector: "#editor p", mark: "a"),
    ] {
      try withEditor(row.raw) { controller, web in
        try focus(row.selector, in: web)
        try keys([" ", " ", " ", "b"], expectedTexts: ["a ", "a  ", "a   ", "a   b"], in: web)
        XCTAssertEqual(try snapshot(controller), row.raw + "   b", row.raw)
        XCTAssertEqual(
          try js("!!document.querySelector('#editor \(row.mark)')", in: web) as? Bool, true)
        try keys(Array(repeating: "<Backspace>", count: 4), in: web)
        XCTAssertEqual(try snapshot(controller), row.raw, row.raw)
      }
    }
  }

  @MainActor
  func testLooseAndQuotedListBoundariesAcceptContinuousBackspace() throws {
    for row in [
      (
        raw: "- a\n\n- b", selector: "#editor li:nth-child(2) p", expected: "- a\n\nb", next: "- ab"
      ),
      (raw: "> a\n>\n> - b", selector: "#editor li p", expected: "> a\n>\n> b", next: "> ab"),
    ] {
      try withEditor(row.raw) { controller, web in
        try focus(row.selector, atStart: true, in: web)
        try keys(["<Backspace>"], in: web)
        XCTAssertEqual(try snapshot(controller), row.expected, row.raw)
        try keys(["<Backspace>"], in: web)
        XCTAssertEqual(try snapshot(controller), row.next, row.raw)
      }
    }
    try withEditor("> - b") { controller, web in
      try focus("#editor li p", atStart: true, in: web)
      try keys(["<Backspace>"], in: web)
      XCTAssertEqual(try snapshot(controller), "> b")
      XCTAssertEqual(try js("document.querySelectorAll('#editor li').length", in: web) as? Int, 0)
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
  func testCompositionKeepsCandidateOwnerAfterBareHash() throws {
    for row in [
      (raw: "", expected: "中", caret: 1), (raw: "#", expected: "#中", caret: 2),
      (raw: "# ", expected: "# 中", caret: 1), (raw: "#\r\n", expected: "#中\r\n", caret: 2),
    ] {
      try withEditor(row.raw) { controller, web in
        try focus(row.raw.isEmpty ? "#editor p" : "#editor h1", in: web)
        try startCandidate(in: web)
        XCTAssertEqual(try js("window.writingCandidate.isConnected", in: web) as? Bool, true)
        try confirmCandidate(in: web)
        RunLoop.current.run(until: Date().addingTimeInterval(0.04))
        XCTAssertEqual(try js("window.writingCandidate.isConnected", in: web) as? Bool, true)
        try endCandidate(in: web)
        RunLoop.current.run(until: Date().addingTimeInterval(0.15))
        XCTAssertEqual(try js("getSelection().focusOffset", in: web) as? Int, row.caret)
        let accepted = try versionedSnapshot(controller)
        XCTAssertEqual(accepted.text, row.expected)
        XCTAssertEqual(accepted.revision, 1, "one logical composition publication")
        try history(redo: false, controller: controller)
        XCTAssertEqual(try snapshot(controller), row.raw)
        try history(redo: true, controller: controller)
        XCTAssertEqual(try snapshot(controller), row.expected)
      }
    }
  }

  @MainActor
  func testLateFinalCompositionMutationStaysInSameHistoryUnit() throws {
    try withEditor("#") { controller, web in
      try focus("#editor h1", in: web)
      try startCandidate(in: web)
      try endWithBoundaryInput(ordinary: false, in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.15))
      let accepted = try versionedSnapshot(controller)
      XCTAssertEqual(accepted.text, "#中")
      XCTAssertEqual(accepted.revision, 1)
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "#")
      try history(redo: true, controller: controller)
      XCTAssertEqual(try snapshot(controller), "#中")
    }
  }

  @MainActor
  func testOrdinaryInputAfterCompositionIsASeparateHistoryUnit() throws {
    try withEditor("#") { controller, web in
      try focus("#editor h1", in: web)
      try startCandidate(in: web)
      try confirmCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.04))
      try endWithBoundaryInput(ordinary: true, in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.15))
      let accepted = try versionedSnapshot(controller)
      XCTAssertEqual(accepted.text, "#中a")
      XCTAssertEqual(accepted.revision, 2)
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "#中")
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "#")
      try history(redo: true, controller: controller)
      try history(redo: true, controller: controller)
      XCTAssertEqual(try snapshot(controller), "#中a")
    }
  }

  @MainActor
  func testConfirmedBareHashTextCanBeDeletedBackToBlank() throws {
    try withEditor("#") { controller, web in
      try focus("#editor h1", in: web)
      try startCandidate(in: web)
      try confirmCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.04))
      try endCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.15))
      XCTAssertEqual(try snapshot(controller), "#中")
      try keys(["<Backspace>", "<Backspace>"], in: web)
      XCTAssertEqual(try snapshot(controller), "")
      XCTAssertEqual(try js("document.querySelectorAll('#editor h1').length", in: web) as? Int, 0)
      try history(redo: false, controller: controller)
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "#中")
    }
  }

  @MainActor
  private func startCandidate(in web: WKWebView) throws {
    _ = try js(
      """
      (() => {const e=document.querySelector('#editor');
      e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      const p=e.querySelector('h1,p');p.querySelectorAll('br').forEach(n=>n.remove());
      const n=document.createTextNode('zh');p.append(n);window.writingCandidate=n;
      const r=document.createRange();r.setStart(n,2);r.collapse(true);
      const s=getSelection();s.removeAllRanges();s.addRange(r);
      e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'zh',isComposing:true}));return true;})()
      """, in: web)
    RunLoop.current.run(until: Date().addingTimeInterval(0.04))
  }

  @MainActor
  private func confirmCandidate(in web: WKWebView) throws {
    _ = try js(
      """
      (() => {const n=window.writingCandidate;n.replaceData(0,n.length,'中');
      if(n.isConnected){const r=document.createRange();r.setStart(n,1);r.collapse(true);
        const s=getSelection();s.removeAllRanges();s.addRange(r);}
      document.querySelector('#editor').dispatchEvent(new InputEvent('input',
        {bubbles:true,inputType:'insertCompositionText',data:'中',isComposing:true}));return true;})()
      """, in: web)
  }

  @MainActor
  private func endWithBoundaryInput(ordinary: Bool, in web: WKWebView) throws {
    // Schedule in WebKit's own event loop so the 5ms input precedes PM's 20ms
    // cleanup even when the Native test process is busy. No inter-key snapshot.
    _ = try js(
      """
      (() => {const e=document.querySelector('#editor');window.writingBoundaryDone=false;
      e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'}));
      setTimeout(() => {
        window.writingBoundaryTag=e.firstElementChild?.tagName;
        const n=window.writingCandidate;window.writingBoundaryConnected=n.isConnected;
        if(\(ordinary)){document.execCommand('insertText',false,'a');}
        else {
          n.replaceData(0,n.length,'中');
          if(n.isConnected){const r=document.createRange();r.setStart(n,1);r.collapse(true);
            const s=getSelection();s.removeAllRanges();s.addRange(r);}
          e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'中',isComposing:true}));
        }
        window.writingBoundaryDone=true;
      },5);return true;})()
      """, in: web)
    let deadline = Date().addingTimeInterval(5)
    while try js("window.writingBoundaryDone === true", in: web) as? Bool != true
      && Date() < deadline
    {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertEqual(try js("window.writingBoundaryDone", in: web) as? Bool, true)
    XCTAssertEqual(try js("window.writingBoundaryTag", in: web) as? String, "H1")
    XCTAssertEqual(try js("window.writingBoundaryConnected", in: web) as? Bool, true)
  }

  @MainActor
  private func endCandidate(in web: WKWebView) throws {
    _ = try js(
      "document.querySelector('#editor').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中'}))",
      in: web)
  }

  @MainActor
  private func history(redo: Bool, controller: EditorViewController) throws {
    // Use the actual Native menu route. A raw synthetic WK keydown within
    // 500ms of compositionend is intentionally consumed by PM's Safari guard.
    func refresh() throws {
      var done = false
      controller.refreshEditorCommands { done = true }
      let deadline = Date().addingTimeInterval(5)
      while !done && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.005))
      }
      guard done else { throw EditorBridgeError.requestTimedOut }
    }
    try refresh()
    controller.performEditorCommand(redo ? .redo : .undo)
    try refresh()
  }

  @MainActor
  private func versionedSnapshot(_ controller: EditorViewController) throws -> BridgeSnapshot {
    var result: Result<BridgeSnapshot, Error>?
    controller.requestSnapshot { result = $0 }
    let deadline = Date().addingTimeInterval(5)
    while result == nil && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.005))
    }
    return try XCTUnwrap(result).get()
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
    defer {
      window.close()
    }
    let deadline = Date().addingTimeInterval(8)
    while try js("!!document.querySelector('#editor.ProseMirror')", in: web) as? Bool != true
      && Date() < deadline
    {
      RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    XCTAssertEqual(try snapshot(controller), raw)
    try body(controller, web)
    var closeReady = false
    var closeError: Error?
    document.prepareForClose { error in
      closeError = error
      closeReady = true
    }
    let closeDeadline = Date().addingTimeInterval(5)
    while !closeReady && Date() < closeDeadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.005))
    }
    XCTAssertTrue(closeReady)
    XCTAssertNil(closeError, "actual document close preparation must accept the final edit")
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  private func focus(_ selector: String, atStart: Bool = false, in web: WKWebView) throws {
    let data = try JSONSerialization.data(withJSONObject: [selector])
    let json = try XCTUnwrap(String(data: data, encoding: .utf8))
    XCTAssertEqual(
      try js(
        """
        (() => {const e=document.querySelector('#editor');e.focus();
        const p=document.querySelector(\(json)[0]);if(!p)return false;
        const r=document.createRange();r.selectNodeContents(p);r.collapse(\(atStart));
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
          const s=getSelection(),prefix=document.createRange();prefix.selectNodeContents(editor);
          prefix.setEnd(s.focusNode,s.focusOffset);
          window.writingSequenceEvents.push({key,html:editor.innerHTML,
            text:editor.textContent,anchor:s.anchorOffset,head:prefix.toString().length,localHead:s.focusOffset,anchorNode:s.anchorNode?.nodeName});
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
      XCTAssertEqual(
        try js("window.writingSequenceEvents.map(e=>e.head)", in: web) as? [Int],
        expectedTexts.map { $0.utf16.count })
    }
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
