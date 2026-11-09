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
        "text": "![图](Old.assets/a.png)",
        "imageOwnership": {
          "documentID": "doc-1",
          "revision": 7,
          "raw": "![图](Old.assets/a.png)",
          "imageURIs": ["Old.assets/a.png"]
        }
      }
      """
    let event = try JSONDecoder().decode(BridgeEditorEvent.self, from: Data(json.utf8))

    try event.validate()
    XCTAssertEqual(event.type, .snapshotReady)
    XCTAssertEqual(event.revision, 7)
    XCTAssertEqual(event.text, "![图](Old.assets/a.png)")
    XCTAssertEqual(event.imageOwnership?.imageURIs, ["Old.assets/a.png"])
  }

  func testSnapshotRejectsImageOwnershipFromAnotherAcceptedDocumentVersion() throws {
    let mismatches: [[String: Any]] = [
      ["documentID": "other", "revision": 7, "raw": "same", "imageURIs": []],
      ["documentID": "doc-1", "revision": 6, "raw": "same", "imageURIs": []],
      ["documentID": "doc-1", "revision": 7, "raw": "other", "imageURIs": []],
      ["documentID": "doc-1", "revision": 7, "raw": "same", "imageURIs": [""]],
    ]
    for proof in mismatches {
      let json: [String: Any] = [
        "protocolVersion": 1, "type": "snapshotReady", "requestID": "snapshot-1",
        "documentID": "doc-1", "revision": 7, "text": "same",
        "imageOwnership": proof,
      ]
      let event = try JSONDecoder().decode(
        BridgeEditorEvent.self, from: JSONSerialization.data(withJSONObject: json))
      XCTAssertThrowsError(try event.validate())
    }
  }

  func testStateChangedValidatesAndRoundTripsDirectedSelection() throws {
    let json = """
      {
        "protocolVersion": 1,
        "type": "stateChanged",
        "requestID": "state-selection",
        "state": {
          "documentID": "doc-1",
          "revision": 7,
          "dirty": true,
          "canUndo": true,
          "canRedo": false,
          "selectionAnchor": 9,
          "selectionHead": 3
        }
      }
      """
    let event = try JSONDecoder().decode(BridgeEditorEvent.self, from: Data(json.utf8))
    try event.validate()
    XCTAssertEqual(event.state?.selectionAnchor, 9)
    XCTAssertEqual(event.state?.selectionHead, 3)
    XCTAssertEqual(
      try JSONDecoder().decode(
        BridgeEditorEvent.self, from: JSONEncoder().encode(event)), event)
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

  func testImageCommandsRoundTripWithStrictDocumentEpochAndCapabilities() throws {
    let descriptor = BridgeImageDescriptor(
      href: "Note.assets/a.png", status: .ready,
      displayURL: "inkora-asset://resource/123e4567-e89b-12d3-a456-426614174000",
      message: nil)
    let importCommand = BridgeNativeCommand.applyImageImport(
      requestID: "image-1", documentID: "doc-1", revision: 4,
      documentEpoch: "epoch-1", assetID: "asset-1", uri: "Note.assets/a.png",
      alt: "图", title: nil, displayURL: descriptor.displayURL!,
      selectionAnchor: 3, selectionHead: 1)
    let ownership = BridgeImageOwnershipProof(
      documentID: "doc-1", revision: 4, raw: "![a](Note.assets/a.png)",
      imageURIs: ["Note.assets/a.png", "inkora-draft://asset/asset-1"])
    let descriptors = BridgeNativeCommand.setImageDescriptors(
      requestID: "descriptors-1", documentID: "doc-1", revision: 4,
      documentEpoch: "epoch-1", ownership: ownership, descriptors: [descriptor])
    let prepare = BridgeNativeCommand.prepareImageSave(
      requestID: "prepare-1", documentID: "doc-1", revision: 4,
      documentEpoch: "epoch-1", ownership: ownership,
      rewrites: [
        BridgeImageRewrite(
          assetID: "asset-1", from: "inkora-draft://asset/asset-1",
          to: "Note.assets/a.png")
      ])

    for command in [importCommand, descriptors, prepare] {
      try command.validate()
      XCTAssertEqual(
        try JSONDecoder().decode(BridgeNativeCommand.self, from: JSONEncoder().encode(command)),
        command)
    }
  }

  func testImageDescriptorRejectsFileURLAndReadyWithoutCapability() throws {
    let invalid = BridgeNativeCommand.setImageDescriptors(
      requestID: "bad", documentID: "doc-1", revision: 0,
      documentEpoch: "epoch-1",
      ownership: BridgeImageOwnershipProof(
        documentID: "doc-1", revision: 0, raw: "![a](a.png)", imageURIs: ["a.png"]),
      descriptors: [
        BridgeImageDescriptor(
          href: "a.png", status: .ready, displayURL: "file:///tmp/a.png", message: nil)
      ])
    XCTAssertThrowsError(try invalid.validate())
  }

  func testLegacyImageCommandDecodesButCannotRunWithoutOwnershipProof() throws {
    let json = """
      {"protocolVersion":1,"type":"setImageDescriptors","requestID":"legacy",\
      "documentID":"doc-1","revision":0,"documentEpoch":"epoch-1","descriptors":[]}
      """
    let command = try JSONDecoder().decode(BridgeNativeCommand.self, from: Data(json.utf8))
    XCTAssertThrowsError(try command.validate()) {
      XCTAssertEqual(
        $0 as? BridgeProtocolValidationError, .missingField("imageOwnership"))
    }
  }

  func testImageAccessRequestRequiresCurrentDocumentRevisionAndHrefShape() throws {
    let json = """
      {"protocolVersion":1,"type":"imageAccessRequested","documentID":"doc-1",\
      "revision":3,"href":"Old.assets/a.png","imageOwnership":{\
      "documentID":"doc-1","revision":3,"raw":"![a](Old.assets/a.png)",\
      "imageURIs":["Old.assets/a.png"]}}
      """
    let event = try JSONDecoder().decode(BridgeEditorEvent.self, from: Data(json.utf8))
    try event.validate()
    XCTAssertEqual(event.href, "Old.assets/a.png")
    XCTAssertEqual(event.imageOwnership?.raw, "![a](Old.assets/a.png)")

    let missing = """
      {"protocolVersion":1,"type":"imageAccessRequested","documentID":"doc-1","revision":3}
      """
    let invalid = try JSONDecoder().decode(BridgeEditorEvent.self, from: Data(missing.utf8))
    XCTAssertThrowsError(try invalid.validate()) {
      XCTAssertEqual($0 as? BridgeProtocolValidationError, .missingField("href"))
    }

    let foreignOwner = """
      {"protocolVersion":1,"type":"imageAccessRequested","documentID":"doc-1",\
      "revision":3,"href":"Old.assets/a.png","imageOwnership":{\
      "documentID":"doc-1","revision":2,"raw":"![a](Old.assets/a.png)",\
      "imageURIs":["Old.assets/a.png"]}}
      """
    let foreignEvent = try JSONDecoder().decode(
      BridgeEditorEvent.self, from: Data(foreignOwner.utf8))
    XCTAssertThrowsError(try foreignEvent.validate()) {
      XCTAssertEqual($0 as? BridgeProtocolValidationError, .invalidImageOwnership)
    }

    let unownedHref = """
      {"protocolVersion":1,"type":"imageAccessRequested","documentID":"doc-1",\
      "revision":3,"href":"Old.assets/a.png","imageOwnership":{\
      "documentID":"doc-1","revision":3,"raw":"plain","imageURIs":[]}}
      """
    let unownedEvent = try JSONDecoder().decode(
      BridgeEditorEvent.self, from: Data(unownedHref.utf8))
    XCTAssertThrowsError(try unownedEvent.validate()) {
      XCTAssertEqual($0 as? BridgeProtocolValidationError, .invalidImageOwnership)
    }
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
