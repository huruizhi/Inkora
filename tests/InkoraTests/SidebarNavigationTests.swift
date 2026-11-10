import AppKit
import WebKit
import XCTest

final class SidebarNavigationTests: XCTestCase {
  @MainActor
  func testFullSizeTitlebarReachesWebViewWithoutCoveringSystemButtons() throws {
    guard let path = ProcessInfo.processInfo.environment["INKORA_SIDEBAR_RESOURCE_BUNDLE"],
      let bundle = Bundle(path: path)
    else { throw XCTSkip("需要本地已构建的编辑器资源bundle") }
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
