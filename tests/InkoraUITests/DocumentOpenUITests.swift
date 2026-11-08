import AppKit
import XCTest

final class DocumentOpenUITests: AcceptanceTestCase {
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
  func testInvalidUTF8OpensAReadOnlyErrorWindowWithoutAnEditor() throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("Invalid UTF8.md")
    let bytes = Data([0xC3, 0x28])
    try bytes.write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    let window = app.windows["Invalid UTF8.md"]
    XCTAssertTrue(window.waitForExistence(timeout: 10), "The read-only error window must open")
    let reason = window.staticTexts["EncodingErrorReason"]
    XCTAssertTrue(
      reason.waitForExistence(timeout: 5), "The window must explain why the file is read-only")
    let reasonText = (reason.value as? String) ?? reason.label
    XCTAssertTrue(reasonText.contains("UTF-8"), "Found: \(reasonText)")
    XCTAssertFalse(
      window.descendants(matching: .any)["MarkdownEditor"].exists,
      "An undecodable file must never expose an editor surface")
    XCTAssertEqual(try Data(contentsOf: fileURL), bytes, "Original bytes must stay untouched")

    window.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(
      window.waitForNonExistence(timeout: 5), "Closing a read-only error window needs no review")
  }

  @MainActor
  func testUTF16ReadOnlyErrorWindowBlocksSaveAndClosesWithoutReview() async throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: temporaryDirectory) }
    let fileName = "UTF16 只读.md"
    let fileURL = temporaryDirectory.appendingPathComponent(fileName)
    // UTF-16LE encoding of "hi": unsupported in Inkora (ENC-002).
    let bytes = Data([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00])
    try bytes.write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer { app.terminate() }

    let window = app.windows[fileName]
    XCTAssertTrue(window.waitForExistence(timeout: 10), "The read-only error window must open")
    let reason = window.staticTexts["EncodingErrorReason"]
    XCTAssertTrue(reason.waitForExistence(timeout: 5))
    let reasonText = (reason.value as? String) ?? reason.label
    XCTAssertTrue(
      reasonText.contains("UTF-16"), "The window must state the detected encoding: \(reasonText)")

    app.typeKey("s", modifierFlags: .command)
    // NSDocument presents the save error as a sheet on the document window
    // (or an app-level dialog); its only button dismisses it. "OK" is the
    // AppKit-localized default, with a first-button fallback for other
    // localizations — the intent is that the error appears and is dismissed.
    let sheet = app.sheets.firstMatch
    let dialog = app.dialogs.firstMatch
    XCTAssertTrue(
      sheet.waitForExistence(timeout: 5) || dialog.waitForExistence(timeout: 5),
      "Cmd+S must fail with the encoding error, not write back")
    let ok = app.buttons["OK"]
    if ok.waitForExistence(timeout: 2) {
      ok.click()
    } else {
      let fallback = sheet.exists ? sheet.buttons.firstMatch : dialog.buttons.firstMatch
      XCTAssertTrue(fallback.waitForExistence(timeout: 5))
      fallback.click()
    }
    XCTAssertEqual(
      try Data(contentsOf: fileURL), bytes, "Cmd+S must never modify the original file")

    app.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(
      app.sheets.firstMatch.waitForNonExistence(timeout: 5),
      "A read-only error document closes without a save review")
    XCTAssertTrue(window.waitForNonExistence(timeout: 5), "The window must close immediately")

    // INK-053 policy: an undecodable file does not enter Open Recent.
    openMenu("File", in: app)
    let openRecent = app.menuBars.menuBarItems["File"].menuItems["Open Recent"]
    XCTAssertTrue(openRecent.waitForExistence(timeout: 5))
    openRecent.hover()
    XCTAssertFalse(
      openRecent.menuItems[fileName].waitForExistence(timeout: 2),
      "An unsupported-encoding file must not appear in Open Recent")
    app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])
  }

  @MainActor
  func testUndoRedoMenusAndShortcutsWhileWebEditorHasFocus() async throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("History Commands.md")
    try Data("original".utf8).write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    let editor = webEditor(in: app, windowTitle: fileURL.lastPathComponent)
    XCTAssertTrue(
      editor.waitForExistence(timeout: 10),
      "Could not locate the web editor. \(editorRecoveryMessage(in: app))"
    )

    openMenu("Edit", in: app)
    XCTAssertFalse(app.menuItems["Undo"].isEnabled)
    XCTAssertFalse(app.menuItems["Redo"].isEnabled)
    app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])

    replaceText(in: editor, with: "x")
    XCTAssertTrue(
      waitForValue(editor, containing: "x"),
      "Initial editor replacement did not complete"
    )

    openMenu("Edit", in: app)
    let undoItem = app.menuItems["Undo"]
    XCTAssertTrue(undoItem.isEnabled, "Undo menu item did not become enabled")
    XCTAssertFalse(app.menuItems["Redo"].isEnabled)
    undoItem.click()
    XCTAssertTrue(
      waitForValue(editor, containing: "original"),
      "Edit > Undo did not restore the original text"
    )

    editor.click()
    editor.typeKey("z", modifierFlags: [.command, .shift])
    XCTAssertTrue(
      waitForValue(editor, containing: "x"),
      "Cmd+Shift+Z did not redo the edit"
    )
    editor.typeKey("z", modifierFlags: .command)
    XCTAssertTrue(
      waitForValue(editor, containing: "original"),
      "Cmd+Z did not undo the edit"
    )

    openMenu("Edit", in: app)
    let redoItem = app.menuItems["Redo"]
    XCTAssertTrue(redoItem.isEnabled, "Redo menu item did not become enabled")
    redoItem.click()
    XCTAssertTrue(
      waitForValue(editor, containing: "x"),
      "Edit > Redo did not restore the changed text"
    )
  }

  @MainActor
  func testFileMenusAndShortcutsWhileWebEditorHasFocus() async throws {
    let temporaryDirectory = try makeTemporaryDirectory()
    let fileURL = temporaryDirectory.appendingPathComponent("File Commands.md")
    try Data("original".utf8).write(to: fileURL)
    let app = try openWithLaunchServices(fileURL)
    defer {
      app.terminate()
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }
    let editor = webEditor(in: app, windowTitle: fileURL.lastPathComponent)
    XCTAssertTrue(
      editor.waitForExistence(timeout: 10),
      "Could not locate the web editor. \(editorRecoveryMessage(in: app))"
    )

    replaceText(in: editor, with: "shortcut-save")
    editor.typeKey("s", modifierFlags: .command)
    let shortcutSaved = await waitForFile(fileURL, containing: "shortcut-save")
    XCTAssertTrue(
      shortcutSaved,
      "Cmd+S did not persist the focused editor"
    )

    replaceText(in: editor, with: "menu-save")
    openMenu("File", in: app)
    app.menuItems["Save"].click()
    let menuSaved = await waitForFile(fileURL, containing: "menu-save")
    XCTAssertTrue(
      menuSaved,
      "File > Save did not persist the focused editor"
    )

    editor.click()
    editor.typeKey("s", modifierFlags: [.command, .shift])
    try cancelFilePanel(in: app)
    editor.click()
    editor.typeKey("o", modifierFlags: .command)
    try cancelFilePanel(in: app)

    openMenu("File", in: app)
    app.menuItems["Save As…"].click()
    try cancelFilePanel(in: app)
    openMenu("File", in: app)
    app.menuItems["Open…"].click()
    try cancelFilePanel(in: app)
  }

  @MainActor
  func testOpenAndSaveAsPersistDocumentsFromMenusAndShortcuts() async throws {
    let directory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    for useShortcut in [false, true] {
      let app = launchApplication()
      defer { app.terminate() }
      let suffix = useShortcut ? "Shortcut" : "Menu"
      let source = directory.appendingPathComponent("Open \(suffix) 中文.md")
      let destination = directory.appendingPathComponent("Saved \(suffix) 中文.md")
      try Data("original-\(suffix)".utf8).write(to: source)
      if useShortcut {
        app.typeKey("o", modifierFlags: .command)
      } else {
        openMenu("File", in: app)
        app.menuItems["Open…"].click()
      }
      try chooseFilePath(source, button: "Open", in: app)
      XCTAssertTrue(app.windows[source.lastPathComponent].waitForExistence(timeout: 5))
      let editor = webEditor(in: app, windowTitle: source.lastPathComponent)
      XCTAssertTrue(waitForValue(editor, containing: "original-\(suffix)"))
      replaceText(in: editor, with: "saved-\(suffix)")
      if useShortcut {
        editor.click()
        app.typeKey("s", modifierFlags: [.command, .shift])
      } else {
        openMenu("File", in: app)
        app.menuItems["Save As…"].click()
      }
      try chooseFilePath(destination, button: "Save", in: app)
      let saved = await waitForFile(destination, containing: "saved-\(suffix)")
      XCTAssertTrue(saved)
      XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original-\(suffix)")
      let savedEditor = webEditor(
        in: app, windowTitle: destination.lastPathComponent, previousTitle: source.lastPathComponent
      )
      replaceText(in: savedEditor, with: "subsequent-\(suffix)")
      savedEditor.typeKey("s", modifierFlags: .command)
      let savedAgain = await waitForFile(destination, containing: "subsequent-\(suffix)")
      XCTAssertTrue(savedAgain, "Save after Save As must use the new URL")
      XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original-\(suffix)")
    }
  }

  @MainActor
  func testCloseEntrypointsOfferSaveDiscardAndCancel() async throws {
    let directory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    for entry in ["button", "shortcut", "menu", "quit"] {
      let app = launchApplication()
      defer { app.terminate() }
      let url = directory.appendingPathComponent("Close-\(entry).md")
      try Data("original".utf8).write(to: url)
      openMenu("File", in: app)
      app.menuItems["Open…"].click()
      try chooseFilePath(url, button: "Open", in: app)
      let editor = webEditor(in: app, windowTitle: url.lastPathComponent)
      replaceText(in: editor, with: "changed-\(entry)")
      requestClose(entry, in: app, window: app.windows[url.lastPathComponent])
      let cancel = app.buttons["Cancel"]
      XCTAssertTrue(cancel.waitForExistence(timeout: 5))
      cancel.click()
      XCTAssertTrue(waitForValue(editor, containing: "changed-\(entry)"))
      XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "original")
      requestClose(entry, in: app, window: app.windows[url.lastPathComponent])
      let save = app.buttons["Save"]
      XCTAssertTrue(save.waitForExistence(timeout: 5))
      save.click()
      let saved = await waitForFile(url, containing: "changed-\(entry)")
      XCTAssertTrue(saved)
      if entry == "quit" {
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 10))
        app.launch()
      } else {
        XCTAssertTrue(editor.waitForNonExistence(timeout: 5))
      }
      openMenu("File", in: app)
      app.menuItems["Open…"].click()
      try chooseFilePath(url, button: "Open", in: app)
      let reopened = webEditor(in: app, windowTitle: url.lastPathComponent)
      replaceText(in: reopened, with: "discarded")
      requestClose(entry, in: app, window: app.windows[url.lastPathComponent])
      let discard = app.buttons["Don’t Save"]
      let asciiDiscard = app.buttons["Don't Save"]
      if discard.waitForExistence(timeout: 3) {
        discard.click()
      } else {
        XCTAssertTrue(asciiDiscard.waitForExistence(timeout: 3))
        asciiDiscard.click()
      }
      if entry == "quit" {
        XCTAssertTrue(app.wait(for: .notRunning, timeout: 10))
      } else {
        XCTAssertTrue(reopened.waitForNonExistence(timeout: 5))
      }
      XCTAssertTrue(try String(contentsOf: url, encoding: .utf8).contains("changed-\(entry)"))
    }
  }

  @MainActor
  func testFailedSaveDuringClosePreservesWindowAndContent() throws {
    let directory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("Failed close.md")
    try Data("original".utf8).write(to: url)
    let app = launchApplication(arguments: ["--inkora-test-write-failure"])
    defer { app.terminate() }
    openMenu("File", in: app)
    app.menuItems["Open…"].click()
    try chooseFilePath(url, button: "Open", in: app)
    let editor = webEditor(in: app, windowTitle: url.lastPathComponent)
    replaceText(in: editor, with: "keep after failure")
    app.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 5))
    app.buttons["Save"].click()
    let errorButton = app.buttons["OK"]
    XCTAssertTrue(errorButton.waitForExistence(timeout: 10), "Write error must be visible")
    errorButton.click()
    XCTAssertTrue(waitForValue(editor, containing: "keep after failure"))
    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "original")
    app.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 5), "Document remains dirty")
    app.buttons["Cancel"].click()
  }

  @MainActor
  func testExternalModificationConflictKeepsLocalEditsAndSavesCopy() async throws {
    let directory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("Conflict.md")
    let copy = directory.appendingPathComponent("Conflict copy.md")
    try Data("original".utf8).write(to: source)
    let app = try openWithLaunchServices(source)
    defer { app.terminate() }
    let editor = webEditor(in: app, windowTitle: source.lastPathComponent)
    replaceText(in: editor, with: "local edits")
    try Data("external edits".utf8).write(to: source, options: .atomic)
    // The presenter may already have offered the conflict before Cmd+S.
    let keep = app.buttons["保留编辑并另存为…"]
    if !keep.waitForExistence(timeout: 2) { app.typeKey("s", modifierFlags: .command) }
    XCTAssertTrue(keep.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["重新加载"].exists)
    capture("file-conflict", app: app)
    XCTAssertTrue(app.buttons["FileStateButton1"].exists)
    keep.click()
    try chooseFilePath(copy, button: "Save", in: app)
    let saved = await waitForFile(copy, containing: "local edits")
    XCTAssertTrue(saved)
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "external edits")
  }

  @MainActor
  func testReadOnlySaveOffersSaveAsAndPreservesOriginal() async throws {
    let directory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("Read only.md")
    let copy = directory.appendingPathComponent("Writable copy.md")
    try Data("original".utf8).write(to: source)
    try FileManager.default.setAttributes([.posixPermissions: 0o444], ofItemAtPath: source.path)
    defer {
      try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: source.path)
    }
    let app = try openWithLaunchServices(source)
    defer { app.terminate() }
    let editor = webEditor(in: app, windowTitle: source.lastPathComponent)
    replaceText(in: editor, with: "saved copy")
    app.typeKey("s", modifierFlags: .command)
    let saveAs = app.buttons["另存为…"]
    XCTAssertTrue(saveAs.waitForExistence(timeout: 10))
    saveAs.click()
    try chooseFilePath(copy, button: "Save", in: app)
    let saved = await waitForFile(copy, containing: "saved copy")
    XCTAssertTrue(saved)
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original")
  }

  @MainActor
  func testCrashDraftIsOfferedOnRestartAndRecoveryNeverWritesSource() throws {
    let directory = try makeTemporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("Crash source.md")
    try Data("original on disk".utf8).write(to: source)
    let session = UUID().uuidString
    let arguments = ["--inkora-test-recovery-session", session]
    let app = launchApplication(arguments: arguments + ["--inkora-test-crash-after-draft"])
    defer { app.terminate() }
    openMenu("File", in: app)
    app.menuItems["Open…"].click()
    try chooseFilePath(source, button: "Open", in: app)
    let editor = webEditor(in: app, windowTitle: source.lastPathComponent)
    replaceText(in: editor, with: "recover this unsaved text")
    XCTAssertTrue(
      app.wait(for: .notRunning, timeout: 15), "App exits only after persisting an actual draft")
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original on disk")
    app.launchArguments.removeAll { $0 == "--inkora-test-crash-after-draft" }
    app.launch()
    let recover = app.buttons["恢复"]
    XCTAssertTrue(recover.waitForExistence(timeout: 10))
    capture("crash-recovery", app: app)
    XCTAssertTrue(app.buttons["RecoveryButton0"].exists)
    recover.click()
    let recoveredEditor = app.textViews.matching(
      NSPredicate(format: "value CONTAINS %@", "recover this unsaved text")
    ).firstMatch
    XCTAssertTrue(recoveredEditor.waitForExistence(timeout: 10))
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original on disk")
    app.typeKey("w", modifierFlags: .command)
    XCTAssertTrue(
      app.buttons["Cancel"].waitForExistence(timeout: 5), "Recovered document remains dirty")
    app.buttons["Cancel"].click()
    app.typeKey("w", modifierFlags: .command)
    let discard = app.buttons["DontSaveButton"]
    XCTAssertTrue(discard.waitForExistence(timeout: 5))
    discard.click()
    XCTAssertTrue(recoveredEditor.waitForNonExistence(timeout: 5))
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original on disk")
  }

  @MainActor
  private func requestClose(_ entry: String, in app: XCUIApplication, window: XCUIElement) {
    switch entry {
    case "button": window.buttons[XCUIIdentifierCloseWindow].click()
    case "shortcut": app.typeKey("w", modifierFlags: .command)
    case "quit": app.typeKey("q", modifierFlags: .command)
    default:
      openMenu("File", in: app)
      app.menuItems["Close"].click()
    }
  }

  @MainActor
  private func chooseFilePath(_ url: URL, button: String, in app: XCUIApplication) throws {
    let panel = filePanel(in: app)
    XCTAssertTrue(panel.waitForExistence(timeout: 5))
    app.typeKey("g", modifierFlags: [.command, .shift])
    let pathField = app.textFields["PathTextField"]
    XCTAssertTrue(pathField.waitForExistence(timeout: 5))
    paste(url.path, into: pathField)
    app.typeKey(XCUIKeyboardKey.return, modifierFlags: [])
    let confirm = panel.buttons[button]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    confirm.click()
    XCTAssertTrue(panel.waitForNonExistence(timeout: 5))
  }

  @MainActor
  private func launchApplication(arguments: [String] = []) -> XCUIApplication {
    let app = diagnosticApplication(fixedPresentation: true)
    let isolation =
      arguments.contains("--inkora-test-recovery-session")
      ? []
      : ["--inkora-test-recovery-session", UUID().uuidString]
    app.launchArguments =
      [
        "-ApplePersistenceIgnoreState", "YES", "-AppleInterfaceStyle", "Light",
        "-INKTestDefaultsSuite", "InkoraUITests-\(UUID().uuidString)",
      ] + isolation + arguments
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
    paste(text, into: editor)
  }

  @MainActor
  private func paste(_ text: String, into element: XCUIElement) {
    element.typeKey("a", modifierFlags: .command)
    let pasteboard = NSPasteboard.general
    let previousItems = (pasteboard.pasteboardItems ?? []).map { item in
      let copy = NSPasteboardItem()
      for type in item.types {
        if let data = item.data(forType: type) { copy.setData(data, forType: type) }
      }
      return copy
    }
    defer {
      pasteboard.clearContents()
      pasteboard.writeObjects(previousItems)
    }
    pasteboard.clearContents()
    pasteboard.setString(text, forType: .string)
    element.typeKey("v", modifierFlags: .command)
    let valueChanged = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "value == %@", text), object: element
    )
    XCTAssertEqual(XCTWaiter.wait(for: [valueChanged], timeout: 5), .completed)
  }

  @MainActor
  private func webEditor(
    in app: XCUIApplication, windowTitle: String, previousTitle: String? = nil
  ) -> XCUIElement {
    let titles = [windowTitle, previousTitle].compactMap { $0 }.flatMap { title in
      [title, URL(fileURLWithPath: title).deletingPathExtension().lastPathComponent]
    }
    let window = app.windows.matching(NSPredicate(format: "title IN %@", titles)).firstMatch
    XCTAssertTrue(window.waitForExistence(timeout: 10))
    let accessibleNames = ["Markdown editor", "Markdown source editor"]
    let labeledEditor = window.descendants(matching: .any).matching(
      NSPredicate(
        format: "identifier IN %@ OR label IN %@",
        accessibleNames,
        accessibleNames
      )
    ).firstMatch
    if labeledEditor.waitForExistence(timeout: 3) {
      return labeledEditor
    }
    return window.descendants(matching: .textView).firstMatch
  }

  @MainActor
  private func editorRecoveryMessage(in app: XCUIApplication) -> String {
    let recoveryMessage = app.staticTexts["EditorRecoveryMessage"]
    if recoveryMessage.exists {
      return (recoveryMessage.value as? String) ?? recoveryMessage.label
    }
    let messages = app.staticTexts.allElementsBoundByIndex.compactMap { element in
      (element.value as? String) ?? (element.label.isEmpty ? nil : element.label)
    }
    return messages.isEmpty ? "No editor recovery message was exposed." : messages.joined()
  }

  @MainActor
  private func openMenu(_ title: String, in app: XCUIApplication) {
    let menu = app.menuBars.menuBarItems[title]
    XCTAssertTrue(menu.waitForExistence(timeout: 5))
    menu.click()
  }

  @MainActor
  private func filePanel(in app: XCUIApplication) -> XCUIElement {
    let panel = app.windows.matching(
      NSPredicate(format: "identifier IN %@", ["open-panel", "save-panel"])
    ).firstMatch
    if panel.waitForExistence(timeout: 2) { return panel }
    return app.sheets.firstMatch
  }

  @MainActor
  private func cancelFilePanel(in app: XCUIApplication) throws {
    let panel = filePanel(in: app)
    guard panel.waitForExistence(timeout: 5) else {
      throw NSError(
        domain: "InkoraUITests",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "File panel did not appear"]
      )
    }
    app.typeKey(XCUIKeyboardKey.escape, modifierFlags: [])
    guard panel.waitForNonExistence(timeout: 5) else {
      throw NSError(
        domain: "InkoraUITests",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "File panel did not close"]
      )
    }
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
    let app = launchApplication()
    let applicationURL = try builtApplicationURL()
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["-a", applicationURL.path, fileURL.path]
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
