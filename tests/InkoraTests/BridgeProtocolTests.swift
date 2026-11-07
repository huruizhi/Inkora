import XCTest

final class BridgeProtocolTests: XCTestCase {
  func testLoadDocumentRoundTripsMarkdownBytes() throws {
    let markdown = "# 中文\r\n\r\nemoji: 🖋️"
    let command = BridgeNativeCommand.loadDocument(
      requestID: "load-1",
      documentID: "doc-1",
      revision: 0,
      text: markdown
    )

    try command.validate()
    let decoded = try JSONDecoder().decode(
      BridgeNativeCommand.self,
      from: JSONEncoder().encode(command)
    )

    XCTAssertEqual(decoded, command)
    XCTAssertEqual(decoded.text, markdown)
  }

  func testSnapshotEventRoundTripsRevisionAndText() throws {
    let json = """
      {
        "protocolVersion": 1,
        "type": "snapshotReady",
        "requestID": "snapshot-1",
        "documentID": "doc-1",
        "revision": 7,
        "text": "正文"
      }
      """
    let event = try JSONDecoder().decode(BridgeEditorEvent.self, from: Data(json.utf8))

    try event.validate()
    XCTAssertEqual(event.type, .snapshotReady)
    XCTAssertEqual(event.revision, 7)
    XCTAssertEqual(event.text, "正文")
  }

  func testRevisionTrackerRejectsWrongDocumentAndOlderRevision() {
    var tracker = BridgeRevisionTracker()
    tracker.beginDocument(documentID: "doc-1", revision: 4)

    XCTAssertTrue(
      tracker.accept(
        BridgeEditorState(
          documentID: "doc-1",
          revision: 5,
          dirty: true,
          canUndo: true,
          canRedo: false
        )
      )
    )
    XCTAssertFalse(
      tracker.accept(
        BridgeEditorState(
          documentID: "doc-1",
          revision: 3,
          dirty: true,
          canUndo: true,
          canRedo: false
        )
      )
    )
    XCTAssertFalse(
      tracker.accept(
        BridgeEditorState(
          documentID: "doc-2",
          revision: 6,
          dirty: true,
          canUndo: true,
          canRedo: false
        )
      )
    )
    XCTAssertEqual(tracker.latestRevision, 5)

    tracker.observeSnapshot(documentID: "doc-1", revision: 7)
    tracker.observeSnapshot(documentID: "doc-1", revision: 6)
    tracker.observeSnapshot(documentID: "doc-2", revision: 9)
    XCTAssertEqual(tracker.latestRevision, 7)
  }

  func testErrorCodesHaveDeterministicRecoveryActions() {
    XCTAssertEqual(BridgeErrorCode.editorNotReady.recoveryAction, .retry)
    XCTAssertEqual(BridgeErrorCode.staleRevision.recoveryAction, .retry)
    XCTAssertEqual(BridgeErrorCode.commandRejected.recoveryAction, .notify)
    XCTAssertEqual(BridgeErrorCode.invalidMessage.recoveryAction, .stopSaving)
    XCTAssertEqual(BridgeErrorCode.internalError.recoveryAction, .stopSaving)
  }

  func testEventRejectsMismatchedErrorAction() throws {
    let json = """
      {
        "protocolVersion": 1,
        "type": "editorError",
        "code": "stale_revision",
        "action": "stop_saving",
        "message": "stale"
      }
      """
    let event = try JSONDecoder().decode(BridgeEditorEvent.self, from: Data(json.utf8))

    XCTAssertThrowsError(try event.validate()) { error in
      XCTAssertEqual(error as? BridgeProtocolValidationError, .invalidErrorAction)
    }
  }
}
