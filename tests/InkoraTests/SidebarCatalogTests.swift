import XCTest

final class SidebarCatalogTests: XCTestCase {
  private func folder() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: url) }
    return url
  }

  func testCatalogListsNestedDocumentsAndPreservesExactBOMAndCRLFOnOpen() throws {
    let root = try folder()
    let sub = root.appendingPathComponent("子目录")
    try FileManager.default.createDirectory(at: sub, withIntermediateDirectories: true)
    let raw = Data("\u{FEFF}# 中文\r\n\r\n正文\u{FEFF}。\r\n".utf8)
    try raw.write(to: sub.appendingPathComponent("中文.md"))
    try Data("hidden".utf8).write(to: root.appendingPathComponent(".hidden.md"))
    try Data([0xFF, 0xFE, 0x61, 0]).write(to: root.appendingPathComponent("utf16.md"))
    try Data([1, 2, 3]).write(to: root.appendingPathComponent("image.png"))
    let outside = try folder().appendingPathComponent("private.md")
    try Data("secret".utf8).write(to: outside)
    try FileManager.default.createSymbolicLink(
      at: root.appendingPathComponent("link.md"), withDestinationURL: outside)

    let catalog = try SidebarCatalog.scan(folder: root)
    XCTAssertEqual(catalog.files.map(\.relativePath), ["子目录/中文.md"])
    XCTAssertEqual(catalog.skippedFiles, 1)
    let item = try XCTUnwrap(catalog.files.first)
    XCTAssertEqual(item.summary, "# 中文\n正文\u{FEFF}。")
    let opened = try catalog.openFile(id: item.id, catalogID: catalog.id)
    XCTAssertEqual(opened.data, raw)
    XCTAssertEqual(opened.url, sub.appendingPathComponent("中文.md"))
  }

  func testOldCatalogTokensAndReplacedSymlinkCannotOpenAFile() throws {
    let root = try folder()
    let url = root.appendingPathComponent("a.md")
    try Data("before".utf8).write(to: url)
    let first = try SidebarCatalog.scan(folder: root)
    let item = try XCTUnwrap(first.files.first)
    let next = try SidebarCatalog.scan(folder: root)
    XCTAssertThrowsError(try next.openFile(id: item.id, catalogID: first.id))
    XCTAssertThrowsError(try first.openFile(id: "../a.md", catalogID: first.id))
    try FileManager.default.removeItem(at: url)
    let outside = try folder().appendingPathComponent("outside.md")
    try Data("not authorized".utf8).write(to: outside)
    try FileManager.default.createSymbolicLink(at: url, withDestinationURL: outside)
    XCTAssertThrowsError(try first.openFile(id: item.id, catalogID: first.id))
  }

  func testFolderSearchSupportsLiteralCaseWholeWordsRegexAndLineSnippets() throws {
    let root = try folder()
    try Data("# Header\r\nAlpha alpha alphabet\r\n中文 👩🏽‍💻\n".utf8).write(
      to: root.appendingPathComponent("a.md"))
    try Data("alpha\nbeta\n".utf8).write(to: root.appendingPathComponent("b.md"))
    let catalog = try SidebarCatalog.scan(folder: root)
    let whole = try catalog.search("alpha", options: SidebarSearchOptions(wholeWord: true))
    XCTAssertEqual(whole.hits.count, 3)
    XCTAssertEqual(whole.hits.first?.line, 2)
    XCTAssertEqual(whole.hits.first?.snippet, "Alpha alpha alphabet")
    XCTAssertEqual(
      try catalog.search("Alpha", options: SidebarSearchOptions(caseSensitive: true)).hits.count, 1)
    XCTAssertEqual(
      try catalog.search("^beta$", options: SidebarSearchOptions(regularExpression: true)).hits
        .count, 0)
    XCTAssertEqual(
      try catalog.search("(?m)^beta$", options: SidebarSearchOptions(regularExpression: true)).hits
        .first?.snippet, "beta")
    XCTAssertEqual(try catalog.search(".*", options: SidebarSearchOptions()).hits.count, 0)
    XCTAssertThrowsError(
      try catalog.search("[", options: SidebarSearchOptions(regularExpression: true)))
  }

  func testLimitsAreVisibleAndCancellationDoesNotReturnPartialSuccess() throws {
    let root = try folder()
    try Data("alpha alpha".utf8).write(to: root.appendingPathComponent("a.md"))
    try Data("alpha".utf8).write(to: root.appendingPathComponent("b.md"))
    let catalog = try SidebarCatalog.scan(
      folder: root, limits: SidebarCatalog.Limits(files: 1, searchHits: 1))
    XCTAssertTrue(catalog.incomplete)
    let result = try catalog.search("alpha", options: SidebarSearchOptions())
    XCTAssertEqual(result.hits.count, 1)
    XCTAssertTrue(result.truncated)
    XCTAssertThrowsError(
      try catalog.search("alpha", options: SidebarSearchOptions(), cancelled: { true }))
    XCTAssertThrowsError(try SidebarCatalog.scan(folder: root, cancelled: { true }))
  }
}
