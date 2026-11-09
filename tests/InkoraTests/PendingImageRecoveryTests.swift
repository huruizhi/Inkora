import Foundation
import XCTest

@MainActor
final class PendingImageRecoveryTests: XCTestCase {
  private let png = Data(
    base64Encoded:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  )!

  func testStartupRecoveryOpensMatchingDraftWithItsVerifiedPendingImages() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let intent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 4,
      selectionAnchor: 2, selectionHead: 1, recoveryState: .active)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil, importIntent: intent)
    let bytes = Data([0xEF, 0xBB, 0xBF]) + Data("正文\r\n".utf8)
    try store.write(
      RecoveryDraft(
        id: sessionID, revision: 4, data: bytes, sourceURL: nil,
        sourceFingerprint: nil))
    let presenter = ScriptedRecoveryPresenter(pendingChoice: .recover)
    var opened: InkoraDocument?
    let coordinator = RecoveryCoordinator(
      storeProvider: { store }, presenter: presenter,
      documentOpener: { document, _ in opened = document })

    coordinator.reviewDrafts()

    let recovered = try XCTUnwrap(opened)
    XCTAssertEqual(recovered.text, "正文\r\n")
    XCTAssertEqual(recovered.bridgeDocumentID, documentID)
    XCTAssertTrue(recovered.isDocumentEdited)
    XCTAssertEqual(try recovered.localImages().assets.map(\.id), [asset.id])
    XCTAssertEqual(presenter.pendingReviews, [sessionID])
    XCTAssertTrue(store.discover().drafts.contains(where: { $0.id == sessionID }))
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testStartupLaterKeepsManifestOnlyRecoveryReachableWithoutOpeningDocument() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil,
      importIntent: LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
        selectionAnchor: 4, selectionHead: 2, recoveryState: .active))
    let presenter = ScriptedRecoveryPresenter(pendingChoice: .later)
    var opened = false

    RecoveryCoordinator(
      storeProvider: { store }, presenter: presenter,
      documentOpener: { _, _ in opened = true }
    ).reviewDrafts()

    XCTAssertFalse(opened)
    let candidate = try XCTUnwrap(store.discover().pendingImageSessions.first)
    XCTAssertEqual(candidate.sessionID, sessionID)
    XCTAssertEqual(candidate.assets.first?.id, asset.id)
    XCTAssertEqual(
      candidate.assets.first?.importIntent?.recoveryState, .requiresConfirmation)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testStartupAbandonFailureKeepsMatchingDraftEvidence() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil,
      importIntent: LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
        selectionAnchor: 0, selectionHead: 0, recoveryState: .active))
    let original = Data("正文\r\n".utf8)
    try store.write(
      RecoveryDraft(
        id: sessionID, revision: 1, data: original, sourceURL: nil,
        sourceFingerprint: nil))
    let manifest = asset.storageURL.deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent("manifest.json")
    let presenter = ScriptedRecoveryPresenter(
      pendingChoice: .abandon,
      beforePendingChoice: {
        try? FileManager.default.removeItem(at: manifest)
        try? FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
      })

    RecoveryCoordinator(
      storeProvider: { store }, presenter: presenter,
      documentOpener: { _, _ in XCTFail("Abandon must not open a document") }
    ).reviewDrafts()

    XCTAssertEqual(presenter.presentedErrors.count, 1)
    XCTAssertEqual(try XCTUnwrap(store.discover().drafts.first).data, original)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testConfirmedRecoveryUsesFreshSelectionAndPersistsSnapshotBeforeHandoff() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let oldEpoch = UUID()
    let freshEpoch = UUID()
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let oldIntent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: oldEpoch, revision: 4,
      selectionAnchor: 99, selectionHead: 88, recoveryState: .active)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil, importIntent: oldIntent)
    let original = Data([0xEF, 0xBB, 0xBF]) + Data("正文\r\n".utf8)
    try store.write(
      RecoveryDraft(
        id: sessionID, revision: 4, data: original, sourceURL: nil,
        sourceFingerprint: nil))
    let candidate = try XCTUnwrap(store.discover().pendingImageSessions.first)
    let document = try InkoraDocument(
      recoveryDraft: try XCTUnwrap(store.discover().drafts.first),
      pendingImageRecovery: candidate,
      recoveryStore: store)
    let freshIntent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: freshEpoch, revision: 4,
      selectionAnchor: 0, selectionHead: 0, recoveryState: .active)
    let recoveredText = "![](\(asset.markdownURI))\r\n正文\r\n"
    var appliedIntent: LocalImageAsset.ImportIntent?
    var completionError: Error?
    var capturedIntentCallback: ((Result<LocalImageAsset.ImportIntent, Error>) -> Void)?

    PendingImageRecoveryHandoff(
      document: document, expectedDocumentEpoch: freshEpoch
    ).confirm(
      assetID: asset.id,
      captureIntent: { capturedIntentCallback = $0 },
      apply: { recoveredAsset, intent, completion in
        XCTAssertEqual(recoveredAsset.id, asset.id)
        appliedIntent = intent
        document.editorDidChangeState(
          BridgeEditorState(
            documentID: documentID, revision: 5, dirty: true,
            canUndo: true, canRedo: false, selectionAnchor: 1, selectionHead: 1))
        completion(nil)
      },
      snapshot: { completion in
        completion(
          .success(
            BridgeSnapshot(
              documentID: documentID, revision: 5, text: recoveredText,
              imageOwnership: BridgeImageOwnershipProof(
                documentID: documentID, revision: 5, raw: recoveredText,
                imageURIs: [asset.markdownURI]))))
      },
      completion: { completionError = $0 })
    try XCTUnwrap(capturedIntentCallback)(.success(freshIntent))

    XCTAssertNil(completionError)
    XCTAssertEqual(appliedIntent, freshIntent)
    let reopened = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let handedOff = try XCTUnwrap(reopened.assets.first)
    XCTAssertEqual(handedOff.insertion, .accepted)
    XCTAssertEqual(handedOff.importIntent, oldIntent.withRecoveryState(.requiresConfirmation))
    XCTAssertEqual(handedOff.recoveryIntent, freshIntent)
    XCTAssertEqual(handedOff.recoveryDisposition, .handedOff)
    XCTAssertTrue(store.discover().pendingImageSessions.isEmpty)
    let persisted = try XCTUnwrap(store.discover().drafts.first)
    XCTAssertEqual(persisted.data, Data([0xEF, 0xBB, 0xBF]) + Data(recoveredText.utf8))
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testSnapshotFailureKeepsOriginalDraftAndPendingAudit() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let freshEpoch = UUID()
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let oldIntent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 2,
      selectionAnchor: 9, selectionHead: 9, recoveryState: .active)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil, importIntent: oldIntent)
    let original = Data("正文\r\n".utf8)
    try store.write(
      RecoveryDraft(
        id: sessionID, revision: 2, data: original, sourceURL: nil,
        sourceFingerprint: nil))
    let discovery = store.discover()
    let document = try InkoraDocument(
      recoveryDraft: try XCTUnwrap(discovery.drafts.first),
      pendingImageRecovery: try XCTUnwrap(discovery.pendingImageSessions.first),
      recoveryStore: store)
    let freshIntent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: freshEpoch, revision: 2,
      selectionAnchor: 0, selectionHead: 0, recoveryState: .active)
    var completionError: Error?

    PendingImageRecoveryHandoff(
      document: document, expectedDocumentEpoch: freshEpoch
    ).confirm(
      assetID: asset.id,
      captureIntent: { $0(.success(freshIntent)) },
      apply: { _, _, completion in
        document.editorDidChangeState(
          BridgeEditorState(
            documentID: documentID, revision: 3, dirty: true,
            canUndo: true, canRedo: false))
        completion(nil)
      },
      snapshot: { $0(.failure(CocoaError(.fileWriteOutOfSpace))) },
      completion: { completionError = $0 })

    XCTAssertEqual((completionError as? CocoaError)?.code, .fileWriteOutOfSpace)
    let reopened = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let pending = try XCTUnwrap(reopened.assets.first)
    XCTAssertEqual(pending.insertion, .pending)
    XCTAssertEqual(pending.importIntent, oldIntent.withRecoveryState(.requiresConfirmation))
    XCTAssertEqual(pending.recoveryIntent, freshIntent)
    XCTAssertEqual(pending.recoveryDisposition, .pendingConfirmation)
    XCTAssertEqual(try XCTUnwrap(store.discover().drafts.first).data, original)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testCrossEpochConfirmationIsRejectedBeforeApplyAndKeepsEvidence() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil,
      importIntent: LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
        selectionAnchor: 0, selectionHead: 0, recoveryState: .active))
    let candidate = try XCTUnwrap(store.discover().pendingImageSessions.first)
    let document = try InkoraDocument(
      pendingImageRecovery: candidate, recoveryStore: store)
    var applied = false
    var completionError: Error?

    PendingImageRecoveryHandoff(
      document: document, expectedDocumentEpoch: UUID()
    ).confirm(
      assetID: asset.id,
      captureIntent: {
        $0(
          .success(
            LocalImageAsset.ImportIntent(
              documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
              selectionAnchor: 0, selectionHead: 0, recoveryState: .active)))
      },
      apply: { _, _, completion in
        applied = true
        completion(nil)
      },
      snapshot: { _ in XCTFail("A rejected epoch must not request a snapshot") },
      completion: { completionError = $0 })

    guard let bridgeError = completionError as? EditorBridgeError,
      case .staleRevision = bridgeError
    else {
      XCTFail("Expected stale revision, got \(String(describing: completionError))")
      return
    }
    XCTAssertFalse(applied)
    let pending = try XCTUnwrap(
      LocalImageStore(root: store.directory.appendingPathComponent("LocalImages"))
        .begin(documentID: documentID, sessionID: sessionID).assets.first)
    XCTAssertEqual(pending.insertion, .pending)
    XCTAssertNil(pending.recoveryIntent)
    XCTAssertEqual(pending.recoveryDisposition, .pendingConfirmation)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testManifestOnlyRecoveryCanSaveMarkdownAndSameImageSHA() async throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let epoch = UUID()
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let asset = try session.importBitmapPNG(
      png, preferredName: "恢复 图.png", documentURL: nil, authorizedDirectory: nil,
      importIntent: LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 0,
        selectionAnchor: 7, selectionHead: 3, recoveryState: .active))
    let candidate = try XCTUnwrap(store.discover().pendingImageSessions.first)
    var saveSnapshotText = ""
    var saveOwnerURIs: [String] = []
    let document = try InkoraDocument(
      pendingImageRecovery: candidate,
      recoveryStore: store,
      snapshotRequester: { completion in
        completion(
          .success(
            BridgeSnapshot(
              documentID: documentID, revision: 1, text: saveSnapshotText,
              imageOwnership: BridgeImageOwnershipProof(
                documentID: documentID, revision: 1, raw: saveSnapshotText,
                imageURIs: saveOwnerURIs))))
      })
    let draftText = "![](\(asset.markdownURI))\n"
    let freshIntent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: epoch, revision: 0,
      selectionAnchor: 0, selectionHead: 0, recoveryState: .active)
    var handoffError: Error?
    PendingImageRecoveryHandoff(document: document, expectedDocumentEpoch: epoch).confirm(
      assetID: asset.id,
      captureIntent: { $0(.success(freshIntent)) },
      apply: { _, _, completion in
        document.editorDidChangeState(
          BridgeEditorState(
            documentID: documentID, revision: 1, dirty: true,
            canUndo: true, canRedo: false))
        completion(nil)
      },
      snapshot: {
        $0(
          .success(
            BridgeSnapshot(
              documentID: documentID, revision: 1, text: draftText,
              imageOwnership: BridgeImageOwnershipProof(
                documentID: documentID, revision: 1, raw: draftText,
                imageURIs: [asset.markdownURI]))))
      },
      completion: { handoffError = $0 })
    XCTAssertNil(handoffError)

    let target = scratch.appendingPathComponent("Recovered.md")
    let plan = try XCTUnwrap(
      document.prepareLocalImagesForSave(
        documentURL: target, authorizedDirectory: scratch,
        snapshot: BridgeSnapshot(
          documentID: documentID, revision: 1, text: draftText,
          imageOwnership: BridgeImageOwnershipProof(
            documentID: documentID, revision: 1, raw: draftText,
            imageURIs: [asset.markdownURI]))))
    let targetURI = try XCTUnwrap(plan.items.first?.targetURI)
    saveSnapshotText = "![](\(targetURI))\n"
    saveOwnerURIs = [targetURI]
    document.configureImageSavePreparer { _, _, completion in
      completion(
        .success(
          DocumentImageSavePreparation(
            managedPlan: plan, sourceAuthorizedDirectory: nil,
            targetAuthorizedDirectory: scratch)))
    }

    let saveError = await save(document, to: target)

    XCTAssertNil(saveError)
    XCTAssertEqual(try String(contentsOf: target, encoding: .utf8), saveSnapshotText)
    let savedImage = scratch.appendingPathComponent("Recovered.assets/恢复 图.png")
    XCTAssertEqual(RecoveryFingerprint.hash(try Data(contentsOf: savedImage)), asset.sha256)
    XCTAssertTrue(try document.localImages().assets.isEmpty)
    XCTAssertTrue(store.discover().drafts.isEmpty)
    document.close()
  }

  func testExplicitAbandonRemovesOnlyPendingAssetsFromTheChosenSession() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let store = RecoveryStore(directory: scratch.appendingPathComponent("Recovery"))
    let sessionID = UUID()
    let documentID = "recovered-document"
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    let accepted = try session.importBitmapPNG(
      png, preferredName: "accepted.png", documentURL: nil, authorizedDirectory: nil)
    try session.markInsertionAccepted(assetID: accepted.id)
    let pending = try session.importBitmapPNG(
      png, preferredName: "pending.png", documentURL: nil, authorizedDirectory: nil,
      importIntent: LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
        selectionAnchor: 0, selectionHead: 0, recoveryState: .active))
    let candidate = try XCTUnwrap(store.discover().pendingImageSessions.first)

    try store.abandonImageRecovery(candidate)

    let reopened = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages")
    ).begin(documentID: documentID, sessionID: sessionID)
    XCTAssertEqual(reopened.assets.map(\.id), [accepted.id])
    XCTAssertEqual(try Data(contentsOf: accepted.storageURL), png)
    XCTAssertFalse(FileManager.default.fileExists(atPath: pending.storageURL.path))
    XCTAssertTrue(store.discover().pendingImageSessions.isEmpty)
    let receipt = try XCTUnwrap(
      JSONSerialization.jsonObject(
        with: Data(contentsOf: store.imageRecoveryReceiptURL(sessionID))) as? [String: Any])
    XCTAssertEqual(receipt["outcome"] as? String, "abandoned")
    XCTAssertEqual(receipt["documentID"] as? String, documentID)
    XCTAssertEqual(receipt["assetSHA256"] as? [String], [pending.sha256])
  }

  func testSchemaTwoRemainsReadableAndInvalidRecoveryAuditFailsClosed() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let root = scratch.appendingPathComponent("LocalImages")
    let sessionID = UUID()
    let documentID = "recovered-document"
    let session = try LocalImageStore(root: root).begin(
      documentID: documentID, sessionID: sessionID)
    let asset = try session.importBitmapPNG(
      png, documentURL: nil, authorizedDirectory: nil,
      importIntent: LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
        selectionAnchor: 0, selectionHead: 0, recoveryState: .active))
    let manifest = root.appendingPathComponent(
      "\(sessionID.uuidString.lowercased())/manifest.json")
    var schemaTwo = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any])
    schemaTwo["schema"] = 2
    var assets = try XCTUnwrap(schemaTwo["assets"] as? [[String: Any]])
    assets[0].removeValue(forKey: "recoveryIntent")
    assets[0].removeValue(forKey: "recoveryDisposition")
    schemaTwo["assets"] = assets
    try JSONSerialization.data(withJSONObject: schemaTwo).write(to: manifest, options: .atomic)
    XCTAssertEqual(
      try LocalImageStore(root: root).begin(
        documentID: documentID, sessionID: sessionID
      ).assets.first?.id,
      asset.id)

    let reopened = try LocalImageStore(root: root).begin(
      documentID: documentID, sessionID: sessionID)
    let freshIntent = LocalImageAsset.ImportIntent(
      documentID: documentID, sessionID: sessionID, documentEpoch: UUID(), revision: 1,
      selectionAnchor: 0, selectionHead: 0, recoveryState: .active)
    try reopened.beginRecoveredInsertion(assetID: asset.id, freshIntent: freshIntent)
    var invalid = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any])
    var invalidAssets = try XCTUnwrap(invalid["assets"] as? [[String: Any]])
    var recoveryIntent = try XCTUnwrap(invalidAssets[0]["recoveryIntent"] as? [String: Any])
    recoveryIntent["documentID"] = "other-document"
    invalidAssets[0]["recoveryIntent"] = recoveryIntent
    invalid["assets"] = invalidAssets
    let invalidBytes = try JSONSerialization.data(withJSONObject: invalid)
    try invalidBytes.write(to: manifest, options: .atomic)

    XCTAssertThrowsError(
      try LocalImageStore(root: root).begin(
        documentID: documentID, sessionID: sessionID)
    ) { XCTAssertEqual($0 as? LocalImageError, .corruptManifest) }
    XCTAssertEqual(try Data(contentsOf: manifest), invalidBytes)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(
      "InkoraPendingRecovery-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func save(_ document: InkoraDocument, to url: URL) async -> Error? {
    await withCheckedContinuation { continuation in
      document.save(
        to: url,
        ofType: "net.daringfireball.markdown",
        for: .saveAsOperation
      ) { error in
        continuation.resume(returning: error)
      }
    }
  }
}

