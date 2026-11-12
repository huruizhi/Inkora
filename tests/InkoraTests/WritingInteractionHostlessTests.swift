import AppKit
import WebKit
import XCTest

final class WritingInteractionHostlessTests: XCTestCase {
  @MainActor
  func testEmptyHeadingReservesPrefixBeforeEditableBody() throws {
    for prefix in ["#", "# ", "## "] {
      try withEditor("") { controller, web in
        web.window?.setContentSize(NSSize(width: 900, height: 600))
        try focus("#editor p", in: web)
        try keys(Array(prefix).map(String.init), in: web)
        let geometry =
          try js(
            """
            (()=>{const h=document.querySelector('.inkora-heading-entry'),m=h.querySelector('.inkora-heading-entry-marker'),s=getSelection();
            const end=document.createRange();end.setStartAfter(m);end.collapse(true);
            return {after:s.getRangeAt(0).compareBoundaryPoints(Range.START_TO_START,end)>=0,
              editable:m.contentEditable,text:m.textContent,width:m.getBoundingClientRect().width};})()
            """, in: web) as? [String: Any]
        XCTAssertEqual(geometry?["after"] as? Bool, true)
        XCTAssertEqual(geometry?["editable"] as? String, "false")
        XCTAssertEqual(geometry?["text"] as? String, "")
        XCTAssertGreaterThan(try XCTUnwrap(geometry?["width"] as? Double), 0)
        XCTAssertEqual(try snapshot(controller), prefix)
        if prefix.hasSuffix(" ") {
          try keys(["a"], in: web)
          XCTAssertEqual(try snapshot(controller), prefix + "a")
        }
      }
    }
  }

  @MainActor
  func testNativeMarkedTextDoesNotDuplicateInitialLetter() throws {
    for prefix in ["", "#", "# ", "##  ", "- "] {
      try withEditor("") { controller, web in
        XCTAssertTrue(try XCTUnwrap(web.window).makeFirstResponder(web))
        try focus("#editor p", in: web)
        if !prefix.isEmpty { try keys(Array(prefix).map(String.init), in: web) }
        let client = try XCTUnwrap(web.inputContext?.client)
        client.setMarkedText(
          "d", selectedRange: NSRange(location: 1, length: 0),
          replacementRange: NSRange(location: NSNotFound, length: 0))
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(
          try js("document.querySelector('#editor h1,#editor h2,#editor p').textContent", in: web)
            as? String,
          "d")
        client.setMarkedText(
          "du", selectedRange: NSRange(location: 2, length: 0),
          replacementRange: NSRange(location: NSNotFound, length: 0))
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(
          try js("document.querySelector('#editor h1,#editor h2,#editor p').textContent", in: web)
            as? String,
          "du")
        client.insertText("读", replacementRange: NSRange(location: NSNotFound, length: 0))
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        let after = try versionedSnapshot(controller)
        XCTAssertEqual(after.text, prefix + "读")
        try history(redo: false, controller: controller)
        XCTAssertEqual(try snapshot(controller), prefix)
        try history(redo: true, controller: controller)
        XCTAssertEqual(try snapshot(controller), prefix + "读")
      }
    }
  }

