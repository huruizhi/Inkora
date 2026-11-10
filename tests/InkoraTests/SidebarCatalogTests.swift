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
  func testRawUTF16LocationAndVersionRejectChangedBytes() throws {
    let root = try folder()
    let url = root.appendingPathComponent("raw.md")
    let raw = "\u{FEFF}# 👩🏽‍💻\r\n命中\r\n命中"
    try Data(raw.utf8).write(to: url)
    let catalog = try SidebarCatalog.scan(folder: root)
    let hits = try catalog.search("命中", options: SidebarSearchOptions()).hits
    XCTAssertEqual(hits.map(\.line), [2, 3])
    XCTAssertEqual(hits[0].utf16Location, (raw as NSString).range(of: "命中").location)
    XCTAssertEqual(hits[0].utf16Length, 2)
    XCTAssertEqual(hits[0].fileVersion, SidebarCatalog.version(Data(raw.utf8)))
    let opened = try catalog.openFile(id: hits[1].fileID, catalogID: catalog.id, hit: hits[1])
    XCTAssertEqual(opened.data, Data(raw.utf8))
    XCTAssertNotNil(opened.modified)
    XCTAssertEqual(opened.location?.utf16Location, hits[1].utf16Location)
    try Data(raw.replacingOccurrences(of: "命中", with: "改变").utf8).write(to: url)
    XCTAssertThrowsError(
      try catalog.openFile(id: hits[0].fileID, catalogID: catalog.id, hit: hits[0]))
  }

  func testReplacedAncestorAndRootCannotReuseCatalog() throws {
    let root = try folder()
    let rootIdentity = try SidebarCatalog.rootIdentity(folder: root)
    let child = root.appendingPathComponent("sub")
    try FileManager.default.createDirectory(at: child, withIntermediateDirectories: true)
    try Data("same".utf8).write(to: child.appendingPathComponent("a.md"))
    let catalog = try SidebarCatalog.scan(folder: root)
    let file = try XCTUnwrap(catalog.files.first)
    let outside = try folder()
    try Data("secret".utf8).write(to: outside.appendingPathComponent("a.md"))
    try FileManager.default.removeItem(at: child)
    try FileManager.default.createSymbolicLink(at: child, withDestinationURL: outside)
    XCTAssertThrowsError(try catalog.openFile(id: file.id, catalogID: catalog.id))
    try FileManager.default.removeItem(at: root)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    XCTAssertThrowsError(try SidebarCatalog.scan(folder: root, expectedRoot: rootIdentity))
    XCTAssertThrowsError(try catalog.openFile(id: file.id, catalogID: catalog.id))
    try FileManager.default.removeItem(at: root)
    try FileManager.default.createSymbolicLink(at: root, withDestinationURL: outside)
    XCTAssertThrowsError(try SidebarCatalog.scan(folder: root))
  }

  func testNaturalOrderBoundsAndChangedCatalogFingerprint() throws {
    let root = try folder()
    for name in ["10.md", "2.md", "1.md"] {
      try Data("alpha".utf8).write(to: root.appendingPathComponent(name))
    }
    let initial = try SidebarCatalog.scan(folder: root)
    XCTAssertEqual(initial.files.map(\.name), ["1.md", "2.md", "10.md"])
    XCTAssertEqual(initial.contentVersion, try SidebarCatalog.scan(folder: root).contentVersion)
    try Data("other".utf8).write(to: root.appendingPathComponent("2.md"))
    XCTAssertNotEqual(initial.contentVersion, try SidebarCatalog.scan(folder: root).contentVersion)
    let bytes = try SidebarCatalog.scan(folder: root, limits: .init(fileBytes: 2))
    XCTAssertTrue(bytes.files.isEmpty)
    XCTAssertEqual(bytes.skippedFiles, 3)
    XCTAssertTrue(try bytes.search("alpha", options: .init()).truncated)
    XCTAssertTrue(try SidebarCatalog.scan(folder: root, limits: .init(totalBytes: 1)).incomplete)
    XCTAssertTrue(
      try SidebarCatalog.scan(folder: root, limits: .init(directoryEntries: 1)).incomplete)
    XCTAssertThrowsError(try SidebarCatalog.scan(folder: root, limits: .init(scanSeconds: -1)))
    let timed = try SidebarCatalog.scan(folder: root, limits: .init(searchSeconds: -1))
    XCTAssertThrowsError(try timed.search("alpha", options: .init()))
    let nested = root.appendingPathComponent("nested")
    try FileManager.default.createDirectory(at: nested, withIntermediateDirectories: true)
    try Data("hidden by depth".utf8).write(to: nested.appendingPathComponent("deep.md"))
    XCTAssertTrue(try SidebarCatalog.scan(folder: root, limits: .init(depth: 0)).incomplete)
  }

  func testCancellationAfterReadStartsNeverReturnsPartialCatalogOrHits() throws {
    final class Counter: @unchecked Sendable {
      private let lock = NSLock()
      private var count = 0
      func cancelAfter(_ threshold: Int) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        count += 1
        return count > threshold
      }
    }
    let root = try folder()
    try Data(String(repeating: "alpha ", count: 50_000).utf8).write(
      to: root.appendingPathComponent("a.md"))
    let scanCounter = Counter()
    XCTAssertThrowsError(
      try SidebarCatalog.scan(folder: root, cancelled: { scanCounter.cancelAfter(7) }))
    let catalog = try SidebarCatalog.scan(folder: root)
    let searchCounter = Counter()
    XCTAssertThrowsError(
      try catalog.search("alpha", options: .init(), cancelled: { searchCounter.cancelAfter(8) }))
    XCTAssertThrowsError(try catalog.search("", options: .init(), cancelled: { true }))
  }

  func testRegexInsideGraphemeAndCatastrophicPatternAreBounded() throws {
    let root = try folder()
    try Data("e\u{0301}\r\n".utf8).write(to: root.appendingPathComponent("accent.md"))
    let catalog = try SidebarCatalog.scan(folder: root)
    let hit = try XCTUnwrap(
      catalog.search("\u{0301}", options: .init(regularExpression: true)).hits.first)
    XCTAssertEqual(hit.utf16Location, 1)
    XCTAssertEqual(hit.utf16Length, 1)
    try Data((String(repeating: "a", count: 30_000) + "!").utf8).write(
      to: root.appendingPathComponent("slow.md"))
    let bounded = try SidebarCatalog.scan(folder: root, limits: .init(searchSeconds: 0.02))
    let start = ProcessInfo.processInfo.systemUptime
    XCTAssertThrowsError(try bounded.search("(a+)+$", options: .init(regularExpression: true)))
    XCTAssertLessThan(ProcessInfo.processInfo.systemUptime - start, 1)
  }

}
