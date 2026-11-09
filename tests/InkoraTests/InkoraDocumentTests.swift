import AppKit
import WebKit
import XCTest

final class InkoraDocumentTests: XCTestCase {
  @MainActor
  func testDocumentAndEditorExposeStableAccessibilityMetadata() throws {
    let document = InkoraDocument(editorResourceBundle: Bundle(for: Self.self))
    document.makeWindowControllers()
    defer { document.close() }
    let window = try XCTUnwrap(document.windowControllers.first?.window)
    XCTAssertEqual(window.accessibilityIdentifier(), "DocumentWindow")
    XCTAssertEqual(window.accessibilityRole(), .window)
    let editor = try XCTUnwrap(window.contentViewController?.view)
    XCTAssertEqual(editor.accessibilityIdentifier(), "MarkdownEditor")
    XCTAssertEqual(editor.accessibilityLabel(), "Markdown document content")
  }

  private let markdownType = "net.daringfireball.markdown"

  @MainActor
  func testUnmodifiedMarkdownRoundTripsByteForByte() throws {
    for fixture in ["crlf", "no-final-newline", "unicode", "utf8-bom", "mixed-eol"] {
      let original = try fixtureData(named: fixture)
      let document = InkoraDocument()

      try document.read(from: original, ofType: "net.daringfireball.markdown")
      if fixture == "mixed-eol" {
        XCTAssertTrue(document.isBareCRReadOnly)
        XCTAssertEqual(Data(document.text.utf8), original)
        XCTAssertThrowsError(try document.data(ofType: markdownType)) {
          XCTAssertEqual($0 as? DocumentFileState, .bareCR)
        }
        continue
      }
      let saved = try document.data(ofType: "net.daringfireball.markdown")

      XCTAssertEqual(saved, original, "Fixture changed: \(fixture)")
    }
  }

