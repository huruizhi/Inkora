import AppKit

/// Restores the last successfully opened document at launch. Restores only
/// that single document, never autosaves or overwrites files, and falls
/// back to an untitled document when the stored file is gone or unreadable.
@MainActor
final class LastDocumentRestoreController {
  typealias DocumentOpener = @MainActor (URL, @escaping (Error?) -> Void) -> Void

  private let history: DocumentOpenHistory
  private let documentsAreOpen: () -> Bool
  private let openDocument: DocumentOpener
  private let openUntitledDocument: () -> Void
  private let presentError: (Error) -> Void
  init(
    history: DocumentOpenHistory,
    documentsAreOpen: @escaping () -> Bool,
    openDocument: @escaping DocumentOpener,
    openUntitledDocument: @escaping () -> Void,
    presentError: @escaping (Error) -> Void
  ) {
    self.history = history
    self.documentsAreOpen = documentsAreOpen
    self.openDocument = openDocument
    self.openUntitledDocument = openUntitledDocument
    self.presentError = presentError
  }

  convenience init(
    history: DocumentOpenHistory,
    documentsAreOpen: @escaping () -> Bool,
    openDocument: @escaping DocumentOpener,
    openUntitledDocument: @escaping () -> Void
  ) {
    self.init(
      history: history,
      documentsAreOpen: documentsAreOpen,
      openDocument: openDocument,
      openUntitledDocument: openUntitledDocument,
      presentError: { _ = NSApp.presentError($0) }
    )
  }

  /// Returns whether a restore was started; the caller should then skip
  /// creating the default untitled document.
  @discardableResult
  func restoreLastDocumentIfNeeded() -> Bool {
    guard !documentsAreOpen() else { return false }
    guard let url = history.resolveLastOpenedDocumentURL() else { return false }
    guard isReachable(url) else {
      // The file was deleted or moved away: drop the stale state silently
      // and keep the normal untitled launch.
      history.clear()
      return false
    }
    // Keep the sandbox grant alive until the asynchronous open completes.
    let scoped = url.startAccessingSecurityScopedResource()
    openDocument(url) { [weak self] error in
      defer { if scoped { url.stopAccessingSecurityScopedResource() } }
      self?.handleRestoreResult(error)
    }
    return true
  }

  private func handleRestoreResult(_ error: Error?) {
    guard let error else { return }
    history.clear()
    if !RecentDocumentList.isMissingFileError(error) {
      // The file exists but could not be read (e.g. invalid UTF-8); explain
      // once instead of silently swapping in an untitled document.
      presentError(error)
    }
    if !documentsAreOpen() {
      openUntitledDocument()
    }
  }

  private func isReachable(_ url: URL) -> Bool {
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped {
        url.stopAccessingSecurityScopedResource()
      }
    }
    return FileManager.default.fileExists(atPath: url.path)
  }
}
