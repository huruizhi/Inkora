import AppKit

/// Wraps NSDocumentController's recent-document list so menu building,
/// entry removal, and restore policy stay unit-testable without touching
/// the process-wide shared file list.
@MainActor
protocol RecentDocumentListManaging: AnyObject {
  var recentDocumentURLs: [URL] { get }
  func noteNewRecentDocumentURL(_ url: URL)
  func clearRecentDocuments()
}

@MainActor
final class DocumentControllerRecentDocumentList: RecentDocumentListManaging {
  var recentDocumentURLs: [URL] {
    NSDocumentController.shared.recentDocumentURLs
  }

  func noteNewRecentDocumentURL(_ url: URL) {
    NSDocumentController.shared.noteNewRecentDocumentURL(url)
  }

  func clearRecentDocuments() {
    NSDocumentController.shared.clearRecentDocuments(nil)
  }
}

@MainActor
enum RecentDocumentList {
  /// Removes `url` while preserving the order of the remaining entries.
  /// NSDocumentController has no single-entry removal API, so removal is a
  /// clear followed by re-noting the other URLs in reverse order.
  static func remove(_ url: URL, from list: RecentDocumentListManaging) {
    // NSDocumentController stores recent entries as canonicalized bookmarks
    // (e.g. /private/var instead of the /var form the caller may hold), and
    // URL.resolvingSymlinksInPath does not resolve those system symlinks.
    // realpath matches AppKit's canonical form for existing files and falls
    // back to exact comparison otherwise.
    let target = canonicalForm(url)
    let urls = list.recentDocumentURLs
    guard urls.contains(where: { canonicalForm($0) == target }) else { return }
    list.clearRecentDocuments()
    for remaining in urls.filter({ canonicalForm($0) != target }).reversed() {
      list.noteNewRecentDocumentURL(remaining)
    }
  }

  private static func canonicalForm(_ url: URL) -> URL {
    url.path.withCString { path in
      let buffer = UnsafeMutablePointer<CChar>.allocate(capacity: Int(PATH_MAX))
      defer { buffer.deallocate() }
      guard realpath(path, buffer) != nil else { return url }
      return URL(fileURLWithPath: String(cString: buffer))
    }
  }

  /// A recent entry whose file was deleted or moved away fails the open
  /// with one of these errors; such entries get pruned from the list.
  static func isMissingFileError(_ error: Error) -> Bool {
    let nsError = error as NSError
    guard nsError.domain == NSCocoaErrorDomain else { return false }
    switch nsError.code {
    case NSFileReadNoSuchFileError:
      return true
    case NSFileReadUnknownError:
      guard
        let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError,
        underlying.domain == NSPOSIXErrorDomain,
        underlying.code == Int(ENOENT)
      else { return false }
      return true
    default:
      return false
    }
  }
}