  @MainActor
  func testBareCRReadOnlyConversionGoldenAndSaveGates() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    for name in ["bare-cr", "bare-cr-lf", "bare-cr-crlf"] {
      for bom in [Data(), Data([0xEF, 0xBB, 0xBF])] {
        let original = try fixtureData(named: name + ".input")
        let expected = try fixtureData(named: name + ".expected")
        let source = directory.appendingPathComponent(name + ".md")
        let destination = directory.appendingPathComponent(name + "-copy.md")
        try? FileManager.default.removeItem(at: destination)
        try (bom + original).write(to: source)
        var snapshotText = String(decoding: expected, as: UTF8.self)
        var snapshotID = ""
        let document = InkoraDocument(snapshotRequester: { completion in
          completion(
            .success(BridgeSnapshot(documentID: snapshotID, revision: 0, text: snapshotText)))
        })
        try document.read(from: source, ofType: markdownType)
        document.fileURL = source
        document.refreshFileState()
        let oldID = document.bridgeDocumentID
        XCTAssertEqual(document.fileState, .bareCR)
        XCTAssertTrue(document.isBareCRReadOnly)
        XCTAssertFalse(document.isDocumentEdited)
        XCTAssertEqual(Data(document.text.utf8), original)
        XCTAssertThrowsError(try document.data(ofType: markdownType))
        XCTAssertThrowsError(
          try document.write(
            to: destination, ofType: markdownType,
            for: .saveAsOperation, originalContentsURL: nil))
        for operation in [NSDocument.SaveOperationType.saveOperation, .saveAsOperation] {
          let error = await save(
            document, to: operation == .saveOperation ? source : destination,
            operation: operation)
          XCTAssertEqual(error as? DocumentFileState, .bareCR)
        }
        let store = RecoveryStore(directory: directory.appendingPathComponent(UUID().uuidString))
        document.configureRecovery(store: store)
        // Even an erroneous editor notification cannot dirty the read-only native state.
        document.editorDidChangeState(
          BridgeEditorState(
            documentID: oldID, revision: 1,
            dirty: true, canUndo: true, canRedo: false))
        document.captureRecovery()
        try document.writeRecovery(BridgeSnapshot(documentID: oldID, revision: 1, text: "wrong"))
        XCTAssertFalse(document.isDocumentEdited)
        XCTAssertTrue(store.discover().drafts.isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path))
        document.convertBareCRToLF()
        snapshotID = document.bridgeDocumentID
        XCTAssertNotEqual(snapshotID, oldID)
        XCTAssertFalse(document.isBareCRReadOnly)
        XCTAssertTrue(document.isDocumentEdited)
        XCTAssertEqual(try document.data(ofType: markdownType), bom + expected)
        XCTAssertEqual(try Data(contentsOf: source), bom + original)
        // Undo of subsequent edits back to the converted baseline is still unsaved.
        document.editorDidChangeState(
          BridgeEditorState(
            documentID: snapshotID, revision: 0,
            dirty: false, canUndo: false, canRedo: true))
        XCTAssertTrue(document.isDocumentEdited)
        snapshotText = document.text
        let error = await save(document, to: destination, operation: .saveAsOperation)
        XCTAssertNil(error)
        XCTAssertEqual(try Data(contentsOf: destination), bom + expected)
        XCTAssertFalse(document.isDocumentEdited)
        document.close()
      }
    }
  }

  @MainActor
  func testInvalidUTF8OpensInReadOnlyErrorState() throws {
    let document = InkoraDocument()
    let invalidUTF8 = Data([0xC3, 0x28])

    try document.read(from: invalidUTF8, ofType: "net.daringfireball.markdown")

    XCTAssertEqual(document.encodingError, .invalidUTF8)
    XCTAssertEqual(document.text, "")
    XCTAssertFalse(document.isDocumentEdited)
  }

  @MainActor
  func testGBKEncodedFileOpensReadOnlyAsInvalidUTF8() throws {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("gbk-\(UUID().uuidString).md")
    // "中文" encoded as GBK: no BOM, but not valid UTF-8 either.
    let bytes = Data([0xD6, 0xD0, 0xCE, 0xC4])
    try bytes.write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }

    let document = try InkoraDocument(contentsOf: url, ofType: "net.daringfireball.markdown")

    XCTAssertEqual(document.encodingError, .invalidUTF8)
    XCTAssertEqual(try Data(contentsOf: url), bytes, "Original bytes must stay untouched")
    XCTAssertFalse(document.isDocumentEdited)
  }

  @MainActor
  func testUTF16AndUTF32OpenReadOnlyWithExplicitReasons() throws {
    let encodings: [(data: Data, error: InkoraDocumentError)] = [
      // UTF-16LE with "hi", UTF-16BE with "hi", UTF-32LE/BE BOMs only.
      (Data([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00]), .utf16Detected),
      (Data([0xFE, 0xFF, 0x00, 0x68, 0x00, 0x69]), .utf16Detected),
      (Data([0xFF, 0xFE, 0x00, 0x00]), .utf32Detected),
      (Data([0x00, 0x00, 0xFE, 0xFF]), .utf32Detected),
    ]

    for (payload, expected) in encodings {
      let document = InkoraDocument()
      try document.read(from: payload, ofType: "net.daringfireball.markdown")
      XCTAssertEqual(
        document.encodingError, expected,
        "Wrong error for \(payload.map { String(format: "%02X", $0) })")
      XCTAssertEqual(
        document.encodingError?.failureReason, expected.failureReason,
        "Wrong failure reason for \(payload.map { String(format: "%02X", $0) })")
      XCTAssertEqual(
        document.text, "",
        "No mojibake may be decoded for \(payload.map { String(format: "%02X", $0) })")
      XCTAssertFalse(document.isDocumentEdited)
    }
  }

  @MainActor
  func testUTF8BOMIsStrippedFromTextAndPreservedInEveryWrite() throws {
    let bom = Data([0xEF, 0xBB, 0xBF])
    let body = Data("# 标题 👩‍💻\n".utf8)
    let document = InkoraDocument()

    try document.read(from: bom + body, ofType: "net.daringfireball.markdown")

    XCTAssertEqual(document.text, "# 标题 👩‍💻\n")
    XCTAssertEqual(try document.data(ofType: "net.daringfireball.markdown"), bom + body)
  }

  @MainActor
  func testBOMOnlyFileRoundTripsToTheBOMBytes() throws {
    let bom = Data([0xEF, 0xBB, 0xBF])
    let document = InkoraDocument()

    try document.read(from: bom, ofType: "net.daringfireball.markdown")

    XCTAssertEqual(document.text, "")
    XCTAssertEqual(try document.data(ofType: "net.daringfireball.markdown"), bom)
  }

  @MainActor
  func testEditedSnapshotSaveKeepsTheOriginalBOM() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("bom-edited.md")
    let bom = Data([0xEF, 0xBB, 0xBF])
    let edited = "# 已编辑 🖋️\n"
    let document = document(snapshots: [edited])
    try document.read(from: bom + Data("# 原文\n".utf8), ofType: markdownType)

    let error = await save(document, to: url, operation: .saveAsOperation)

    XCTAssertNil(error)
    XCTAssertEqual(try Data(contentsOf: url), bom + Data(edited.utf8))
  }

  @MainActor
  func testMidFileByteOrderMarkCharacterIsPreservedAsText() throws {
    let body = Data("before\u{FEFF}after\n".utf8)
    let document = InkoraDocument()

    try document.read(from: body, ofType: markdownType)

    XCTAssertEqual(document.text, "before\u{FEFF}after\n")
    XCTAssertEqual(try document.data(ofType: markdownType), body)
  }

  @MainActor
  func testFileURLLoadsMarkdownAndUsesFilenameForTheWindowTitle() throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraDocumentTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("打开测试.md")
    let markdown = "# Opened from disk\n"
    try Data(markdown.utf8).write(to: url)

    let document = try InkoraDocument(
      contentsOf: url,
      ofType: "net.daringfireball.markdown"
    )
    document.makeWindowControllers()
    defer { document.close() }

    XCTAssertEqual(document.text, markdown)
    XCTAssertEqual(document.fileURL, url)
    XCTAssertEqual(document.windowControllers.first?.window?.title, "打开测试.md")
  }

  @MainActor
  func testFilenamesWithEmojiZWJAndCombiningCharactersRoundTrip() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    // ZWJ family emoji, a decomposed e-acute (e + U+0301), CJK, and a space.
    let originalName = "👩‍💻 e\u{0301}组合 路径.md"
    let originalURL = directory.appendingPathComponent(originalName)
    let markdown = "# 特殊文件名 👩‍💻\n"
    try Data(markdown.utf8).write(to: originalURL)

    let document = try InkoraDocument(
      contentsOf: originalURL,
      ofType: markdownType
    )
    document.makeWindowControllers()
    defer { document.close() }

    XCTAssertEqual(document.text, markdown)
    XCTAssertEqual(document.fileURL, originalURL)
    XCTAssertEqual(document.windowControllers.first?.window?.title, originalName)

    let savedName = "新 名称 ✏\u{FE0F}.md"
    let savedURL = directory.appendingPathComponent(savedName)
    try document.write(
      to: savedURL,
      ofType: markdownType,
      for: .saveAsOperation,
      originalContentsURL: nil
    )

    XCTAssertEqual(try String(contentsOf: savedURL, encoding: .utf8), markdown)
    let reopened = try InkoraDocument(contentsOf: savedURL, ofType: markdownType)
    XCTAssertEqual(reopened.text, markdown)
  }

  @MainActor
  func testUnsupportedEncodingDocumentCannotSaveAnywhere() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("encoding-error.md")
    let bytes = Data([0xD6, 0xD0, 0xCE, 0xC4])
    try bytes.write(to: url)
    let other = directory.appendingPathComponent("copy.md")
    let document = try InkoraDocument(contentsOf: url, ofType: markdownType)

    let saveError = await save(document, to: url, operation: .saveOperation)
    XCTAssertEqual(saveError as? InkoraDocumentError, .invalidUTF8)
    let saveAsError = await save(document, to: other, operation: .saveAsOperation)
    XCTAssertEqual(saveAsError as? InkoraDocumentError, .invalidUTF8)

    XCTAssertFalse(
      FileManager.default.fileExists(atPath: other.path),
      "Save As must not write the empty buffer anywhere")
    XCTAssertEqual(try Data(contentsOf: url), bytes, "Original bytes must stay untouched")
    XCTAssertThrowsError(try document.data(ofType: markdownType)) { error in
      XCTAssertEqual(error as? InkoraDocumentError, .invalidUTF8)
    }
    XCTAssertThrowsError(
      try document.write(
        to: other, ofType: markdownType, for: .saveAsOperation, originalContentsURL: nil))
    XCTAssertFalse(document.isDocumentEdited)

    let closeError = expectation(description: "close preparation finished")
    var reportedError: Error?
    document.prepareForClose { error in
      reportedError = error
      closeError.fulfill()
    }
    await fulfillment(of: [closeError], timeout: 2)
    XCTAssertNil(reportedError, "Closing needs no snapshot and never fails")
  }

  @MainActor
  func testUnsupportedEncodingWindowShowsReadOnlyStateWithoutEditor() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("只读编码.md")
    try Data([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00]).write(to: url)
    let document = try InkoraDocument(contentsOf: url, ofType: markdownType)

    document.makeWindowControllers()
    defer { document.close() }

    let window = try XCTUnwrap(document.windowControllers.first?.window)
    XCTAssertEqual(window.title, "只读编码.md")
    XCTAssertEqual(window.subtitle, DocumentFileState.unsupportedEncoding.localizedDescription)
    let contentView = try XCTUnwrap(window.contentViewController?.view)
    XCTAssertEqual(contentView.accessibilityIdentifier(), "EncodingError")
    XCTAssertFalse(
      contentView is WKWebView, "The encoding error state must not expose an editor")
  }

  @MainActor
  func testUnsupportedEncodingDocumentProducesNoRecoveryDraft() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appendingPathComponent("gbk.md")
    try Data([0xD6, 0xD0, 0xCE, 0xC4]).write(to: source)
    let store = RecoveryStore(directory: directory.appendingPathComponent("drafts"))
    let document = try InkoraDocument(contentsOf: source, ofType: markdownType)
    document.configureRecovery(store: store)

    document.makeWindowControllers()
    document.refreshFileState()
    try await Task.sleep(for: .seconds(1.5))

    XCTAssertFalse(document.isDocumentEdited)
    XCTAssertTrue(
      RecoveryStore(directory: store.directory).discover().drafts.isEmpty,
      "A read-only encoding error must never produce a crash-recovery draft")
    document.close()
    XCTAssertTrue(RecoveryStore(directory: store.directory).discover().drafts.isEmpty)
  }

  func testApplicationDeclaresMarkdownDocumentAssociation() throws {
    let applicationURL = Bundle(for: Self.self).bundleURL
      .deletingLastPathComponent()
      .appendingPathComponent("Inkora.app", isDirectory: true)
    let applicationBundle = try XCTUnwrap(Bundle(url: applicationURL))
    let documentTypes = try XCTUnwrap(
      applicationBundle.object(forInfoDictionaryKey: "CFBundleDocumentTypes")
        as? [[String: Any]]
    )
    let markdownType = try XCTUnwrap(
      documentTypes.first {
        ($0["LSItemContentTypes"] as? [String])?.contains("net.daringfireball.markdown")
          == true
      }
    )

    XCTAssertEqual(markdownType["CFBundleTypeRole"] as? String, "Editor")
    XCTAssertEqual(markdownType["NSDocumentClass"] as? String, "InkoraDocument")
  }

  @MainActor
  func testSaveWritesSnapshotAndClearsDirtyState() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("normal.md")
    let document = document(snapshots: ["# Saved\n"])
    document.updateChangeCount(.changeDone)

    let error = await save(document, to: url, operation: .saveAsOperation)

    XCTAssertNil(error)
    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "# Saved\n")
    XCTAssertFalse(document.isDocumentEdited)
  }

  @MainActor
  func testSaveOverwritesExistingFile() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("overwrite.md")
    try Data("old".utf8).write(to: url)
    let document = document(snapshots: ["new"])
    document.fileURL = url

    let error = await save(document, to: url, operation: .saveOperation)

    XCTAssertNil(error)
    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "new")
  }

  @MainActor
  func testSaveAsSwitchesPathAndFollowingSaveUsesNewPath() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let oldURL = directory.appendingPathComponent("old.md")
    let newURL = directory.appendingPathComponent("new.md")
    try Data("old".utf8).write(to: oldURL)
    let document = document(snapshots: ["first", "second"])
    document.fileURL = oldURL

    let saveAsError = await save(document, to: newURL, operation: .saveAsOperation)
    XCTAssertNil(saveAsError)
    XCTAssertEqual(document.fileURL, newURL)
    let saveError = await save(document, to: newURL, operation: .saveOperation)
    XCTAssertNil(saveError)

    XCTAssertEqual(try String(contentsOf: oldURL, encoding: .utf8), "old")
    XCTAssertEqual(try String(contentsOf: newURL, encoding: .utf8), "second")
  }

  @MainActor
  func testCancelledSnapshotLeavesExistingFileAndDirtyStateUntouched() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("cancel.md")
    try Data("old".utf8).write(to: url)
    let document = InkoraDocument(
      snapshotRequester: { completion in
        completion(.failure(CocoaError(.userCancelled)))
      }
    )
    document.fileURL = url
    document.updateChangeCount(.changeDone)

    let error = await save(document, to: url, operation: .saveOperation)

    XCTAssertNotNil(error)
    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "old")
    XCTAssertTrue(document.isDocumentEdited)
  }

  @MainActor
  func testPermissionFailureLeavesExistingFileAndDirtyStateUntouched() async throws {
    try await assertWriteFailurePreservesFile(.fileWriteNoPermission)
  }

  @MainActor
  func testDiskFailureLeavesExistingFileAndDirtyStateUntouched() async throws {
    try await assertWriteFailurePreservesFile(.fileWriteOutOfSpace)
  }

  @MainActor
  func testConsecutiveSavesAreSerializedAndLatestSnapshotWins() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("consecutive.md")
    let document = document(snapshots: ["first", "second"])
    let firstFinished = expectation(description: "first save finished")
    let secondFinished = expectation(description: "second save finished")

    document.save(to: url, ofType: markdownType, for: .saveAsOperation) { error in
      XCTAssertNil(error)
      firstFinished.fulfill()
    }
    document.save(to: url, ofType: markdownType, for: .saveOperation) { error in
      XCTAssertNil(error)
      secondFinished.fulfill()
    }
    await fulfillment(of: [firstFinished, secondFinished], timeout: 5)

    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "second")
  }

  @MainActor
  func testDirtyProjectionTracksUndoRedoAndSameRevisionSaveConfirmation() {
    let document = InkoraDocument()
    func state(_ revision: Int, _ dirty: Bool, id: String? = nil) {
      document.editorDidChangeState(
        BridgeEditorState(
          documentID: id ?? document.bridgeDocumentID, revision: revision,
          dirty: dirty, canUndo: true, canRedo: true
        ))
    }
    state(1, true)
    XCTAssertTrue(document.isDocumentEdited)
    state(2, true)
    state(3, false)  // Undo to saved document, not native count - 1.
    XCTAssertFalse(document.isDocumentEdited)
    state(4, true)  // Redo.
    XCTAssertTrue(document.isDocumentEdited)
    state(4, false)  // markSaved does not increase revision.
    XCTAssertFalse(document.isDocumentEdited)
    state(3, true)
    state(100, true, id: "another-document")
    XCTAssertFalse(document.isDocumentEdited)
    XCTAssertEqual(document.bridgeRevision, 4)
    state(5, true)
    state(6, false)
    XCTAssertFalse(document.isDocumentEdited)
    XCTAssertFalse(InkoraDocument.autosavesInPlace)
  }

  @MainActor
  func testDocumentSynchronizesWindowEditedIndicator() {
    let document = InkoraDocument()
    let window = NSWindow()
    document.addWindowController(NSWindowController(window: window))
    for (revision, dirty) in [(1, true), (2, false), (3, true), (3, false)] {
      document.editorDidChangeState(
        BridgeEditorState(
          documentID: document.bridgeDocumentID, revision: revision,
          dirty: dirty, canUndo: true, canRedo: false
        ))
      XCTAssertEqual(window.isDocumentEdited, dirty)
    }
    document.close()
  }

  @MainActor
  func testRepeatedDirtyStatesDoNotAccumulateNativeUndoCount() {
    let document = InkoraDocument()
    for revision in 1...3 {
      document.editorDidChangeState(
        BridgeEditorState(
          documentID: document.bridgeDocumentID, revision: revision,
          dirty: true, canUndo: true, canRedo: false
        ))
    }
    document.updateChangeCount(.changeUndone)
    XCTAssertFalse(document.isDocumentEdited, "Native state has one dirty transition")
  }

  @MainActor
  func testExternalChangesNeverOverwriteWithOrWithoutLocalEdits() async throws {
    for dirty in [false, true] {
      let directory = try temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: directory) }
      let url = directory.appendingPathComponent("external.md")
      try Data("original".utf8).write(to: url)
      let document = document(snapshots: ["local", "local"])
      try document.read(from: url, ofType: markdownType)
      document.fileURL = url
      if dirty { document.updateChangeCount(.changeDone) }
      let date = try FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate]
      try Data("external".utf8).write(to: url, options: .atomic)
      if let date {
        try FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: url.path)
      }
      document.refreshFileState()
      XCTAssertEqual(document.fileState, .externalChange)
      let error = await save(document, to: url, operation: .saveOperation)
      XCTAssertEqual(error as? DocumentFileState, .externalChange)
      XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "external")
      XCTAssertEqual(document.isDocumentEdited, dirty)
      let copy = directory.appendingPathComponent("copy.md")
      let copyError = await save(document, to: copy, operation: .saveAsOperation)
      XCTAssertNil(copyError)
      XCTAssertEqual(try String(contentsOf: copy, encoding: .utf8), "local")
      XCTAssertEqual(document.fileState, .current)
      document.close()
    }
  }

  @MainActor
  func testReadOnlyFileAndDirectoryRequireAnotherDestination() async throws {
    for protectDirectory in [false, true] {
      let directory = try temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: directory) }
      let url = directory.appendingPathComponent("readonly.md")
      try Data("original".utf8).write(to: url)
      let document = document(snapshots: ["local", "local"])
      try document.read(from: url, ofType: markdownType)
      document.fileURL = url
      document.updateChangeCount(.changeDone)
      let protected = protectDirectory ? directory : url
      try FileManager.default.setAttributes(
        [.posixPermissions: 0o555], ofItemAtPath: protected.path)
      defer {
        try? FileManager.default.setAttributes(
          [.posixPermissions: 0o755], ofItemAtPath: protected.path)
      }
      document.refreshFileState()
      XCTAssertEqual(document.fileState, .readOnly)
      let error = await save(document, to: url, operation: .saveOperation)
      XCTAssertEqual(error as? DocumentFileState, .readOnly)
      XCTAssertTrue(document.isDocumentEdited)
      XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "original")
      try FileManager.default.setAttributes(
        [.posixPermissions: 0o755], ofItemAtPath: protected.path)
      document.refreshFileState()
      XCTAssertEqual(document.fileState, .current)
      document.close()
    }
  }

  @MainActor
  func testFileStateSubtitlePreservesAccessibleFilename() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("accessible.md")
    try Data("original".utf8).write(to: url)
    let document = try InkoraDocument(contentsOf: url, ofType: markdownType)
    let window = NSWindow()
    document.addWindowController(NSWindowController(window: window))
    defer { document.close() }
    try FileManager.default.setAttributes([.posixPermissions: 0o444], ofItemAtPath: url.path)
    document.refreshFileState()
    XCTAssertEqual(document.fileState, .readOnly)
    XCTAssertEqual(window.accessibilityTitle(), document.displayName)
    XCTAssertEqual(window.subtitle, DocumentFileState.readOnly.localizedDescription)
  }

  @MainActor
  func testLockedFlagIsReadOnlyUntilUnlocked() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("locked.md")
    try Data("original".utf8).write(to: url)
    let document = try InkoraDocument(contentsOf: url, ofType: markdownType)
    defer { document.close() }
    try FileManager.default.setAttributes([.immutable: true], ofItemAtPath: url.path)
    defer { try? FileManager.default.setAttributes([.immutable: false], ofItemAtPath: url.path) }
    document.refreshFileState()
    XCTAssertEqual(document.fileState, .readOnly)
    try FileManager.default.setAttributes([.immutable: false], ofItemAtPath: url.path)
    document.refreshFileState()
    XCTAssertEqual(document.fileState, .current)
  }

  @MainActor
  func testDeletionPreservesBufferAndDirtyUntilSaveAs() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("deleted.md")
    try Data("original".utf8).write(to: url)
    let document = document(snapshots: ["local", "local"])
    try document.read(from: url, ofType: markdownType)
    document.fileURL = url
    try FileManager.default.removeItem(at: url)
    document.refreshFileState()
    XCTAssertEqual(document.fileState, .deleted)
    XCTAssertEqual(document.text, "original")
    XCTAssertTrue(document.isDocumentEdited)
    let error = await save(document, to: url, operation: .saveOperation)
    XCTAssertEqual(error as? DocumentFileState, .deleted)
    XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    let copy = directory.appendingPathComponent("recovered.md")
    let copyError = await save(document, to: copy, operation: .saveAsOperation)
    XCTAssertNil(copyError)
    XCTAssertEqual(try String(contentsOf: copy, encoding: .utf8), "local")
    XCTAssertFalse(document.isDocumentEdited)
    document.close()
  }

  @MainActor
  func testReloadResetsRevisionIdentityAndDirtyBaseline() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("reload.md")
    try Data("original".utf8).write(to: url)
    let document = try InkoraDocument(contentsOf: url, ofType: markdownType)
    let oldID = document.bridgeDocumentID
    document.updateChangeCount(.changeDone)
    try Data([0xEF, 0xBB, 0xBF] + Array("external\r\n".utf8)).write(to: url)
    try document.reloadFromDisk()
    XCTAssertNotEqual(document.bridgeDocumentID, oldID)
    XCTAssertEqual(document.bridgeRevision, 0)
    XCTAssertFalse(document.isDocumentEdited)
    XCTAssertEqual(document.text, "external\r\n")
    XCTAssertEqual(try document.data(ofType: markdownType), try Data(contentsOf: url))
    document.close()
  }

  @MainActor
  func testPresenterFollowsRenameAndMoveWithoutLosingEdits() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let original = directory.appendingPathComponent("original.md")
    try Data("original".utf8).write(to: original)
    let document = document(snapshots: ["local", "local"])
    try document.read(from: original, ofType: markdownType)
    document.fileURL = original
    document.updateChangeCount(.changeDone)
    for destination in [
      directory.appendingPathComponent("renamed.md"),
      directory.appendingPathComponent("sub/moved.md"),
    ] {
      try FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
      try FileManager.default.moveItem(at: try XCTUnwrap(document.fileURL), to: destination)
      document.presentedItemDidMove(to: destination)
      await Task.yield()
      // Presenter callbacks are delivered on the main queue.
      await withCheckedContinuation { continuation in
        DispatchQueue.main.async { continuation.resume() }
      }
      XCTAssertEqual(document.fileURL, destination)
      XCTAssertTrue(document.isDocumentEdited)
      XCTAssertEqual(document.text, "original")
    }
    let destination = try XCTUnwrap(document.fileURL)
    let error = await save(document, to: destination, operation: .saveOperation)
    XCTAssertNil(error)
    XCTAssertEqual(try String(contentsOf: destination, encoding: .utf8), "local")
    document.close()
  }

  @MainActor
  func testExternalChangeDuringSnapshotIsRejectedBeforeWriting() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("race.md")
    try Data("original".utf8).write(to: url)
    let document = InkoraDocument(snapshotRequester: { completion in
      do { try Data("racing external".utf8).write(to: url) } catch { XCTFail("\(error)") }
      completion(.success(BridgeSnapshot(documentID: "test", revision: 1, text: "local")))
    })
    try document.read(from: url, ofType: markdownType)
    document.fileURL = url
    document.updateChangeCount(.changeDone)
    let error = await save(document, to: url, operation: .saveOperation)
    XCTAssertEqual(error as? DocumentFileState, .externalChange)
    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "racing external")
    XCTAssertTrue(document.isDocumentEdited)
    document.close()
  }

  @MainActor
  func testFirstSavePublishesVerifiedImageBeforeMarkdownAndThenConfirmsManifest() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let target = directory.appendingPathComponent("Note.md")
    let imageTarget = directory.appendingPathComponent("Note.assets/Pasted Image.png")
    let png = Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )!
    let writer = ObservingDocumentDataWriter {
      XCTAssertEqual(try? Data(contentsOf: imageTarget), png)
    }
    var documentID = ""
    var snapshotText = ""
    let document = InkoraDocument(
      snapshotRequester: { completion in
        completion(
          .success(
            BridgeSnapshot(
              documentID: documentID, revision: 1, text: snapshotText)))
      }, dataWriter: writer)
    documentID = document.bridgeDocumentID
    document.configureRecovery(
      store: RecoveryStore(
        directory: directory.appendingPathComponent("Recovery")))
    let session = try document.localImages()
    let asset = try document.importPastedPNG(png, authorizedDirectory: nil)
    try session.markInsertionAccepted(assetID: asset.id)
    let plan = try XCTUnwrap(
      document.prepareLocalImagesForSave(
        documentURL: target, authorizedDirectory: directory))
    snapshotText = "![图](\(try XCTUnwrap(plan.items.first?.targetURI)))\n"
    document.configureImageSavePreparer { _, completion in
      completion(
        .success(
          DocumentImageSavePreparation(
            managedPlan: plan, sourceAuthorizedDirectory: nil,
            targetAuthorizedDirectory: directory)))
    }
    document.updateChangeCount(.changeDone)

    let saveError = await save(document, to: target, operation: .saveAsOperation)
    XCTAssertNil(saveError)
    XCTAssertTrue(writer.observed)
    XCTAssertEqual(try String(contentsOf: target, encoding: .utf8), snapshotText)
    XCTAssertTrue(session.assets.isEmpty, "Transferred recovery resources should retire")
    document.close()
  }

  @MainActor
  func testMarkdownWriteFailureKeepsPublishedOrphanAndAwaitingManifestDirty() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let target = directory.appendingPathComponent("Note.md")
    let png = Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )!
    var documentID = ""
    var snapshotText = ""
    let document = InkoraDocument(
      snapshotRequester: { completion in
        completion(
          .success(
            BridgeSnapshot(
              documentID: documentID, revision: 1, text: snapshotText)))
      }, dataWriter: FailingDocumentDataWriter(error: CocoaError(.fileWriteOutOfSpace)))
    documentID = document.bridgeDocumentID
    document.configureRecovery(
      store: RecoveryStore(
        directory: directory.appendingPathComponent("Recovery")))
    let session = try document.localImages()
    let asset = try document.importPastedPNG(png, authorizedDirectory: nil)
    try session.markInsertionAccepted(assetID: asset.id)
    let plan = try XCTUnwrap(
      document.prepareLocalImagesForSave(
        documentURL: target, authorizedDirectory: directory))
    snapshotText = "![图](\(try XCTUnwrap(plan.items.first?.targetURI)))\n"
    document.configureImageSavePreparer { _, completion in
      completion(
        .success(
          DocumentImageSavePreparation(
            managedPlan: plan, sourceAuthorizedDirectory: nil,
            targetAuthorizedDirectory: directory)))
    }
    document.updateChangeCount(.changeDone)

    let saveError = await save(document, to: target, operation: .saveAsOperation)
    XCTAssertNotNil(saveError)
    XCTAssertFalse(FileManager.default.fileExists(atPath: target.path))
    XCTAssertEqual(
      try Data(contentsOf: directory.appendingPathComponent("Note.assets/Pasted Image.png")), png)
    XCTAssertEqual(session.assets.first?.state, .awaitingMarkdown)
    XCTAssertTrue(document.isDocumentEdited)
    document.close()
  }

  @MainActor
  func testSaveAsMigratesRelativeImageBeforeMarkdownWithoutChangingSourceBytes() async throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let sourceDirectory = scratch.appendingPathComponent("Source")
    let targetDirectory = scratch.appendingPathComponent("Target")
    try FileManager.default.createDirectory(
      at: sourceDirectory.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: true)
    let sourceURL = sourceDirectory.appendingPathComponent("Old.md")
    let targetURL = targetDirectory.appendingPathComponent("New.md")
    let resourceURL = sourceDirectory.appendingPathComponent("Old.assets/a.png")
    let png = Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )!
    let markdown = "![图][asset]\r\n\r\n[asset]: Old.assets/a.png \"标题\"\r\n"
    try Data(markdown.utf8).write(to: sourceURL)
    try png.write(to: resourceURL)
    var documentID = ""
    let document = InkoraDocument { completion in
      completion(
        .success(BridgeSnapshot(documentID: documentID, revision: 1, text: markdown)))
    }
    documentID = document.bridgeDocumentID
    try document.read(from: sourceURL, ofType: markdownType)
    document.fileURL = sourceURL
    document.configureRecovery(
      store: RecoveryStore(directory: scratch.appendingPathComponent("Recovery")))
    document.configureImageSavePreparer { _, completion in
      completion(
        .success(
          DocumentImageSavePreparation(
            managedPlan: nil, sourceAuthorizedDirectory: sourceDirectory,
            targetAuthorizedDirectory: targetDirectory)))
    }
    document.updateChangeCount(.changeDone)

    let error = await save(document, to: targetURL, operation: .saveAsOperation)

    XCTAssertNil(error)
    XCTAssertEqual(try Data(contentsOf: sourceURL), Data(markdown.utf8))
    XCTAssertEqual(try Data(contentsOf: resourceURL), png)
    XCTAssertEqual(try Data(contentsOf: targetURL), Data(markdown.utf8))
    XCTAssertEqual(
      try Data(contentsOf: targetDirectory.appendingPathComponent("Old.assets/a.png")), png)
    document.close()
  }

  private func fixtureData(named name: String) throws -> Data {
    let bundle = Bundle(for: Self.self)
    let url = try XCTUnwrap(
      bundle.url(forResource: name, withExtension: "md", subdirectory: "fixtures")
    )
    return try Data(contentsOf: url)
  }

  @MainActor
  private func document(snapshots: [String]) -> InkoraDocument {
    var remaining = snapshots
    var revision = 0
    var documentID = ""
    let document = InkoraDocument { completion in
      let text = remaining.removeFirst()
      revision += 1
      completion(
        .success(BridgeSnapshot(documentID: documentID, revision: revision, text: text))
      )
    }
    documentID = document.bridgeDocumentID
    return document
  }

  @MainActor
  private func save(
    _ document: InkoraDocument,
    to url: URL,
    operation: NSDocument.SaveOperationType
  ) async -> Error? {
    await withCheckedContinuation { continuation in
      document.save(
        to: url,
        ofType: markdownType,
        for: operation
      ) { error in
        continuation.resume(returning: error)
      }
    }
  }

  @MainActor
  private func assertWriteFailurePreservesFile(_ code: CocoaError.Code) async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("failure.md")
    try Data("old".utf8).write(to: url)
    var documentID = ""
    let document = InkoraDocument(
      snapshotRequester: { completion in
        completion(.success(BridgeSnapshot(documentID: documentID, revision: 1, text: "new")))
      },
      dataWriter: FailingDocumentDataWriter(error: CocoaError(code))
    )
    documentID = document.bridgeDocumentID
    document.fileURL = url
    document.updateChangeCount(.changeDone)

    let error = await save(document, to: url, operation: .saveOperation)

    XCTAssertNotNil(error)
    XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), "old")
    XCTAssertTrue(document.isDocumentEdited)
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraDocumentTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }
}

private struct FailingDocumentDataWriter: DocumentDataWriting {
  let error: Error

  func write(_ data: Data, to url: URL) throws {
    throw error
  }
}

private final class ObservingDocumentDataWriter: DocumentDataWriting, @unchecked Sendable {
  private let observation: () -> Void
  private(set) var observed = false

  init(observation: @escaping () -> Void) { self.observation = observation }

  func write(_ data: Data, to url: URL) throws {
    observation()
    observed = true
    try data.write(to: url, options: .atomic)
  }
}
