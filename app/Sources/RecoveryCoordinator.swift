import AppKit

enum PendingImageRecoveryChoice {
  case recover
  case later
  case abandon
}

enum DraftRecoveryChoice {
  case recover
  case abandon
  case saveAs
  case later
}

@MainActor
protocol RecoveryReviewPresenting: AnyObject {
  func showCorruptRecoveryWarning()
  func present(_ error: Error)
  func choosePendingImageRecovery(
    _ candidate: LocalImageStore.RecoveryCandidate,
    matchingDraft: RecoveryDraft?
  ) -> PendingImageRecoveryChoice
  func chooseDraftRecovery(_ draft: RecoveryDraft) -> DraftRecoveryChoice
}

@MainActor
private final class AppKitRecoveryReviewPresenter: RecoveryReviewPresenting {
  func showCorruptRecoveryWarning() {
    let alert = NSAlert()
    alert.messageText = "部分恢复草稿已损坏"
    alert.informativeText = "无法验证的草稿不会被加载，原始草稿仍保留在恢复目录中。"
    alert.runModal()
  }

  func present(_ error: Error) {
    NSApplication.shared.presentError(error)
  }

  func choosePendingImageRecovery(
    _ candidate: LocalImageStore.RecoveryCandidate,
    matchingDraft: RecoveryDraft?
  ) -> PendingImageRecoveryChoice {
    let alert = NSAlert()
    alert.messageText = "发现未完成的图片导入"
    let body =
      matchingDraft == nil
      ? "没有找到可验证的正文草稿。恢复后会打开空白的“仅恢复图片草稿”，不会重放旧选区。"
      : "已找到同一会话的正文草稿，将逐字节恢复正文。"
    alert.informativeText =
      "会话中有 \(candidate.assets.count) 个已验证图片。\(body) 打开后仍需在编辑器中明确确认，Inkora 才会按当前光标插入。"
    alert.addButton(withTitle: "恢复图片草稿")
    alert.addButton(withTitle: "稍后")
    alert.addButton(withTitle: "放弃")
    alert.window.setAccessibilityIdentifier("PendingImageRecoveryDialog")
    for (index, button) in alert.buttons.enumerated() {
      button.setAccessibilityIdentifier("PendingImageRecoveryButton\(index)")
    }
    switch alert.runModal() {
    case .alertFirstButtonReturn: return .recover
    case .alertThirdButtonReturn: return .abandon
    default: return .later
    }
  }

  func chooseDraftRecovery(_ draft: RecoveryDraft) -> DraftRecoveryChoice {
    let alert = NSAlert()
    alert.messageText =
      draft.sourceChanged
      ? "恢复草稿：\(DocumentFileState.externalChange.localizedDescription)" : "发现未保存的恢复草稿"
    alert.informativeText =
      "\(draft.sourceURL?.lastPathComponent ?? "未命名文档")：恢复为未命名副本并保留为未保存状态。源文件不会被自动覆盖。"
    alert.addButton(withTitle: "恢复")
    alert.addButton(withTitle: "放弃草稿")
    alert.addButton(withTitle: "另存为…")
    alert.window.setAccessibilityIdentifier("RecoveryDialog")
    for (index, button) in alert.buttons.enumerated() {
      button.setAccessibilityIdentifier("RecoveryButton\(index)")
    }
    switch alert.runModal() {
    case .alertFirstButtonReturn: return .recover
    case .alertSecondButtonReturn: return .abandon
    case .alertThirdButtonReturn: return .saveAs
    default: return .later
    }
  }
}

@MainActor
final class RecoveryCoordinator {
  typealias StoreProvider = @MainActor () -> RecoveryStore?
  typealias DocumentOpener = @MainActor (_ document: InkoraDocument, _ saveAs: Bool) -> Void

  static let shared = RecoveryCoordinator()

  private let storeProvider: StoreProvider
  private let presenter: any RecoveryReviewPresenting
  private let documentOpener: DocumentOpener

