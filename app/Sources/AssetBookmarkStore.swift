import Foundation

enum AssetDirectoryAccess: String, Codable, Equatable {
  case readOnly
  case readWrite
}

struct AssetDirectoryBookmark: Codable, Equatable {
  let role: String
  let originalURL: URL
  let access: AssetDirectoryAccess
  var bookmark: Data
}

/// Versioned, file-backed directory grants for local image resources. The
/// injected codec keeps stale/recovery behavior testable without system panels.
final class AssetBookmarkStore {
  typealias Creator = (URL, AssetDirectoryAccess) throws -> Data
  typealias Resolver = (Data) throws -> (url: URL, stale: Bool)

  private struct Manifest: Codable {
    let schema: Int
    var records: [AssetDirectoryBookmark]
  }

  private let url: URL
  private let createBookmark: Creator
  private let resolveBookmark: Resolver

  init(
    url: URL,
    createBookmark: @escaping Creator = AssetBookmarkStore.systemCreate,
    resolveBookmark: @escaping Resolver = AssetBookmarkStore.systemResolve
  ) {
    self.url = url
    self.createBookmark = createBookmark
    self.resolveBookmark = resolveBookmark
  }

  func remember(_ directory: URL, role: String, access: AssetDirectoryAccess) throws {
    guard !role.isEmpty, directory.isFileURL else { throw LocalImageError.unsafePath }
    let bookmark = try createBookmark(directory, access)
    var manifest = try load()
    manifest.records.removeAll { $0.role == role }
    manifest.records.append(
      .init(
        role: role, originalURL: directory.standardizedFileURL,
        access: access, bookmark: bookmark))
    try persist(manifest)
  }

  func resolve(role: String) throws -> URL? {
    var manifest = try load()
    guard let index = manifest.records.firstIndex(where: { $0.role == role }) else { return nil }
    do {
      let resolved = try resolveBookmark(manifest.records[index].bookmark)
      guard resolved.url.isFileURL else { throw LocalImageError.unsafePath }
      if resolved.stale {
        manifest.records[index].bookmark = try createBookmark(
          resolved.url, manifest.records[index].access)
        try persist(manifest)
      }
      return resolved.url
    } catch {
      // Preserve the record for user-driven reauthorization; never reinterpret
      // an unresolved bookmark as a missing image.
      throw LocalImageError.unauthorizedDirectory
    }
  }

  private func load() throws -> Manifest {
    guard FileManager.default.fileExists(atPath: url.path) else {
      return Manifest(schema: 1, records: [])
    }
    do {
      let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: url))
      guard manifest.schema == 1 else { throw LocalImageError.corruptManifest }
      return manifest
    } catch let error as LocalImageError {
      throw error
    } catch {
      throw LocalImageError.corruptManifest
    }
  }

  private func persist(_ manifest: Manifest) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try JSONEncoder().encode(manifest).write(to: url, options: .atomic)
  }

  private static func systemCreate(_ url: URL, _ access: AssetDirectoryAccess) throws -> Data {
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    var options: URL.BookmarkCreationOptions = [.withSecurityScope]
    if access == .readOnly { options.insert(.securityScopeAllowOnlyReadAccess) }
    return try url.bookmarkData(options: options)
  }

  private static func systemResolve(_ data: Data) throws -> (url: URL, stale: Bool) {
    var stale = false
    let url = try URL(
      resolvingBookmarkData: data, options: [.withSecurityScope], relativeTo: nil,
      bookmarkDataIsStale: &stale)
    return (url, stale)
  }
}
