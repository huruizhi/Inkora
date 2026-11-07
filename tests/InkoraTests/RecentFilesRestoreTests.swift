import XCTest

@MainActor
private final class FakeRecentDocumentList: RecentDocumentListManaging {
  var urls: [URL]

  init(urls: [URL] = []) {
    self.urls = urls
  }

  var recentDocumentURLs: [URL] {
    urls
  }

  func noteNewRecentDocumentURL(_ url: URL) {
    urls.removeAll { $0 == url }
    urls.insert(url, at: 0)
  }

  func clearRecentDocuments() {
    urls.removeAll()
  }
}

final class RecentFilesRestoreTests: XCTestCase {
  private let markdownType = "net.daringfireball.markdown"

  private func makeIsolatedDefaults() -> UserDefaults {
    let suite = "RecentFilesRestoreTests-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defaults.removePersistentDomain(forName: suite)
    return defaults
  }

  private func makeTemporaryFile(
    _ name: String = "Recent-\(UUID().uuidString).md"
  ) throws -> URL {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("RecentFilesRestoreTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent(name)
    try Data("# recent\n".utf8).write(to: url)
    return url
  }

  private func makeURL(_ name: String) -> URL {
    URL(fileURLWithPath: "/tmp/recent-files-tests/\(name)")
  }

  // MARK: - DocumentOpenHistory

  @MainActor
  func testNoteDocumentOpenedRoundTripsThroughBookmark() throws {
    let url = try makeTemporaryFile()
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())

    history.noteDocumentOpened(url)

    let resolved = try XCTUnwrap(history.resolveLastOpenedDocumentURL())
    XCTAssertEqual(resolved.lastPathComponent, url.lastPathComponent)
    XCTAssertTrue(FileManager.default.fileExists(atPath: resolved.path))
  }

  @MainActor
  func testUnconfiguredHistoryStoresNothing() throws {
    let url = try makeTemporaryFile()
    // A fresh unconfigured instance (as unit-test documents see `.shared`)
    // must not record anything.
    let unconfigured = DocumentOpenHistory()
    unconfigured.noteDocumentOpened(url)
    XCTAssertNil(unconfigured.resolveLastOpenedDocumentURL())
  }

  @MainActor
  func testClearRemovesLastOpenedDocument() throws {
    let url = try makeTemporaryFile()
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(url)

    history.clear()

    XCTAssertNil(history.resolveLastOpenedDocumentURL())
  }

  @MainActor
  func testResolveTracksMovedFile() throws {
    let url = try makeTemporaryFile()
    let moved = url.deletingLastPathComponent().appendingPathComponent("Moved.md")
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(url)

    try FileManager.default.moveItem(at: url, to: moved)

    let resolved = history.resolveLastOpenedDocumentURL()
    XCTAssertEqual(resolved?.lastPathComponent, "Moved.md")
    if let resolved {
      XCTAssertTrue(FileManager.default.fileExists(atPath: resolved.path))
    }
  }

  @MainActor
  func testResolveReturnsNilForCorruptBookmarkData() {
    let defaults = makeIsolatedDefaults()
    defaults.set(Data([0x01, 0x02, 0x03]), forKey: "LastOpenedDocumentBookmark")
    let history = DocumentOpenHistory(defaults: defaults)

    XCTAssertNil(history.resolveLastOpenedDocumentURL())
    XCTAssertNil(defaults.data(forKey: "LastOpenedDocumentBookmark"))
  }

  // MARK: - LaunchDefaultsResolver

  func testLaunchArgumentSelectsIsolatedDefaultsSuite() {
    let suiteName = "LaunchDefaults-\(UUID().uuidString)"
    let defaults = LaunchDefaultsResolver.defaults(
      arguments: ["Inkora", "-INKTestDefaultsSuite", suiteName]
    )
    defaults.set(true, forKey: "probe")

    XCTAssertEqual(defaults.object(forKey: "probe") as? Bool, true)
    XCTAssertNil(UserDefaults.standard.object(forKey: "probe"))
  }

  func testMissingLaunchArgumentFallsBackToStandardDefaults() {
    let defaults = LaunchDefaultsResolver.defaults(arguments: ["Inkora"])
    XCTAssertTrue(defaults === UserDefaults.standard)

    let truncated = LaunchDefaultsResolver.defaults(arguments: ["Inkora", "-INKTestDefaultsSuite"])
    XCTAssertTrue(truncated === UserDefaults.standard)
  }

  // MARK: - RecentDocumentList

