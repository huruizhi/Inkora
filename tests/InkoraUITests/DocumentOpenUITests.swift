import XCTest

final class DocumentOpenUITests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  @MainActor
  func testFileMenuExposesTheOpenCommand() {
    let app = launchApplication()
    defer { app.terminate() }
    let fileMenu = app.menuBars.menuBarItems["File"]
    XCTAssertTrue(fileMenu.waitForExistence(timeout: 5))
    fileMenu.click()

    let openItem = app.menuItems["Open…"]
    XCTAssertTrue(openItem.waitForExistence(timeout: 5))
    XCTAssertTrue(openItem.isEnabled)
  }

  @MainActor
  func testFileMenuExposesSaveAndSaveAsCommands() {
    let app = launchApplication()
    defer { app.terminate() }
    let fileMenu = app.menuBars.menuBarItems["File"]
    XCTAssertTrue(fileMenu.waitForExistence(timeout: 5))
    fileMenu.click()

    let saveItem = app.menuItems["Save"]
    let saveAsItem = app.menuItems["Save As…"]
    XCTAssertTrue(saveItem.waitForExistence(timeout: 5))
    XCTAssertTrue(saveAsItem.waitForExistence(timeout: 5))
    XCTAssertTrue(saveItem.isEnabled)
    XCTAssertTrue(saveAsItem.isEnabled)
  }

  @MainActor
  func testLaunchServicesOpenUsesTheMarkdownFilenameAsWindowTitle() throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("Finder Open 中文.md")
    try Data("# Finder open\n".utf8).write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    let documentWindow = app.windows["Finder Open 中文.md"]
    XCTAssertTrue(
      documentWindow.waitForExistence(timeout: 10),
      "Launch Services did not open the Markdown document window"
    )
  }

  @MainActor
  func testInvalidUTF8ShowsAnErrorWithoutOpeningADocumentWindow() throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("Invalid UTF8.md")
    try Data([0xC3, 0x28]).write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    XCTAssertFalse(app.windows["Invalid UTF8.md"].waitForExistence(timeout: 2))
    let errorDialog = app.dialogs.firstMatch
    XCTAssertTrue(
      errorDialog.waitForExistence(timeout: 10),
      "Invalid UTF-8 did not present an open error"
    )
  }

  @MainActor
  private func launchApplication() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-ApplePersistenceIgnoreState", "YES"]
    app.launch()
    let isRunning = app.wait(for: .runningForeground, timeout: 10)
    XCTAssertTrue(isRunning)
    return app
  }

  private func makeTemporaryDirectory() throws -> URL {
    let temporaryDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraUITests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
      at: temporaryDirectory,
      withIntermediateDirectories: true
    )
    return temporaryDirectory
  }

  @MainActor
  private func openWithLaunchServices(_ fileURL: URL) throws -> XCUIApplication {
    let app = XCUIApplication(bundleIdentifier: "com.huruizhi.Inkora")
    app.terminate()
    let applicationURL = try builtApplicationURL()
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-n", "-a", applicationURL.path, fileURL.path]
    try process.run()
    process.waitUntilExit()
    XCTAssertEqual(process.terminationStatus, 0)
    let isRunning = app.wait(for: .runningForeground, timeout: 10)
    XCTAssertTrue(isRunning)
    return app
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
