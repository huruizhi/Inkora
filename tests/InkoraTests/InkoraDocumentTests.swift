import AppKit
import XCTest

final class InkoraDocumentTests: XCTestCase {
  private let markdownType = "net.daringfireball.markdown"

  @MainActor
  func testUnmodifiedMarkdownRoundTripsByteForByte() throws {
    for fixture in ["crlf", "no-final-newline", "unicode", "utf8-bom", "mixed-eol"] {
      let original = try fixtureData(named: fixture)
      let document = InkoraDocument()

      try document.read(from: original, ofType: "net.daringfireball.markdown")
      let saved = try document.data(ofType: "net.daringfireball.markdown")

      XCTAssertEqual(saved, original, "Fixture changed: \(fixture)")
    }
  }

  @MainActor
  func testInvalidUTF8IsRejected() {
    let document = InkoraDocument()
    let invalidUTF8 = Data([0xC3, 0x28])

    XCTAssertThrowsError(
      try document.read(from: invalidUTF8, ofType: "net.daringfireball.markdown")
    )
  }

  @MainActor
  func testGBKEncodedFileIsRejectedAsInvalidUTF8() throws {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("gbk-\(UUID().uuidString).md")
    // "中文" encoded as GBK: no BOM, but not valid UTF-8 either.
    try Data([0xD6, 0xD0, 0xCE, 0xC4]).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }

    XCTAssertThrowsError(
      try InkoraDocument(contentsOf: url, ofType: "net.daringfireball.markdown")
    ) { error in
      XCTAssertEqual(
        error.localizedDescription,
        InkoraDocumentError.invalidUTF8.localizedDescription
      )
    }
  }

  @MainActor
  func testUTF16AndUTF32ByteOrderMarksAreRejectedWithExplicitErrors() throws {
    let encodings: [(data: Data, error: InkoraDocumentError)] = [
      // UTF-16LE with "hi", UTF-16BE with "hi", UTF-32LE/BE BOMs only.
      (Data([0xFF, 0xFE, 0x68, 0x00, 0x69, 0x00]), .utf16Detected),
      (Data([0xFE, 0xFF, 0x00, 0x68, 0x00, 0x69]), .utf16Detected),
      (Data([0xFF, 0xFE, 0x00, 0x00]), .utf32Detected),
      (Data([0x00, 0x00, 0xFE, 0xFF]), .utf32Detected),
    ]

    for (payload, expected) in encodings {
      let document = InkoraDocument()
      XCTAssertThrowsError(
        try document.read(from: payload, ofType: "net.daringfireball.markdown")
      ) { error in
        XCTAssertEqual(
          error.localizedDescription,
          expected.localizedDescription,
          "Wrong error for \(payload.map { String(format: "%02X", $0) })"
        )
        XCTAssertEqual(
          (error as? LocalizedError)?.failureReason,
          expected.failureReason,
          "Wrong failure reason for \(payload.map { String(format: "%02X", $0) })"
        )
      }
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
  func testInvalidUTF8FileDoesNotCreateAnEditableDocument() throws {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("invalid-\(UUID().uuidString).md")
    try Data([0xC3, 0x28]).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }

    XCTAssertThrowsError(
      try InkoraDocument(contentsOf: url, ofType: "net.daringfireball.markdown")
    ) { error in
      XCTAssertEqual(
        error.localizedDescription,
        InkoraDocumentError.invalidUTF8.localizedDescription
      )
    }
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