  @MainActor
  func testRemovingRecentURLPreservesRemainingOrder() {
    let first = makeURL("a.md")
    let second = makeURL("b.md")
    let third = makeURL("c.md")
    let list = FakeRecentDocumentList(urls: [first, second, third])

    RecentDocumentList.remove(second, from: list)

    XCTAssertEqual(list.urls, [first, third])
  }

  @MainActor
  func testRemovingUnknownURLLeavesListUnchanged() {
    let first = makeURL("a.md")
    let second = makeURL("b.md")
    let list = FakeRecentDocumentList(urls: [first, second])

    RecentDocumentList.remove(makeURL("missing.md"), from: list)

    XCTAssertEqual(list.urls, [first, second])
  }

  @MainActor
  func testMissingFileErrorClassification() {
    XCTAssertTrue(
      RecentDocumentList.isMissingFileError(
        NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError)
      )
    )
    XCTAssertTrue(
      RecentDocumentList.isMissingFileError(
        NSError(
          domain: NSCocoaErrorDomain,
          code: NSFileReadUnknownError,
          userInfo: [
            NSUnderlyingErrorKey: NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT))
          ]
        )
      )
    )
    XCTAssertFalse(
      RecentDocumentList.isMissingFileError(
        NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoPermissionError)
      )
    )
    XCTAssertFalse(RecentDocumentList.isMissingFileError(InkoraDocumentError.invalidUTF8))
    XCTAssertFalse(
      RecentDocumentList.isMissingFileError(
        NSError(domain: NSPOSIXErrorDomain, code: Int(ENOENT))
      )
    )
  }

  // MARK: - LastDocumentRestoreController

  @MainActor
  func testRestoreOpensReachableLastDocument() throws {
    let url = try makeTemporaryFile()
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(url)
    var openedURLs: [URL] = []
    var untitledOpens = 0
    var presentedErrors: [Error] = []
    let controller = LastDocumentRestoreController(
      history: history,
      documentsAreOpen: { false },
      openDocument: { url, completion in
        openedURLs.append(url)
        completion(nil)
      },
      openUntitledDocument: { untitledOpens += 1 },
      presentError: { presentedErrors.append($0) }
    )

    XCTAssertTrue(controller.restoreLastDocumentIfNeeded())
    XCTAssertEqual(openedURLs.map { $0.resolvingSymlinksInPath() }, [url.resolvingSymlinksInPath()])
    XCTAssertEqual(untitledOpens, 0)
    XCTAssertTrue(presentedErrors.isEmpty)
  }

  @MainActor
  func testRestoreSkipsAndClearsWhenLastDocumentIsMissing() throws {
    let url = try makeTemporaryFile()
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(url)
    try FileManager.default.removeItem(at: url)
    var openedURLs: [URL] = []
    let controller = LastDocumentRestoreController(
      history: history,
      documentsAreOpen: { false },
      openDocument: { url, completion in
        openedURLs.append(url)
        completion(nil)
      },
      openUntitledDocument: {},
      presentError: { _ in }
    )

    XCTAssertFalse(controller.restoreLastDocumentIfNeeded())
    XCTAssertTrue(openedURLs.isEmpty, "A missing file must not be opened")
    XCTAssertNil(history.resolveLastOpenedDocumentURL(), "Stale bookmark must be cleared")
  }

  @MainActor
  func testRestoreDoesNothingWithoutHistoryOrWithDocumentsOpen() throws {
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    var openedURLs: [URL] = []
    let makeController: (@escaping () -> Bool) -> LastDocumentRestoreController = {
      documentsAreOpen in
      LastDocumentRestoreController(
        history: history,
        documentsAreOpen: documentsAreOpen,
        openDocument: { url, completion in
          openedURLs.append(url)
          completion(nil)
        },
        openUntitledDocument: {},
        presentError: { _ in }
      )
    }

    XCTAssertFalse(makeController { false }.restoreLastDocumentIfNeeded())

    let url = try makeTemporaryFile()
    history.noteDocumentOpened(url)
    XCTAssertFalse(makeController { true }.restoreLastDocumentIfNeeded())
    XCTAssertTrue(openedURLs.isEmpty)
  }

  @MainActor
  func testRestoreReadFailurePresentsErrorClearsHistoryAndOpensUntitled() throws {
    let url = try makeTemporaryFile()
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(url)
    var untitledOpens = 0
    var presentedErrors: [Error] = []
    let controller = LastDocumentRestoreController(
      history: history,
      documentsAreOpen: { false },
      openDocument: { _, completion in
        completion(InkoraDocumentError.invalidUTF8)
      },
      openUntitledDocument: { untitledOpens += 1 },
      presentError: { presentedErrors.append($0) }
    )

    XCTAssertTrue(controller.restoreLastDocumentIfNeeded())
    XCTAssertEqual(presentedErrors.count, 1)
    XCTAssertEqual(untitledOpens, 1)
    XCTAssertNil(history.resolveLastOpenedDocumentURL())
  }

  @MainActor
  func testRestoreMissingFileFailureIsSilentButStillClearsAndFallsBack() throws {
    let url = try makeTemporaryFile()
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(url)
    var untitledOpens = 0
    var presentedErrors: [Error] = []
    let controller = LastDocumentRestoreController(
      history: history,
      documentsAreOpen: { false },
      openDocument: { _, completion in
        completion(
          NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError)
        )
      },
      openUntitledDocument: { untitledOpens += 1 },
      presentError: { presentedErrors.append($0) }
    )

    XCTAssertTrue(controller.restoreLastDocumentIfNeeded())
    XCTAssertTrue(presentedErrors.isEmpty, "Deleted files restore silently")
    XCTAssertEqual(untitledOpens, 1)
    XCTAssertNil(history.resolveLastOpenedDocumentURL())
  }

  // MARK: - OpenRecentMenuController

  @MainActor
  func testMenuBuildsEntriesFromRecentList() {
    let first = makeURL("First Recent.md")
    let second = makeURL("Second Recent.md")
    let controller = OpenRecentMenuController(
      list: FakeRecentDocumentList(urls: [first, second]),
      openDocument: { _, completion in completion(nil) },
      presentError: { _ in },
      presentMissingFile: { _ in }
    )

    controller.rebuild()

    let items = controller.menuItem.submenu?.items ?? []
    XCTAssertEqual(
      items.map(\.title),
      ["First Recent.md", "Second Recent.md", "", "Clear Menu"]
    )
    XCTAssertEqual(items[0].representedObject as? URL, first)
    XCTAssertEqual(items[1].representedObject as? URL, second)
    XCTAssertTrue(items[0].target === controller)
    XCTAssertTrue(items[3].target === controller)
    XCTAssertEqual(items.count, 4)
  }

  @MainActor
  func testEmptyListBuildsOnlyClearMenu() {
    let controller = OpenRecentMenuController(
      list: FakeRecentDocumentList(urls: []),
      openDocument: { _, completion in completion(nil) },
      presentError: { _ in },
      presentMissingFile: { _ in }
    )

    controller.rebuild()

    let items = controller.menuItem.submenu?.items ?? []
    XCTAssertEqual(items.map(\.title), ["Clear Menu"])
  }

  @MainActor
  func testClearMenuItemValidationTracksListContents() {
    let list = FakeRecentDocumentList(urls: [])
    let controller = OpenRecentMenuController(
      list: list,
      openDocument: { _, completion in completion(nil) },
      presentError: { _ in },
      presentMissingFile: { _ in }
    )
    controller.rebuild()
    let clearItem = controller.menuItem.submenu?.items.first

    XCTAssertFalse(controller.validateMenuItem(clearItem!))

    list.noteNewRecentDocumentURL(makeURL("a.md"))
    XCTAssertTrue(controller.validateMenuItem(clearItem!))
  }

  @MainActor
  func testClearActionClearsListAndRebuildsMenu() {
    let list = FakeRecentDocumentList(urls: [makeURL("a.md")])
    let controller = OpenRecentMenuController(
      list: list,
      openDocument: { _, completion in completion(nil) },
      presentError: { _ in },
      presentMissingFile: { _ in }
    )
    controller.rebuild()
    let clearItem = controller.menuItem.submenu?.items.last

    controller.clearRecentDocuments(clearItem!)

    XCTAssertTrue(list.urls.isEmpty)
    XCTAssertEqual(
      controller.menuItem.submenu?.items.map(\.title),
      ["Clear Menu"],
      "Menu must rebuild after clearing"
    )
  }

  @MainActor
  func testOpenRecentActionRemovesEntryWhenFileIsMissing() {
    let missing = makeURL("Missing.md")
    let other = makeURL("Present.md")
    let list = FakeRecentDocumentList(urls: [missing, other])
    var openedURLs: [URL] = []
    var missingAlerts: [URL] = []
    var presentedErrors: [Error] = []
    let controller = OpenRecentMenuController(
      list: list,
      openDocument: { url, completion in
        openedURLs.append(url)
        completion(NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoSuchFileError))
      },
      presentError: { presentedErrors.append($0) },
      presentMissingFile: { missingAlerts.append($0) }
    )
    controller.rebuild()
    let entry = controller.menuItem.submenu?.items.first

    controller.openRecentDocument(entry!)

    XCTAssertEqual(openedURLs, [missing])
    XCTAssertEqual(missingAlerts, [missing], "Missing entry must explain the failure")
    XCTAssertTrue(presentedErrors.isEmpty)
    XCTAssertEqual(list.urls, [other], "Missing entry must be removed from the list")
  }

  @MainActor
  func testOpenRecentActionPresentsNonMissingErrorsWithoutRemoval() {
    let url = makeURL("Broken.md")
    let list = FakeRecentDocumentList(urls: [url])
    var missingAlerts: [URL] = []
    var presentedErrors: [Error] = []
    let controller = OpenRecentMenuController(
      list: list,
      openDocument: { _, completion in completion(InkoraDocumentError.invalidUTF8) },
      presentError: { presentedErrors.append($0) },
      presentMissingFile: { missingAlerts.append($0) }
    )
    controller.rebuild()
    let entry = controller.menuItem.submenu?.items.first

    controller.openRecentDocument(entry!)

    XCTAssertEqual(presentedErrors.count, 1)
    XCTAssertTrue(missingAlerts.isEmpty)
    XCTAssertEqual(list.urls, [url], "Existing files stay in the list on read errors")
  }

  // MARK: - InkoraDocument integration

  @MainActor
  func testSuccessfulURLReadRecordsLastOpenedDocument() throws {
    let url = try makeTemporaryFile()
    let defaults = makeIsolatedDefaults()
    let history = DocumentOpenHistory(defaults: defaults)
    let document = InkoraDocument(
      editorResourceBundle: .main,
      snapshotRequester: { _ in },
      openHistory: history
    )

    try document.read(from: url, ofType: markdownType)

    let resolved = history.resolveLastOpenedDocumentURL()
    XCTAssertEqual(resolved?.lastPathComponent, url.lastPathComponent)
    XCTAssertTrue(FileManager.default.fileExists(atPath: resolved?.path ?? ""))
  }

  @MainActor
  func testFailedURLReadDoesNotReplaceLastOpenedDocument() throws {
    let good = try makeTemporaryFile("Good-\(UUID().uuidString).md")
    let broken = try makeTemporaryFile("Broken-\(UUID().uuidString).md")
    try Data([0xC3, 0x28]).write(to: broken)
    let history = DocumentOpenHistory(defaults: makeIsolatedDefaults())
    history.noteDocumentOpened(good)
    let document = InkoraDocument(
      editorResourceBundle: .main,
      snapshotRequester: { _ in },
      openHistory: history
    )

    XCTAssertThrowsError(try document.read(from: broken, ofType: markdownType))

    XCTAssertEqual(
      history.resolveLastOpenedDocumentURL()?.lastPathComponent,
      good.lastPathComponent
    )
  }

  @MainActor
  func testDocumentFrameAutosaveDoesNotCollideWithUntitledWindow() throws {
    let untitled = InkoraDocument()
    untitled.makeWindowControllers()
    let url = try makeTemporaryFile()
    let document = InkoraDocument()
    document.fileURL = url
    document.makeWindowControllers()
    defer {
      untitled.close()
      document.close()
    }

    let untitledWindow = try XCTUnwrap(untitled.windowControllers.first?.window)
    let documentWindow = try XCTUnwrap(document.windowControllers.first?.window)
    XCTAssertEqual(untitledWindow.frameAutosaveName, "InkoraDocumentWindow")
    XCTAssertEqual(
      documentWindow.frameAutosaveName,
      "InkoraDocumentWindow-" + url.resolvingSymlinksInPath().absoluteString)
    XCTAssertNotEqual(documentWindow.frameAutosaveName, untitledWindow.frameAutosaveName)
  }

  @MainActor
  func testDocumentWindowUsesFrameAutosaveAndOptsOutOfAutomaticRestoration() {
    let document = InkoraDocument(
      editorResourceBundle: .main,
      snapshotRequester: { _ in }
    )

    document.makeWindowControllers()

    defer { document.close() }
    let window = document.windowControllers.first?.window
    XCTAssertNotNil(window)
    XCTAssertEqual(window?.frameAutosaveName, "InkoraDocumentWindow")
    XCTAssertEqual(window?.isRestorable, false)
  }
}