  init(
    storeProvider: @escaping StoreProvider = RecoveryStore.applicationStore,
    presenter: any RecoveryReviewPresenting = AppKitRecoveryReviewPresenter(),
    documentOpener: @escaping DocumentOpener = RecoveryCoordinator.openDocument
  ) {
    self.storeProvider = storeProvider
    self.presenter = presenter
    self.documentOpener = documentOpener
  }

  func reviewDrafts() {
    guard let store = storeProvider() else { return }
    let found = store.discover()
    if found.corruptCount > 0 || !found.rejectedImageSessions.isEmpty {
      presenter.showCorruptRecoveryWarning()
    }

    let draftsByID = Dictionary(uniqueKeysWithValues: found.drafts.map { ($0.id, $0) })
    var reviewedDrafts = Set<UUID>()
    for candidate in found.pendingImageSessions {
      let matchingDraft = draftsByID[candidate.sessionID]
      if matchingDraft != nil { reviewedDrafts.insert(candidate.sessionID) }
      do {
        switch presenter.choosePendingImageRecovery(candidate, matchingDraft: matchingDraft) {
        case .recover:
          let document: InkoraDocument
          if let matchingDraft {
            document = try InkoraDocument(
              recoveryDraft: matchingDraft,
              pendingImageRecovery: candidate,
              recoveryStore: store)
          } else {
            document = try InkoraDocument(
              pendingImageRecovery: candidate,
              recoveryStore: store)
          }
          documentOpener(document, false)
        case .later:
          break
        case .abandon:
          try store.abandonImageRecovery(candidate)
          if matchingDraft != nil { try store.retire(candidate.sessionID) }
        }
      } catch {
        presenter.present(error)
      }
    }

    for draft in found.drafts where !reviewedDrafts.contains(draft.id) {
      do {
        switch presenter.chooseDraftRecovery(draft) {
        case .recover:
          documentOpener(try InkoraDocument(recoveryDraft: draft, recoveryStore: store), false)
        case .saveAs:
          documentOpener(try InkoraDocument(recoveryDraft: draft, recoveryStore: store), true)
        case .abandon:
          try store.retire(draft.id)
        case .later:
          break
        }
      } catch {
        presenter.present(error)
      }
    }
  }

  private static func openDocument(_ document: InkoraDocument, saveAs: Bool) {
    NSDocumentController.shared.addDocument(document)
    document.makeWindowControllers()
    document.showWindows()
    if saveAs { document.saveAs(nil) }
  }
}

@MainActor
final class PendingImageRecoveryHandoff {
  typealias CaptureIntent = (
    @escaping (Result<LocalImageAsset.ImportIntent, Error>) -> Void
  ) -> Void
  typealias Apply = (
    _ asset: LocalImageAsset,
    _ intent: LocalImageAsset.ImportIntent,
    _ completion: @escaping (Error?) -> Void
  ) -> Void
  typealias Snapshot = (
    @escaping (Result<BridgeSnapshot, Error>) -> Void
  ) -> Void

  private let document: InkoraDocument
  private let expectedDocumentEpoch: UUID

  init(document: InkoraDocument, expectedDocumentEpoch: UUID) {
    self.document = document
    self.expectedDocumentEpoch = expectedDocumentEpoch
  }

  func confirm(
    assetID: UUID,
    captureIntent: @escaping CaptureIntent,
    apply: @escaping Apply,
    snapshot: @escaping Snapshot,
    completion: @escaping (Error?) -> Void
  ) {
    captureIntent { [self] result in
      do {
        let intent = try result.get()
        guard intent.documentEpoch == expectedDocumentEpoch else {
          throw EditorBridgeError.staleRevision
        }
        let session = try document.localImages()
        let asset = try session.beginRecoveredInsertion(
          assetID: assetID, freshIntent: intent)
        apply(asset, intent) { [self] error in
          if let error {
            try? session.cancelRecoveredInsertion(assetID: assetID)
            completion(error)
            return
          }
          snapshot { [self] result in
            do {
              try document.persistRecoveredImageHandoff(
                result.get(), assetID: assetID, freshIntent: intent)
              completion(nil)
            } catch {
              try? session.cancelRecoveredInsertion(assetID: assetID)
              completion(error)
            }
          }
        }
      } catch {
        completion(error)
      }
    }
  }
}
