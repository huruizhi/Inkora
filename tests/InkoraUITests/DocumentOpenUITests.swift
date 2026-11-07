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
  func testUndoRedoMenusAndShortcutsWhileWebEditorHasFocus() async throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("History Commands.md")
    try Data("<custom-tag>original</custom-tag>".utf8).write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    let editor = sourceEditor(in: app)
    XCTAssertTrue(
      editor.waitForExistence(timeout: 10),
      "Could not locate the source editor in the accessibility hierarchy:\n\(app.debugDescription)"
    )

    replaceText(in: editor, with: "<custom-tag>changed</custom-tag>")
    XCTAssertTrue(waitForValue(editor, containing: "changed"))

    openMenu("Edit", in: app)
    let undoItem = app.menuItems["Undo"]
    XCTAssertTrue(undoItem.isEnabled)
    undoItem.click()
    XCTAssertTrue(waitForValue(editor, containing: "original"))

    editor.click()
    editor.typeKey("z", modifierFlags: [.command, .shift])
    XCTAssertTrue(waitForValue(editor, containing: "changed"))
    editor.typeKey("z", modifierFlags: .command)
    XCTAssertTrue(waitForValue(editor, containing: "original"))

    openMenu("Edit", in: app)
    let redoItem = app.menuItems["Redo"]
    XCTAssertTrue(redoItem.isEnabled)
    redoItem.click()
    XCTAssertTrue(waitForValue(editor, containing: "changed"))
  }

  @MainActor
  func testFileMenusAndShortcutsWhileWebEditorHasFocus() async throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("File Commands.md")
    try Data("<custom-tag>original</custom-tag>".utf8).write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    let editor = sourceEditor(in: app)
    XCTAssertTrue(
      editor.waitForExistence(timeout: 10),
      "Could not locate the source editor in the accessibility hierarchy:\n\(app.debugDescription)"
    )

    replaceText(in: editor, with: "<custom-tag>shortcut-save</custom-tag>")
    editor.typeKey("s", modifierFlags: .command)
    let shortcutSaved = await waitForFile(fileURL, containing: "shortcut-save")
    XCTAssertTrue(
      shortcutSaved,
      "Cmd+S did not persist the focused editor"
    )

    editor.click()
    editor.typeKey("s", modifierFlags: [.command, .shift])
    try cancelFilePanel(in: app)
    editor.click()
    editor.typeKey("o", modifierFlags: .command)
    try cancelFilePanel(in: app)

    replaceText(in: editor, with: "<custom-tag>menu-save</custom-tag>")
    openMenu("File", in: app)
    app.menuItems["Save"].click()
    let menuSaved = await waitForFile(fileURL, containing: "menu-save")
    XCTAssertTrue(
      menuSaved,
      "File > Save did not persist the focused editor"
    )

    openMenu("File", in: app)
    app.menuItems["Save As…"].click()
    try cancelFilePanel(in: app)
    openMenu("File", in: app)
    app.menuItems["Open…"].click()
    try cancelFilePanel(in: app)
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
  private func replaceText(in editor: XCUIElement, with text: String) {
    editor.click()
    editor.typeKey("a", modifierFlags: .command)
    editor.typeText(text)
  }

  @MainActor
  private func sourceEditor(in app: XCUIApplication) -> XCUIElement {
    let accessibleName = "Markdown source editor"
    let labeledEditor = app.descendants(matching: .any).matching(
      NSPredicate(
        format: "identifier == %@ OR label == %@",
        accessibleName,
        accessibleName
      )
    ).firstMatch
    if labeledEditor.waitForExistence(timeout: 3) {
      return labeledEditor
    }
    return app.descendants(matching: .textView).firstMatch
  }

  @MainActor
  private func openMenu(_ title: String, in app: XCUIApplication) {
    let menu = app.menuBars.menuBarItems[title]
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    menu.click()
  }

  @MainActor
  private func cancelFilePanel(in app: XCUIApplication) throws {
    let cancelButton = app.buttons["Cancel"].firstMatch
    guard cancelButton.waitForExistence(timeout: 5) else {
      throw NSError(
        domain: "InkoraUITests",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "File panel did not appear"]
      )
    }
    cancelButton.click()
  }

  @MainActor
  private func waitForValue(_ element: XCUIElement, containing text: String) -> Bool {
    let predicate = NSPredicate(format: "value CONTAINS %@", text)
    let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
    return XCTWaiter.wait(for: [expectation], timeout: 5) == .completed
  }

  @MainActor
  private func waitForFile(_ url: URL, containing text: String) async -> Bool {
    for _ in 0..<50 {
      if let contents = try? String(contentsOf: url, encoding: .utf8),
        contents.contains(text)
      {
        return true
      }
      try? await Task.sleep(for: .milliseconds(100))
    }
    return false
  }

  @MainActor
  private func openWithLaunchServices(_ fileURL: URL) throws -> XCUIApplication {
    let app = XCUIApplication(bundleIdentifier: "com.huruizhi.Inkora")
    app.terminate()
    _ = app.wait(for: .notRunning, timeout: 5)
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
