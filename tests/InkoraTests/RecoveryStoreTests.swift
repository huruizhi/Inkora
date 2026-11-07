import AppKit
import XCTest

final class RecoveryStoreTests: XCTestCase {
  private func directory() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      "RecoveryTests-\(UUID())")
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: url) }
    return url
  }

  private func draft(
    id: UUID = UUID(), revision: Int = 2, text: String = "草稿\r\n",
    source: URL? = nil
  ) throws -> RecoveryDraft {
    RecoveryDraft(
      id: id, revision: revision, data: Data(text.utf8), sourceURL: source,
      sourceFingerprint: try source.map { try RecoveryFingerprint.read($0) })
  }

  func testProcessRestartFindsNamedAndUntitledDraftsWithExactBytes() throws {
    let root = try directory()
    let source = root.appendingPathComponent("source.md")
    try Data("original".utf8).write(to: source)
    let bytes = Data([0xEF, 0xBB, 0xBF]) + Data("中文 👩‍💻\r\nline\rbare\n".utf8)
    let named = RecoveryDraft(
      id: UUID(), revision: 17, data: bytes, sourceURL: source,
      sourceFingerprint: try RecoveryFingerprint.read(source))
    let untitled = try draft()
    try RecoveryStore(directory: root).write(named)
    try RecoveryStore(directory: root).write(untitled)
    // A new store has no in-memory state from the simulated killed process.
    let restarted = RecoveryStore(directory: root).discover()
    XCTAssertEqual(Set(restarted.drafts.map(\.id)), [named.id, untitled.id])
    let restored = try XCTUnwrap(restarted.drafts.first { $0.id == named.id })
    XCTAssertEqual(restored.data, bytes)
    XCTAssertTrue(restored.hasBOM)
    XCTAssertEqual(Set(restored.lineEndings), ["\r\n", "\r", "\n"])
    XCTAssertEqual(restored.revision, 17)
    XCTAssertEqual(restored.sourceFingerprint?.size, 8)
    XCTAssertFalse(restored.sourceChanged)
    XCTAssertFalse(restored.appVersion.isEmpty)
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original")
  }

  func testCorruptTruncatedJSONAndHashMismatchAreNeverOffered() throws {
    let root = try directory()
    let store = RecoveryStore(directory: root)
    for contents in [Data("{".utf8), Data("not json".utf8)] {
      try contents.write(to: store.draftURL(UUID()))
    }
    let valid = try draft()
    var object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: JSONEncoder().encode(valid)) as? [String: Any])
    object["payloadHash"] = "tampered"
    try JSONSerialization.data(withJSONObject: object).write(to: store.draftURL(valid.id))
    XCTAssertEqual(store.discover().corruptCount, 3)
    XCTAssertTrue(store.discover().drafts.isEmpty)
  }

  func testSourceChangedOrDeletedIsAConflictAndSavedBytesAreNotOffered() throws {
    let root = try directory()
    let source = root.appendingPathComponent("source.md")
    try Data("original".utf8).write(to: source)
    let record = try draft(source: source)
    let store = RecoveryStore(directory: root)
    try store.write(record)
    try Data("external".utf8).write(to: source)
    XCTAssertTrue(try XCTUnwrap(store.discover().drafts.first).sourceChanged)
    try FileManager.default.removeItem(at: source)
    XCTAssertTrue(try XCTUnwrap(store.discover().drafts.first).sourceChanged)
    try record.data.write(to: source)
    XCTAssertTrue(store.discover().drafts.isEmpty, "Crash after save must not offer saved content")
  }

  func testReceiptSuppressesDraftWhenDeletionFailsAndAllowsNewEdits() throws {
    let root = try directory()
    let record = try draft()
    let store = RecoveryStore(
      directory: root, remove: { _ in throw CocoaError(.fileWriteNoPermission) })
    try store.write(record)
    try store.retire(record.id)
    XCTAssertTrue(FileManager.default.fileExists(atPath: store.draftURL(record.id).path))
    XCTAssertTrue(RecoveryStore(directory: root).discover().drafts.isEmpty)
    let newer = try draft(id: record.id, revision: 10)
    try store.write(newer)
    XCTAssertEqual(try XCTUnwrap(store.discover().drafts.first).revision, 10)
  }

  func testReceiptWriteFailureFallsBackToDeletingDraft() throws {
    let root = try directory()
    let record = try draft()
    try RecoveryStore(directory: root).write(record)
    let failing = RecoveryStore(directory: root, writer: RecoveryFailingWriter())
    try failing.retire(record.id)
    XCTAssertTrue(failing.discover().drafts.isEmpty)
  }

  func testFailedAtomicWriteKeepsPreviousRecoverableGeneration() throws {
    let root = try directory()
    let record = try draft()
    try RecoveryStore(directory: root).write(record)
    let failing = RecoveryStore(directory: root, writer: RecoveryFailingWriter())
    XCTAssertThrowsError(try failing.write(draft(id: record.id, revision: 8, text: "new")))
    XCTAssertEqual(failing.discover().drafts, [record])
  }

  func testUnchangedPayloadDoesNotRewriteDisk() throws {
    let root = try directory()
    let record = try draft()
    let store = RecoveryStore(directory: root)
    try store.write(record)
    let before = try Data(contentsOf: store.draftURL(record.id))
    try store.write(draft(id: record.id, revision: 5))
    XCTAssertEqual(try Data(contentsOf: store.draftURL(record.id)), before)
  }

  @MainActor
  func testRestoredDocumentIsUntitledDirtyAndPreservesOriginal() async throws {
    let root = try directory()
    let source = root.appendingPathComponent("source.md")
    try Data("original".utf8).write(to: source)
    let record = try draft(source: source)
    let store = RecoveryStore(directory: root)
    try store.write(record)
    let document = try InkoraDocument(recoveryDraft: record, recoveryStore: store)
    defer { document.close() }
    XCTAssertNil(document.fileURL)
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertEqual(document.text, "草稿\r\n")
    document.editorDidChangeState(
      BridgeEditorState(
        documentID: document.bridgeDocumentID,
        revision: record.revision, dirty: false, canUndo: false, canRedo: false))
    XCTAssertTrue(document.isDocumentEdited, "Editor initialization cannot clear restored dirty")
    XCTAssertFalse(InkoraDocument.autosavesInPlace)
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original")
  }

  @MainActor
  func testSaveAsAndNormalCloseRetireDraftsEvenIfUnlinkFails() async throws {
    let root = try directory()
    let store = RecoveryStore(
      directory: root, remove: { _ in throw CocoaError(.fileWriteNoPermission) })
    let document = InkoraDocument(snapshotRequester: { completion in
      completion(.success(BridgeSnapshot(documentID: "test", revision: 1, text: "edited")))
    })
    document.configureRecovery(store: store)
    document.updateChangeCount(.changeDone)
    try document.writeRecovery(
      BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 0, text: "edited"))
    XCTAssertEqual(store.discover().drafts.count, 1)
    let error: Error? = await withCheckedContinuation { continuation in
      document.save(
        to: root.appendingPathComponent("saved.md"), ofType: "net.daringfireball.markdown",
        for: .saveAsOperation
      ) { continuation.resume(returning: $0) }
    }
    XCTAssertNil(error)
    XCTAssertTrue(store.discover().drafts.isEmpty)
    document.updateChangeCount(.changeDone)
    try document.writeRecovery(
      BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 1, text: "later"))
    XCTAssertEqual(store.discover().drafts.count, 1)
    document.close()
    XCTAssertTrue(RecoveryStore(directory: root).discover().drafts.isEmpty)
  }

  @MainActor
  func testRepeatedEditsDebounceIntoOneRecoverySnapshot() async throws {
    let root = try directory()
    let store = RecoveryStore(directory: root)
    let document = InkoraDocument()
    var requests = 0
    let captured = expectation(description: "debounced snapshot")
    document.configureRecovery(
      store: store,
      snapshotRequester: { completion in
        requests += 1
        completion(
          .success(
            BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 3, text: "latest")))
        captured.fulfill()
      })
    for revision in 1...3 {
      document.editorDidChangeState(
        BridgeEditorState(
          documentID: document.bridgeDocumentID,
          revision: revision, dirty: true, canUndo: true, canRedo: false))
    }
    XCTAssertTrue(store.discover().drafts.isEmpty)
    await fulfillment(of: [captured], timeout: 3)
    XCTAssertEqual(requests, 1)
    XCTAssertEqual(store.discover().drafts.first?.data, Data("latest".utf8))
    document.close()
  }

  @MainActor
  func testFailedRecoveryCaptureKeepsDirtyAndOriginalAndReportsError() throws {
    let root = try directory()
    let source = root.appendingPathComponent("original.md")
    try Data("original".utf8).write(to: source)
    let document = try InkoraDocument(contentsOf: source, ofType: "net.daringfireball.markdown")
    let store = RecoveryStore(
      directory: root.appendingPathComponent("drafts"), writer: RecoveryFailingWriter())
    document.configureRecovery(
      store: store,
      snapshotRequester: { completion in
        completion(
          .success(
            BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 1, text: "local")))
      })
    document.updateChangeCount(.changeDone)
    document.captureRecovery()
    XCTAssertNotNil(document.recoveryError)
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original")
    document.close()
  }

  @MainActor
  func testFailedSaveRetainsDraftForTheNextProcess() async throws {
    let root = try directory()
    let source = root.appendingPathComponent("source.md")
    try Data("original".utf8).write(to: source)
    let document = InkoraDocument(
      snapshotRequester: { completion in
        completion(.success(BridgeSnapshot(documentID: "test", revision: 1, text: "local")))
      }, dataWriter: RecoveryFailingWriter())
    try document.read(from: source, ofType: "net.daringfireball.markdown")
    document.fileURL = source
    let store = RecoveryStore(directory: root.appendingPathComponent("drafts"))
    document.configureRecovery(store: store)
    document.updateChangeCount(.changeDone)
    try document.writeRecovery(
      BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 0, text: "local"))
    let error: Error? = await withCheckedContinuation { continuation in
      document.save(to: source, ofType: "net.daringfireball.markdown", for: .saveOperation) {
        continuation.resume(returning: $0)
      }
    }
    XCTAssertNotNil(error)
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertEqual(
      RecoveryStore(directory: store.directory).discover().drafts.first?.data, Data("local".utf8))
    XCTAssertEqual(try String(contentsOf: source, encoding: .utf8), "original")
    document.close()
  }

  @MainActor
  func testCompositionRejectionRetriesWithoutRequiringAnotherEdit() async throws {
    let root = try directory()
    let store = RecoveryStore(directory: root)
    let document = InkoraDocument()
    let captured = expectation(description: "retry after cancelled composition")
    var requests = 0
    document.configureRecovery(
      store: store,
      snapshotRequester: { completion in
        requests += 1
        if requests == 1 {
          completion(.failure(EditorBridgeError.remote(.editorNotReady, .retry, "composition")))
        } else {
          completion(
            .success(
              BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 1, text: "committed"))
          )
          captured.fulfill()
        }
      })
    document.updateChangeCount(.changeDone)
    document.captureRecovery()
    XCTAssertTrue(store.discover().drafts.isEmpty)
    await fulfillment(of: [captured], timeout: 3)
    XCTAssertEqual(requests, 2)
    XCTAssertEqual(store.discover().drafts.first?.data, Data("committed".utf8))
    document.close()
  }

  @MainActor
  func testDeletedUneditedFileSchedulesARecoverableCopy() async throws {
    let root = try directory()
    let source = root.appendingPathComponent("deleted.md")
    try Data("retained after deletion".utf8).write(to: source)
    let document = try InkoraDocument(contentsOf: source, ofType: "net.daringfireball.markdown")
    let store = RecoveryStore(directory: root.appendingPathComponent("drafts"))
    let captured = expectation(description: "deleted document snapshot")
    document.configureRecovery(
      store: store,
      snapshotRequester: { completion in
        completion(
          .success(
            BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 0, text: document.text))
        )
        captured.fulfill()
      })
    try FileManager.default.removeItem(at: source)
    document.refreshFileState()
    await fulfillment(of: [captured], timeout: 3)
    XCTAssertTrue(document.isDocumentEdited)
    XCTAssertEqual(store.discover().drafts.first?.data, Data("retained after deletion".utf8))
    XCTAssertEqual(store.discover().drafts.first?.sourceURL, source)
    document.close()
  }

  @MainActor
  func testLateSnapshotAfterCleanStateCannotResurrectDraft() throws {
    let root = try directory()
    let store = RecoveryStore(directory: root)
    let document = InkoraDocument()
    document.configureRecovery(store: store)
    let snapshot = BridgeSnapshot(documentID: document.bridgeDocumentID, revision: 1, text: "late")
    try document.writeRecovery(snapshot)
    XCTAssertTrue(store.discover().drafts.isEmpty)
    document.updateChangeCount(.changeDone)
    try document.writeRecovery(snapshot)
    XCTAssertEqual(store.discover().drafts.count, 1)
    document.editorDidChangeState(
      BridgeEditorState(
        documentID: document.bridgeDocumentID,
        revision: 2, dirty: false, canUndo: false, canRedo: false))
    try document.writeRecovery(snapshot)
    XCTAssertTrue(store.discover().drafts.isEmpty)
    document.close()
  }
}

private struct RecoveryFailingWriter: DocumentDataWriting {
  func write(_ data: Data, to url: URL) throws { throw CocoaError(.fileWriteOutOfSpace) }
}
