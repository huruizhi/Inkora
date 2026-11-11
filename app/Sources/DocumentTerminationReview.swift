import AppKit

/// Both ordinary quit and Sparkle's Apple quit event enter this same barrier.
@MainActor
final class DocumentTerminationReview: NSObject {
  private let gate = TerminationReviewGate()
  private var reviewCompletion: ((Bool) -> Void)?
  var inProgress: Bool { gate.inProgress }

  func begin(documents: [NSDocument], completion: @escaping (Bool) -> Void) {
    let preparations: [TerminationReviewGate.Prepare] = documents.compactMap { document in
      guard let document = document as? InkoraDocument else { return nil }
      return { complete in
        document.prepareForClose { error in
          if let error { document.presentError(error) }
          complete(error == nil)
        }
      }
    }
    gate.begin(
      preparations: preparations,
      review: { [self] complete in
        reviewCompletion = complete
        NSDocumentController.shared.reviewUnsavedDocuments(
          withAlertTitle: "Quit Inkora?", cancellable: true, delegate: self,
          didReviewAllSelector: #selector(didReviewDocuments(_:didReviewAll:contextInfo:)),
          contextInfo: nil)
      },
      finishRecovery: {
        for document in documents {
          (document as? InkoraDocument)?.finishRecoveryForNormalTermination()
        }
      }, reply: completion)
  }

  @objc private func didReviewDocuments(
    _ controller: NSDocumentController, didReviewAll: Bool,
    contextInfo: UnsafeMutableRawPointer?
  ) {
    let complete = reviewCompletion
    reviewCompletion = nil
    complete?(didReviewAll)
  }
}
