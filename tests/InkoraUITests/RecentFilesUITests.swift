import AppKit
import XCTest

final class RecentFilesUITests: AcceptanceTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  // MARK: - Cold start

  @MainActor
  func testColdLaunchServicesOpenShowsDocumentWithoutUntitledWindow() throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("Cold Start 中文.md")
    try Data("# cold start\n".utf8).write(to: fileURL)
    let app = try coldLaunchViaLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    let documentWindow = app.windows["Cold Start 中文.md"]
    XCTAssertTrue(
      documentWindow.waitForExistence(timeout: 15),
      "Cold Launch Services open did not open the document window"
    )
    XCTAssertFalse(
      app.windows["Untitled"].waitForExistence(timeout: 2),
      "Cold file launch must not also create an untitled document"
    )
  }

  // MARK: - Open Recent

  @MainActor
  func testOpenRecentListsOpenedDocumentReopensItAndClears() throws {
    let suite = isolatedDefaultsSuite()
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileName = "Recent 目标.md"
    let fileURL = temporaryDirectory.appendingPathComponent(fileName)
    try Data("# recent\n".utf8).write(to: fileURL)
    let app = launchApplication(defaultsSuite: suite)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    clearOpenRecent(in: app)

    try openViaLaunchServices(fileURL, in: app)
    let window = app.windows[fileName]
    XCTAssertTrue(window.waitForExistence(timeout: 10))
    window.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(window.waitForNonExistence(timeout: 5))

    let entry = openRecentEntry(fileName, in: app)
    XCTAssertTrue(
      entry.waitForExistence(timeout: 5),
      "Opened document missing from Open Recent"
    )
    entry.click()
    XCTAssertTrue(
      window.waitForExistence(timeout: 10),
      "Open Recent entry did not reopen the document"
    )

    clearOpenRecent(in: app)
    openMenu("File", in: app)
    let openRecent = app.menuBars.menuBarItems["File"].menuItems["Open Recent"]
    XCTAssertTrue(openRecent.waitForExistence(timeout: 5))
    openRecent.hover()
    XCTAssertFalse(
      openRecent.menuItems[fileName].waitForExistence(timeout: 2),
      "Clear Menu did not remove the recent entry"
    )
    app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])
  }

  @MainActor
  func testOpenRecentEntryForDeletedFileShowsAlertAndRemovesIt() throws {
    let suite = isolatedDefaultsSuite()
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileName = "Missing Recent.md"
    let fileURL = temporaryDirectory.appendingPathComponent(fileName)
    try Data("# missing\n".utf8).write(to: fileURL)
    let app = launchApplication(defaultsSuite: suite)
    defer {
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    clearOpenRecent(in: app)

    try openViaLaunchServices(fileURL, in: app)
    let window = app.windows[fileName]
    XCTAssertTrue(window.waitForExistence(timeout: 10))
    window.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(window.waitForNonExistence(timeout: 5))
    // NSDocumentController filters missing files when the menu is built.
    // Delete after expansion to exercise a visible entry becoming stale.
    let entry = openRecentEntry(fileName, in: app)
    XCTAssertTrue(entry.waitForExistence(timeout: 5))
    try FileManager.default.removeItem(at: fileURL)
    XCTAssertTrue(
      entry.exists, "The displayed entry must remain available for the stale-file click")
    entry.click()

    let dialog = app.dialogs.firstMatch
    XCTAssertTrue(
      dialog.waitForExistence(timeout: 10),
      "Missing recent file did not explain the failure"
    )
    XCTAssertTrue(
      dialog.staticTexts
        .matching(NSPredicate(format: "value CONTAINS %@", "removed from Open Recent"))
        .firstMatch.exists,
      "The alert must say the entry was removed from Open Recent"
    )
    let okButton = dialog.buttons["OK"]
    XCTAssertTrue(okButton.waitForExistence(timeout: 5))
    okButton.click()

    XCTAssertFalse(
      app.windows[fileName].waitForExistence(timeout: 2),
      "A missing recent file must not open a window"
    )
    let staleEntry = openRecentEntry(fileName, in: app)
    XCTAssertFalse(
      staleEntry.waitForExistence(timeout: 2),
      "Missing recent entry must be removed from the menu"
    )
    app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])
    app.terminate()
  }

  // MARK: - Relaunch restoration

  @MainActor
  func testRelaunchRestoresLastOpenedDocumentAndWindowFrame() throws {
    let suite = isolatedDefaultsSuite()
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileName = "Restore 恢复.md"
    let fileURL = temporaryDirectory.appendingPathComponent(fileName)
    try Data("# restore\n".utf8).write(to: fileURL)
    let app = launchApplication(defaultsSuite: suite)
    // Close Untitled so the relaunch assertion only observes the file window.
    let untitled = app.windows["Untitled"]
    if untitled.waitForExistence(timeout: 5) {
      untitled.typeKey("w", modifierFlags: .command)
    }
    try openViaLaunchServices(fileURL, in: app)
    let window = app.windows[fileName]
    XCTAssertTrue(window.waitForExistence(timeout: 10))
    let initialFrame = window.frame
    let titleBar = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.02))
    titleBar.click(forDuration: 0.2, thenDragTo: titleBar.withOffset(CGVector(dx: -80, dy: 60)))
    Thread.sleep(forTimeInterval: 1)
    let frame = window.frame
    XCTAssertGreaterThan(
      abs(frame.origin.x - initialFrame.origin.x) + abs(frame.origin.y - initialFrame.origin.y),
      20, "Move the window before verifying frame restoration"
    )
    window.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(window.waitForNonExistence(timeout: 5))
    app.terminate()

    let relaunched = launchApplication(defaultsSuite: suite)
    defer {
      relaunched.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    let restoredWindow = relaunched.windows[fileName]
    XCTAssertTrue(
      restoredWindow.waitForExistence(timeout: 15),
      "Relaunch did not restore the last opened document"
    )
    Thread.sleep(forTimeInterval: 1)
    let restoredFrame = restoredWindow.frame
    XCTAssertEqual(restoredFrame.origin.x, frame.origin.x, accuracy: 2)
    XCTAssertEqual(restoredFrame.origin.y, frame.origin.y, accuracy: 2)
    XCTAssertEqual(restoredFrame.width, frame.width, accuracy: 2)
    XCTAssertEqual(restoredFrame.height, frame.height, accuracy: 2)
    XCTAssertFalse(
      relaunched.windows["Untitled"].waitForExistence(timeout: 2),
      "Restoration must replace, not accompany, the untitled document"
    )
  }

  @MainActor
  func testRelaunchAfterDeletingLastDocumentOpensUntitled() throws {
    let suite = isolatedDefaultsSuite()
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileName = "Gone Document.md"
    let fileURL = temporaryDirectory.appendingPathComponent(fileName)
    try Data("# gone\n".utf8).write(to: fileURL)
    let app = launchApplication(defaultsSuite: suite)
    try openViaLaunchServices(fileURL, in: app)
    XCTAssertTrue(app.windows[fileName].waitForExistence(timeout: 10))
    app.terminate()
    try FileManager.default.removeItem(at: fileURL)
    defer {
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    let relaunched = launchApplication(defaultsSuite: suite)
    XCTAssertTrue(
      relaunched.windows["Untitled"].waitForExistence(timeout: 15),
      "Deleted last document must fall back to an untitled window"
    )
    XCTAssertFalse(
      relaunched.windows[fileName].waitForExistence(timeout: 2),
      "A deleted document must not restore"
    )
    relaunched.terminate()
  }

  // MARK: - Helpers

  @MainActor
  private func launchApplication(defaultsSuite: String) -> XCUIApplication {
    let app = diagnosticApplication()
    app.launchArguments = [
      "-ApplePersistenceIgnoreState", "YES",
      "-INKTestDefaultsSuite", defaultsSuite,
      "--inkora-test-recovery-session", UUID().uuidString,
    ]
    app.launch()
    let isRunning = app.wait(for: .runningForeground, timeout: 10)
    XCTAssertTrue(isRunning)
    return app
  }

  /// Launches the app cold through Launch Services (the app must not be
  /// running) and attaches XCUITest to the relaunched instance.
  @MainActor
  private func coldLaunchViaLaunchServices(_ fileURL: URL) throws -> XCUIApplication {
    XCUIApplication().terminate()
    let applicationURL = try builtApplicationURL()
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = [
      "-a", applicationURL.path, fileURL.path, "--args",
      "-ApplePersistenceIgnoreState", "YES",
      "-INKTestDefaultsSuite", isolatedDefaultsSuite(),
      "--inkora-test-recovery-session", UUID().uuidString,
    ]
    try process.run()
    process.waitUntilExit()
    XCTAssertEqual(process.terminationStatus, 0, "open -a did not launch the app")

    let app = diagnosticApplication()
    var isRunning = app.wait(for: .runningForeground, timeout: 15)
    if !isRunning {
      app.activate()
      isRunning = app.wait(for: .runningForeground, timeout: 10)
    }
    XCTAssertTrue(isRunning, "Could not observe the cold-launched app")
    return app
  }

  @MainActor
  private func openViaLaunchServices(_ fileURL: URL, in app: XCUIApplication) throws {
    let applicationURL = try builtApplicationURL()
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-a", applicationURL.path, fileURL.path]
    try process.run()
    process.waitUntilExit()
    XCTAssertEqual(process.terminationStatus, 0)
  }

  @MainActor
  private func openMenu(_ title: String, in app: XCUIApplication) {
    let menu = app.menuBars.menuBarItems[title]
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    menu.click()
  }

  /// Hovers File > Open Recent and returns the entry menu item for `title`.
  @MainActor
  private func openRecentEntry(_ title: String, in app: XCUIApplication) -> XCUIElement {
    openMenu("File", in: app)
    let openRecent = app.menuBars.menuBarItems["File"].menuItems["Open Recent"]
    XCTAssertTrue(openRecent.waitForExistence(timeout: 5))
    openRecent.hover()
    return openRecent.menuItems[title]
  }

  @MainActor
  private func clearOpenRecent(in app: XCUIApplication) {
    openMenu("File", in: app)
    let openRecent = app.menuBars.menuBarItems["File"].menuItems["Open Recent"]
    guard openRecent.waitForExistence(timeout: 5) else {
      app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])
      return
    }
    openRecent.hover()
    let clearItem = openRecent.menuItems["Clear Menu"]
    if clearItem.waitForExistence(timeout: 3), clearItem.isEnabled {
      clearItem.click()
    } else {
      app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])
    }
  }

  private func isolatedDefaultsSuite() -> String {
    "InkoraRecentFilesUITests-\(UUID().uuidString)"
  }

  private func makeTemporaryDirectory() throws -> URL {
    let temporaryDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraRecentFilesUITests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
      at: temporaryDirectory,
      withIntermediateDirectories: true
    )
    return temporaryDirectory
  }

  private func builtApplicationURL() throws -> URL {
    var searchURL = Bundle(for: Self.self).bundleURL
    for _ in 0..<8 {
      let candidate = searchURL.appendingPathComponent("Inkora.app", isDirectory: true)
      if FileManager.default.fileExists(atPath: candidate.path) {
        return candidate
      }
      searchURL.deleteLastPathComponent()
    }
    throw NSError(
      domain: "InkoraUITests",
      code: 1,
      userInfo: [
        NSLocalizedDescriptionKey: "Could not locate Inkora.app beside the UI test runner"
      ]
    )
  }
}
