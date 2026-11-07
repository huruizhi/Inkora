import XCTest

final class InkoraDocumentTests: XCTestCase {
  private let markdownType = "net.daringfireball.markdown"

  @MainActor
  func testUnmodifiedMarkdownRoundTripsByteForByte() throws {
    for fixture in ["crlf", "no-final-newline", "unicode"] {
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