extension LocalImageAsset.ImportIntent {
  fileprivate func withRecoveryState(_ state: RecoveryState) -> Self {
    Self(
      documentID: documentID, sessionID: sessionID, documentEpoch: documentEpoch,
      revision: revision, selectionAnchor: selectionAnchor, selectionHead: selectionHead,
      recoveryState: state)
  }
}

@MainActor
private final class ScriptedRecoveryPresenter: RecoveryReviewPresenting {
  private let pendingChoice: PendingImageRecoveryChoice
  private let beforePendingChoice: () -> Void
  private(set) var pendingReviews: [UUID] = []
  private(set) var presentedErrors: [Error] = []

  init(
    pendingChoice: PendingImageRecoveryChoice,
    beforePendingChoice: @escaping () -> Void = {}
  ) {
    self.pendingChoice = pendingChoice
    self.beforePendingChoice = beforePendingChoice
  }

  func showCorruptRecoveryWarning() {}

  func present(_ error: Error) {
    presentedErrors.append(error)
  }

  func choosePendingImageRecovery(
    _ candidate: LocalImageStore.RecoveryCandidate,
    matchingDraft: RecoveryDraft?
  ) -> PendingImageRecoveryChoice {
    pendingReviews.append(candidate.sessionID)
    beforePendingChoice()
    return pendingChoice
  }

  func chooseDraftRecovery(_ draft: RecoveryDraft) -> DraftRecoveryChoice { .later }
}
