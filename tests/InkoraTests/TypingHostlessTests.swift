import AppKit
import WebKit
import XCTest

final class TypingHostlessTests: XCTestCase {
  @MainActor
  func testEmptyDocumentHeadingTypingRemainsEditableAndCanPrepareToClose() throws {
    let bundle =
      ProcessInfo.processInfo.environment["INKORA_TYPING_RESOURCE_BUNDLE"]
      .flatMap(Bundle.init(path:)) ?? Bundle(for: Self.self)
    let document = InkoraDocument()
    try document.read(from: Data(), ofType: "net.daringfireball.markdown")
    let controller = EditorViewController(document: document, resourceBundle: bundle)
    let window = NSWindow(contentViewController: controller)
    let webView = try XCTUnwrap(controller.view as? WKWebView)
    document.attachSidebarEditor(controller)
    defer { window.close() }
    let deadline = Date().addingTimeInterval(8)
    while try js("!document.querySelector('#editor.ProseMirror')", webView) as? Bool != false,
      Date() < deadline
    { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    XCTAssertEqual(try snapshot(controller), "")
    _ = try js(
      """
      (() => { const e=document.querySelector('#editor');e.focus();
        const r=document.createRange(); r.selectNodeContents(e.firstChild);r.collapse(true);
        const s=getSelection();s.removeAllRanges();s.addRange(r);return true; })()
      """, webView)
    for (text, expected) in [("#", "#"), (" ", "# "), ("标题", "# 标题")] {
      let data = try JSONSerialization.data(withJSONObject: [text])
      let json = try XCTUnwrap(String(data: data, encoding: .utf8))
      XCTAssertEqual(
        try js("document.execCommand('insertText',false,\(json)[0])", webView) as? Bool, true)
      XCTAssertEqual(try snapshot(controller), expected)
    }
    XCTAssertEqual(try js("document.querySelector('#editor h1') !== null", webView) as? Bool, true)
    XCTAssertEqual(try js("document.execCommand('delete',false,null)", webView) as? Bool, true)
    XCTAssertEqual(try snapshot(controller), "# 标")
    XCTAssertEqual(
      try js("document.execCommand('insertParagraph',false,null)", webView) as? Bool, true)
    XCTAssertEqual(try snapshot(controller), "# 标\n\n")
    XCTAssertEqual(try js("document.execCommand('insertText',false,'正文')", webView) as? Bool, true)
    XCTAssertEqual(try snapshot(controller), "# 标\n\n正文")
    _ = try js(
      "document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true}))",
      webView)
    XCTAssertEqual(try snapshot(controller), "# 标\n\n")
    _ = try js(
      "document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,shiftKey:true,bubbles:true}))",
      webView)
    XCTAssertEqual(try snapshot(controller), "# 标\n\n正文")
    var closed = false
    var closeError: Error?
    document.prepareForClose { error in
      closeError = error
      closed = true
    }
    let closeDeadline = Date().addingTimeInterval(5)
    while !closed && Date() < closeDeadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.01))
    }
    XCTAssertTrue(closed)
    XCTAssertNil(closeError)
    XCTAssertFalse(window.isVisible)
  }

  @MainActor
  private func js(_ script: String, _ view: WKWebView) throws -> Any? {
    var done = false
    var value: Any?
    var failure: Error?
    view.evaluateJavaScript(script) { result, error in
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
