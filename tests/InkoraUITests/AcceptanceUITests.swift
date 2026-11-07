import XCTest

final class AcceptanceUITests: AcceptanceTestCase {
  override func setUpWithError() throws { continueAfterFailure = false }

  @MainActor
  func testKeyboardOnlyOpenEditSaveCloseAndRecent() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("Keyboard Acceptance.md")
    try Data("# Acceptance\n\n中文 Markdown\n\n- First item\n- Second item\n".utf8).write(to: url)
    let app = diagnosticApplication(fixedPresentation: true)
    app.launch()
    defer { app.terminate() }
    app.typeKey("o", modifierFlags: .command)
    let panel = app.descendants(matching: .any).matching(identifier: "open-panel").firstMatch
    XCTAssertTrue(panel.waitForExistence(timeout: 5) || app.sheets.firstMatch.exists)
    capture("open-panel", app: app)
    app.typeKey("g", modifierFlags: [.command, .shift])
    XCTAssertTrue(app.textFields["PathTextField"].waitForExistence(timeout: 5))
    app.typeText(url.path)
    app.typeKey(.return, modifierFlags: [])
    app.typeKey(.return, modifierFlags: [])
    let window = app.windows[url.lastPathComponent]
    XCTAssertTrue(window.waitForExistence(timeout: 10))
    let editor = window.textViews.firstMatch
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    capture("editor", app: app)
    // Opening a document must focus its editor without pointer interaction.
    app.typeKey("a", modifierFlags: .command)
    app.typeText("keyboard saved")
    app.typeKey("s", modifierFlags: .command)
    let saved = await waitForDisk(url, text: "keyboard saved")
    XCTAssertTrue(saved)
    app.typeText(" unsaved")
    app.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5))
    capture("close-confirmation", app: app)
    app.typeKey(.escape, modifierFlags: [])
    XCTAssertTrue(app.buttons["Cancel"].waitForNonExistence(timeout: 5))
    XCTAssertTrue(window.exists)
    app.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5))
    app.typeKey(.delete, modifierFlags: .command)
    XCTAssertTrue(window.waitForNonExistence(timeout: 5))
    XCTAssertTrue(try String(contentsOf: url, encoding: .utf8).contains("keyboard saved"))
    XCTAssertFalse(try String(contentsOf: url, encoding: .utf8).contains("unsaved"))
    app.typeKey(.F2, modifierFlags: [.control, .function])
    app.typeText("File")
    app.typeKey(.downArrow, modifierFlags: [])
    XCTAssertTrue(app.menuItems["Open…"].isHittable, "Keyboard must open the File menu")
    app.typeText("Open")
    app.typeKey(.downArrow, modifierFlags: [])
    app.typeKey(.rightArrow, modifierFlags: [])
    XCTAssertTrue(app.menuItems[url.lastPathComponent].isHittable)
    app.typeText("Keyboard")
    app.typeKey(.return, modifierFlags: [])
    XCTAssertTrue(window.waitForExistence(timeout: 10))
    XCTAssertTrue(editor.waitForExistence(timeout: 10))
    try app.performAccessibilityAudit(for: [.sufficientElementDescription, .action, .parentChild])
  }

  @MainActor
  func testEditorAccessibilityAudit() throws {
    let app = diagnosticApplication(fixedPresentation: true)
    app.launch()
    defer { app.terminate() }
    XCTAssertTrue(app.windows.firstMatch.textViews.firstMatch.waitForExistence(timeout: 10))
    try app.performAccessibilityAudit(for: [.sufficientElementDescription, .action, .parentChild])
  }

  @MainActor
  private func waitForDisk(_ url: URL, text: String) async -> Bool {
    for _ in 0..<50 {
      if (try? String(contentsOf: url, encoding: .utf8))?.contains(text) == true { return true }
      try? await Task.sleep(for: .milliseconds(100))
    }
    return false
  }
}