  @MainActor
  func testTypedBulletWaitsForSpaceThenEnterAndBackspaceContinue() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys(["-"], in: web)
      XCTAssertEqual(try js("!!document.querySelector('#editor ul')", in: web) as? Bool, false)
      XCTAssertEqual(try snapshot(controller), "-")
      try keys([" "], in: web)
      XCTAssertEqual(try js("!!document.querySelector('#editor ul')", in: web) as? Bool, true)
      try keys(["a"], in: web)
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "- a\n- ")
      try keys(["b"], in: web)
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "- a\n- b\n- ")
      try keys(["<Backspace>"], in: web)
      XCTAssertEqual(try snapshot(controller), "- a\n- b\n\n")
      try keys(["c"], in: web)
      XCTAssertEqual(try snapshot(controller), "- a\n- b\n\nc")
    }
  }

  @MainActor
  func testBareBulletEnterKeepsLiteralAndContinuesTyping() throws {
    for marker in ["-", "+", "*"] {
      try withEditor("") { controller, web in
        try focus("#editor p", in: web)
        try keys([marker], in: web)
        try pressEnter(in: web)
        XCTAssertEqual(try snapshot(controller), marker + "\n\n")
        XCTAssertEqual(try js("!!document.querySelector('#editor ul')", in: web) as? Bool, false)
        try keys(["a"], in: web)
        XCTAssertEqual(try snapshot(controller), marker + "\n\na")
      }
    }
  }

  @MainActor
  func testEmptyListEnterAddsItemThenConsecutiveEnterExits() throws {
    for raw in ["- ", "# 水电费\n\n- 水电费\n- 第三方\n- ", "# 标题\r\n\r\n- 一\r\n- 二\r\n- "] {
      try withEditor(raw) { controller, web in
        try focus("#editor li:last-child p", in: web)
        let before = try XCTUnwrap(
          try js("document.querySelectorAll('#editor li').length", in: web) as? Int)
        let eol = raw.contains("\r\n") ? "\r\n" : "\n"
        let marker = "- "
        try pressEnter(in: web)
        XCTAssertEqual(try snapshot(controller), raw + eol + marker)
        XCTAssertEqual(
          try js("document.querySelectorAll('#editor li').length", in: web) as? Int, before + 1)
        try pressEnter(in: web)
        XCTAssertEqual(try snapshot(controller), raw + eol + eol)
        XCTAssertEqual(
          try js("document.querySelectorAll('#editor li').length", in: web) as? Int, before)
        try keys(["正文"], in: web)
        XCTAssertEqual(try snapshot(controller), raw + eol + eol + "正文")
      }
    }
  }

  @MainActor
  func testNativeCompositionCancellationBreaksListEnterSequence() throws {
    try withEditor("- ") { controller, web in
      XCTAssertTrue(try XCTUnwrap(web.window).makeFirstResponder(web))
      try focus("#editor li p", in: web)
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "- \n- ")
      let client = try XCTUnwrap(web.inputContext?.client)
      client.setMarkedText(
        "du", selectedRange: NSRange(location: 2, length: 0),
        replacementRange: NSRange(location: NSNotFound, length: 0))
      RunLoop.current.run(until: Date().addingTimeInterval(0.05))
      client.setMarkedText(
        "", selectedRange: NSRange(location: 0, length: 0),
        replacementRange: NSRange(location: NSNotFound, length: 0))
      client.unmarkText()
      // Keep PM's existing Safari confirmation-key protection intact.
      RunLoop.current.run(until: Date().addingTimeInterval(0.55))
      XCTAssertEqual(try snapshot(controller), "- \n- ")
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "- \n- \n- ")
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "- \n- \n\n")
    }
  }

  @MainActor
  func testMiddleEmptyItemCanExitTypeAndBackspaceToPreviousLine() throws {
    try withEditor("- \n- b") { controller, web in
      try focus("#editor li:first-child p", in: web)
      try pressEnter(in: web)
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "- \n\n- b")
      try keys(["水电费"], in: web)
      XCTAssertEqual(try snapshot(controller), "- \n水电费\n- b")
      try focus("#editor > p", atStart: true, in: web)
      try keys(["<Backspace>"], in: web)
      XCTAssertEqual(try snapshot(controller), "- 水电费\n- b")
    }
  }

  @MainActor
  func testParagraphAfterEmptyListAcceptsRepeatedBoundaryBackspace() throws {
    try withEditor("- \n\n水电费\n\n- 第三方\n- ") { controller, web in
      try focus("#editor > p", atStart: true, in: web)
      try keys(["<Backspace>"], in: web)
      XCTAssertEqual(try snapshot(controller), "- 水电费\n\n- 第三方\n- ")
      try keys(["<Backspace>"], in: web)
      XCTAssertEqual(try snapshot(controller), "水电费\n\n- 第三方\n- ")
    }
  }

  @MainActor
  func testEnterAtHeadingStartMovesTitleDownAndKeepsCaretOnTitle() throws {
    for raw in ["# 水电费", "# 水电费\n\n- 第三方\n- "] {
      try withEditor(raw) { controller, web in
        web.window?.setContentSize(NSSize(width: 900, height: 600))
        try focus("#editor h1", atStart: true, in: web)
        let top = try XCTUnwrap(
          try js("document.querySelector('#editor h1').getBoundingClientRect().top", in: web)
            as? Double)
        try pressEnter(in: web)
        XCTAssertEqual(try snapshot(controller), "\n\n" + raw)
        XCTAssertEqual(
          try js("document.querySelector('#editor').firstElementChild.tagName", in: web) as? String,
          "P")
        let moved = try XCTUnwrap(
          try js("document.querySelector('#editor h1').getBoundingClientRect().top", in: web)
            as? Double)
        XCTAssertGreaterThan(moved, top)
        try keys(["a"], in: web)
        XCTAssertEqual(
          try snapshot(controller), "\n\n" + raw.replacingOccurrences(of: "# 水电费", with: "# a水电费"))
      }
    }
  }

  @MainActor
  func testIdleSnapshotPreservesNativeResponderAndDirectedCaret() throws {
    try withEditor("# 标题") { controller, web in
      let window = try XCTUnwrap(web.window as? SnapshotFocusWindow)
      XCTAssertTrue(window.makeFirstResponder(web))
      try focus("#editor h1", in: web)
      _ = try js(
        """
        (()=>{const text=document.querySelector('#editor h1').firstChild;
        getSelection().setBaseAndExtent(text,2,text,0);return true})()
        """, in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.03))
      let client = try XCTUnwrap(web.inputContext?.client)
      XCTAssertFalse(client.hasMarkedText())
      let before = window.focusResetRequests
      let responder = window.firstResponder
      XCTAssertEqual(try versionedSnapshot(controller).text, "# 标题")
      XCTAssertEqual(window.focusResetRequests, before, "没有系统候选时，普通快照不能清空原生响应者")
      XCTAssertTrue(window.firstResponder === responder)
      XCTAssertEqual(try js("getSelection().anchorNode.textContent", in: web) as? String, "标题")
      let direction =
        try js(
          """
          (()=>{const e=document.querySelector('#editor'),s=getSelection();
          const at=(node,offset)=>{const r=document.createRange();r.selectNodeContents(e);r.setEnd(node,offset);return r.toString().length;};
          return [at(s.anchorNode,s.anchorOffset),at(s.focusNode,s.focusOffset)];})()
          """, in: web) as? [Int]
      XCTAssertEqual(direction, [2, 0])
    }
  }

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
  func testHeadingEntryKeepsGrayMarkerAndBodySizeUntilEnter() throws {
    for level in [1, 2] {
      let marker = String(repeating: "#", count: level)
      try withEditor("") { controller, web in
        try focus("#editor p", in: web)
        try keys(Array(marker).map(String.init), in: web)
        XCTAssertEqual(
          try js(
            "parseFloat(getComputedStyle(document.querySelector('#editor .inkora-heading-entry')).fontSize)",
            in: web) as? Double, 17)
        try keys([" ", "标", "题"], in: web)
        let presentation =
          try js(
            """
            (() => {const h=document.querySelector('#editor .inkora-heading-entry-ready');
            if(!h)return null;window.writingEntryHeading=h;
            return [getComputedStyle(h).fontSize,getComputedStyle(h.querySelector('.inkora-heading-entry-marker'),'::before').content,
              getComputedStyle(h.querySelector('.inkora-heading-entry-marker')).color !== getComputedStyle(h).color,h.textContent];})()
            """, in: web) as? [Any]
        XCTAssertEqual(presentation?[0] as? String, "17px")
        XCTAssertEqual(presentation?[1] as? String, "\"\(marker) \"")
        XCTAssertEqual(presentation?[2] as? Bool, true)
        XCTAssertEqual(presentation?[3] as? String, "标题")
        try pressEnter(in: web)
        XCTAssertEqual(try snapshot(controller), marker + " 标题\n\n")
        XCTAssertEqual(
          try js("!!document.querySelector('#editor .inkora-heading-entry')", in: web) as? Bool,
          false)
        XCTAssertEqual(
          try js(
            "parseFloat(getComputedStyle(document.querySelector('#editor h\(level)')).fontSize)",
            in: web) as? Double, level == 1 ? 34 : 25.5)
        try keys(["正", "文"], in: web)
        XCTAssertEqual(try snapshot(controller), marker + " 标题\n\n正文")
      }
    }
  }

  @MainActor
  func testHeadingEntryMarkedTailSpaceDoesNotRenderEarly() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys(["#", " ", "*", "*", "a", "*", "*", " ", "b"], in: web)
      XCTAssertEqual(try snapshot(controller), "# **a** b")
      XCTAssertEqual(
        try js("!!document.querySelector('#editor h1.inkora-heading-entry-ready')", in: web)
          as? Bool, true)
      XCTAssertEqual(
        try js("document.querySelector('#editor h1 strong')?.textContent", in: web) as? String, "a")
      XCTAssertEqual(
        try js(
          "parseFloat(getComputedStyle(document.querySelector('#editor h1')).fontSize)", in: web)
          as? Double, 17)
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "# **a** b\n\n")
      XCTAssertEqual(
        try js("!!document.querySelector('#editor .inkora-heading-entry')", in: web) as? Bool, false
      )
    }
  }

  @MainActor
  func testNewHeadingEntrySurvivesCompositionBeforeRendering() throws {
    try withEditor("") { controller, web in
      try focus("#editor p", in: web)
      try keys(["#", " "], in: web)
      let before = try versionedSnapshot(controller)
      try startCandidate(in: web)
      try confirmCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.04))
      XCTAssertEqual(try js("window.writingCandidate.isConnected", in: web) as? Bool, true)
      XCTAssertEqual(
        try js("!!document.querySelector('#editor .inkora-heading-entry-ready')", in: web) as? Bool,
        true)
      try endCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.55))
      let after = try versionedSnapshot(controller)
      XCTAssertEqual(after.text, "# 中")
      XCTAssertEqual(after.revision, before.revision + 1)
      XCTAssertEqual(
        try js("!!document.querySelector('#editor .inkora-heading-entry-ready')", in: web) as? Bool,
        true)
      try pressEnter(in: web)
      XCTAssertEqual(try snapshot(controller), "# 中\n\n")
      XCTAssertEqual(
        try js("!!document.querySelector('#editor .inkora-heading-entry')", in: web) as? Bool, false
      )
    }
  }

  @MainActor
  private func pressEnter(in web: WKWebView) throws {
    _ = try js(
      """
      (() => {const e=document.querySelector('#editor');
      const key=new KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true});
      if(e.dispatchEvent(key))document.execCommand('insertParagraph',false,null);return true;})()
      """, in: web)
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
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
  func testTaskMarkerSpaceRepairThroughNativeKeypress() throws {
    try withEditor("-[]") { controller, web in
      try focusTextOffset("#editor p", offset: 1, in: web)
      try asciiKeypress(" ", in: web)
      let separated = try snapshot(controller)
      XCTAssertEqual(separated, "- []")
      XCTAssertEqual(
        try js("document.querySelector('#editor li p')?.textContent", in: web) as? String, "[]")
      try focusTextOffset("#editor li p", offset: 1, in: web)
      try asciiKeypress(" ", in: web)
      XCTAssertEqual(try snapshot(controller), "- [ ]")
      XCTAssertEqual(
        try js("!!document.querySelector('#editor input[type=checkbox]')", in: web) as? Bool, true)
      try asciiKeypress("a", in: web)
      XCTAssertEqual(try snapshot(controller), "- [ ] a")
      XCTAssertEqual(
        try js("!!document.querySelector('#editor input[type=checkbox]')", in: web) as? Bool, true)
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "- [ ]")
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "- []")
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "-[]")
      try history(redo: true, controller: controller)
      try history(redo: true, controller: controller)
      try history(redo: true, controller: controller)
      XCTAssertEqual(try snapshot(controller), "- [ ] a")
    }
  }

  @MainActor
  private func focusTextOffset(_ selector: String, offset: Int, in web: WKWebView) throws {
    let data = try JSONEncoder().encode(selector)
    let json = try XCTUnwrap(String(data: data, encoding: .utf8))
    XCTAssertEqual(
      try js(
        """
        (() => {const e=document.querySelector('#editor');e.focus();
        const p=document.querySelector(\(json));if(!p)return false;
        const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);const n=walker.nextNode();
        if(!n || n.length < \(offset))return false;
        const r=document.createRange();r.setStart(n,\(offset));r.collapse(true);
        const s=getSelection();s.removeAllRanges();s.addRange(r);return true;})()
        """, in: web) as? Bool, true)
  }

  @MainActor
  private func asciiKeypress(_ character: String, in web: WKWebView) throws {
    let data = try JSONEncoder().encode(character)
    let json = try XCTUnwrap(String(data: data, encoding: .utf8))
    _ = try js(
      """
      (() => {const e=document.querySelector('#editor'),text=\(json),code=text.charCodeAt(0);
      const key=new KeyboardEvent('keypress',{key:text,charCode:code,keyCode:code,which:code,bubbles:true,cancelable:true});
      if(e.dispatchEvent(key))document.execCommand('insertText',false,text);return true;})()
      """, in: web)
    RunLoop.current.run(until: Date().addingTimeInterval(0.05))
  }

  @MainActor
  func testEmptyTaskLabelCompositionKeepsCheckboxAndCandidate() throws {
    try withEditor("- [ ]") { controller, web in
      try focus("#editor li p", in: web)
      try startCandidate(in: web)
      XCTAssertEqual(try js("window.writingCandidate.isConnected", in: web) as? Bool, true)
      try confirmCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.04))
      XCTAssertEqual(try js("window.writingCandidate.isConnected", in: web) as? Bool, true)
      try endCandidate(in: web)
      RunLoop.current.run(until: Date().addingTimeInterval(0.15))
      let accepted = try versionedSnapshot(controller)
      XCTAssertEqual(accepted.text, "- [ ] 中")
      XCTAssertEqual(accepted.revision, 1)
      XCTAssertEqual(
        try js("!!document.querySelector('#editor input[type=checkbox]')", in: web) as? Bool, true)
      try history(redo: false, controller: controller)
      XCTAssertEqual(try snapshot(controller), "- [ ]")
      try history(redo: true, controller: controller)
      XCTAssertEqual(try snapshot(controller), "- [ ] 中")
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
      }
      // A fresh session proves both keys without an intervening snapshot or refocus.
      try withEditor(row.raw) { controller, web in
        try focus(row.selector, atStart: true, in: web)
        try keys(["<Backspace>", "<Backspace>"], in: web)
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
    let window = SnapshotFocusWindow(contentViewController: controller)
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

// Forwards to a real NSWindow/WKView. The public responder transition is observed,
// not replaced; snapshots must not defocus an idle authoring surface.
private final class SnapshotFocusWindow: NSWindow {
  var focusResetRequests = 0
  override func makeFirstResponder(_ responder: NSResponder?) -> Bool {
    if responder == nil { focusResetRequests += 1 }
    return super.makeFirstResponder(responder)
  }
}
