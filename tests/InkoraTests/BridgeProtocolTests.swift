import XCTest

final class BridgeProtocolTests: XCTestCase {
  func testCommandValidationRejectsMissingFieldsAndUnsafeRevisions() throws {
    let valid: [String: Any] = [
      "protocolVersion": 1, "type": "loadDocument", "requestID": "r",
      "documentID": "d", "revision": 0, "text": "",
    ]
    let invalid: [(String, Any?, BridgeProtocolValidationError)] = [
      ("protocolVersion", 2, .unsupportedVersion),
      ("requestID", "", .missingField("requestID")),
      ("documentID", "", .missingField("documentID")),
      ("text", nil, .missingField("text")),
      ("revision", -1, .invalidRevision),
      ("revision", BridgeProtocolV1.maxSafeRevision + 1, .invalidRevision),
    ]
    for (key, value, expected) in invalid {
      var json = valid
      json[key] = value
      let command = try JSONDecoder().decode(
        BridgeNativeCommand.self, from: JSONSerialization.data(withJSONObject: json))
      XCTAssertThrowsError(try command.validate()) {
        XCTAssertEqual($0 as? BridgeProtocolValidationError, expected, key)
      }
    }
    for revision in [0, BridgeProtocolV1.maxSafeRevision] {
      try BridgeNativeCommand.loadDocument(
        requestID: "r", documentID: "d", revision: revision, text: ""
      ).validate()
    }
  }

  func testSnapshotEventValidationRejectsMissingFieldsAndUnsafeRevisions() throws {
    let valid: [String: Any] = [
      "protocolVersion": 1, "type": "snapshotReady", "requestID": "r",
      "documentID": "d", "revision": 0, "text": "",
    ]
    for key in ["requestID", "documentID", "revision", "text"] {
      var json = valid
      json.removeValue(forKey: key)
      let event = try JSONDecoder().decode(
        BridgeEditorEvent.self, from: JSONSerialization.data(withJSONObject: json))
      XCTAssertThrowsError(try event.validate()) {
        XCTAssertEqual($0 as? BridgeProtocolValidationError, .missingField(key))
      }
    }
    for revision in [-1, BridgeProtocolV1.maxSafeRevision + 1] {
      var json = valid
      json["revision"] = revision
      let event = try JSONDecoder().decode(
        BridgeEditorEvent.self, from: JSONSerialization.data(withJSONObject: json))
      XCTAssertThrowsError(try event.validate()) {
        XCTAssertEqual($0 as? BridgeProtocolValidationError, .invalidRevision)
      }
    }
  }

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

  func testMarkSavedCommandRoundTripsExactSnapshot() throws {
    let markdown = "# 已保存\r\n\r\n正文"
    let command = BridgeNativeCommand.markSaved(
      requestID: "saved-1",
      documentID: "doc-1",
      revision: 7,
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

  func testEditorCommandFactoryCarriesDocumentRevision() throws {
    let command = BridgeNativeCommand.execute(
      requestID: "undo-1",
      documentID: "doc-1",
      revision: 8,
      command: .undo
    )

    try command.validate()
    XCTAssertEqual(command.type, .executeCommand)
    XCTAssertEqual(command.documentID, "doc-1")
    XCTAssertEqual(command.revision, 8)
    XCTAssertEqual(command.command, .undo)
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
