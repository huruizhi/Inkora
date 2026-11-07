import Foundation

/// Persists the last successfully opened document as an app-scoped
/// security bookmark so a sandboxed relaunch keeps file access.
@MainActor
final class DocumentOpenHistory {
  private static let bookmarkKey = "LastOpenedDocumentBookmark"

  static let shared = DocumentOpenHistory()

  private var defaults: UserDefaults?

  init() {}

  init(defaults: UserDefaults) {
    self.defaults = defaults
  }

  /// Installs the backing storage. Until configured the shared instance is
  /// inert, so documents created by unit tests never touch real defaults.
  func configure(defaults: UserDefaults) {
    self.defaults = defaults
  }

  func noteDocumentOpened(_ url: URL) {
    guard let defaults, let bookmark = makeBookmark(for: url) else { return }
    defaults.set(bookmark, forKey: Self.bookmarkKey)
  }

  func resolveLastOpenedDocumentURL() -> URL? {
    guard let defaults, let data = defaults.data(forKey: Self.bookmarkKey) else {
      return nil
    }
    var scopedStale = false
    var plainStale = false
    // Security-scoped bookmarks resolve with the scope option; the plain
    // fallback covers URLs inside the app container stored without scope.
    let resolved =
      (try? URL(
        resolvingBookmarkData: data,
        options: [.withSecurityScope],
        relativeTo: nil,
        bookmarkDataIsStale: &scopedStale
      ))
      ?? (try? URL(
        resolvingBookmarkData: data,
        options: [],
        relativeTo: nil,
        bookmarkDataIsStale: &plainStale
      ))
    guard let url = resolved else { return nil }
    if scopedStale || plainStale {
      // The file moved but the bookmark tracked it; refresh the stored
      // bookmark so future launches resolve without the stale flag.
      noteDocumentOpened(url)
    }
    return url
  }

  func clear() {
    defaults?.removeObject(forKey: Self.bookmarkKey)
  }

  private func makeBookmark(for url: URL) -> Data? {
    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped {
        url.stopAccessingSecurityScopedResource()
      }
    }
    return (try? url.bookmarkData(options: .withSecurityScope))
      ?? (try? url.bookmarkData())
  }
}

/// Notes opened documents into NSDocumentController's Open Recent list.
/// Configured only by the app delegate; inert when unit tests instantiate
/// documents without an app lifecycle, so tests never touch the real list.
@MainActor
final class RecentDocumentNoter {
  static let shared = RecentDocumentNoter()

  private var list: RecentDocumentListManaging?

  func configure(list: RecentDocumentListManaging) {
    self.list = list
  }

  func noteDocumentOpened(_ url: URL) {
    list?.noteNewRecentDocumentURL(url)
  }
}

/// Resolves the launch-state backing storage. UI tests inject an isolated
/// defaults suite via `-INKTestDefaultsSuite` so launch restoration never
/// reads or writes the app's real preferences.
enum LaunchDefaultsResolver {
  static let suiteArgument = "-INKTestDefaultsSuite"

  static func defaults(arguments: [String]) -> UserDefaults {
    guard
      let index = arguments.firstIndex(of: suiteArgument),
      arguments.indices.contains(index + 1)
    else { return .standard }
    return UserDefaults(suiteName: arguments[index + 1]) ?? .standard
  }
}
