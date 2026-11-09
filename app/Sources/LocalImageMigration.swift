import CryptoKit
import Darwin
import Foundation

struct LocalImageMigrationPlan: Equatable {
  struct Item: Equatable, Codable {
    let uri: String
    let sourceURL: URL
    let targetURL: URL
    let sha256: String
    let reused: Bool
  }

  let id: UUID
  let markdown: String
  let sourceDocumentURL: URL
  let targetDocumentURL: URL
  let sourceAuthorizedDirectory: URL
  let targetAuthorizedDirectory: URL
  let items: [Item]
}

/// Copies resources for Save As without rewriting a single Markdown byte.
/// A durable journal is retained after publication until NSDocument confirms
/// the Markdown commit, so a crash or failed write is an explicit orphan state.
final class LocalImageMigrationCoordinator {
  struct RecoveryRecord: Equatable {
    enum CurrentState: String { case prepared, awaitingMarkdown, markdownMatches, invalid }
    let id: UUID
    let journalState: String
    let currentState: CurrentState
    let targetDocumentURL: URL
  }

  struct RecoveryDiscovery: Equatable {
    let records: [RecoveryRecord]
    let rejected: [URL]
  }

  private struct Journal: Codable {
    let schema: Int
    let id: UUID
    let state: String
    let markdownSHA256: String
    let sourceDocumentURL: URL
    let targetDocumentURL: URL
    let sourceAuthorizedDirectory: URL
    let targetAuthorizedDirectory: URL
    let items: [LocalImageMigrationPlan.Item]
  }

  private let journalRoot: URL

  init(journalRoot: URL) {
    self.journalRoot = journalRoot.standardizedFileURL
  }

  static func localImageURIs(in ownerURIs: [String]) -> [String] {
    ownerURIs.filter(isLocalRelativeURI)
  }

  static func percentEncodedFilePath(forLocalImageURI uri: String) -> String? {
    guard isLocalRelativeURI(uri), let components = URLComponents(string: uri),
      !components.percentEncodedPath.isEmpty
    else { return nil }
    return components.percentEncodedPath
  }

  static func resolveExistingImage(
    uri: String,
    documentURL: URL,
    authorizedDirectory: URL
  ) throws -> URL {
    guard isLocalRelativeURI(uri) else { throw LocalImageError.unsafePath }
    return try resolve(
      uri: uri, relativeTo: documentURL.deletingLastPathComponent(),
      authorizedDirectory: authorizedDirectory, mustExist: true)
  }

  func prepare(
    markdown: String,
    ownerURIs: [String],
    sourceDocumentURL: URL,
    targetDocumentURL: URL,
    sourceAuthorizedDirectory: URL,
    targetAuthorizedDirectory: URL,
    excludingURIs: Set<String> = []
  ) throws -> LocalImageMigrationPlan {
    let id = UUID()
    var items: [LocalImageMigrationPlan.Item] = []
    var seen = Set<String>()
    for uri in ownerURIs where seen.insert(uri).inserted {
      if excludingURIs.contains(uri) { continue }
      guard Self.isLocalRelativeURI(uri) else { continue }
      let source = try Self.resolve(
        uri: uri, relativeTo: sourceDocumentURL.deletingLastPathComponent(),
        authorizedDirectory: sourceAuthorizedDirectory, mustExist: true)
      let target = try Self.resolve(
        uri: uri, relativeTo: targetDocumentURL.deletingLastPathComponent(),
        authorizedDirectory: targetAuthorizedDirectory, mustExist: false)
      if source.standardizedFileURL == target.standardizedFileURL { continue }
      let sourceBytes = try Self.readRegularFile(source)
      _ = try LocalImageSession.inspectExternalFile(source)
      let checksum = Self.sha256(sourceBytes)
      var reused = false
      if FileManager.default.fileExists(atPath: target.path) {
        let targetBytes = try Self.readRegularFile(target)
        guard Self.sha256(targetBytes) == checksum else { throw LocalImageError.targetConflict }
        reused = true
      }
      items.append(
        .init(
          uri: uri, sourceURL: source, targetURL: target, sha256: checksum, reused: reused))
    }
    let plan = LocalImageMigrationPlan(
      id: id, markdown: markdown,
      sourceDocumentURL: sourceDocumentURL, targetDocumentURL: targetDocumentURL,
      sourceAuthorizedDirectory: sourceAuthorizedDirectory.standardizedFileURL,
      targetAuthorizedDirectory: targetAuthorizedDirectory.standardizedFileURL,
      items: items)
    try writeJournal(plan, state: "prepared")
    return plan
  }

  func publish(_ plan: LocalImageMigrationPlan) throws {
    let staging = plan.targetAuthorizedDirectory.appendingPathComponent(
      ".inkora-image-staging-\(plan.id.uuidString.lowercased())", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: false)
      defer { try? FileManager.default.removeItem(at: staging) }
      for (index, item) in plan.items.enumerated() {
        let sourceBytes = try Self.readRegularFile(item.sourceURL)
        guard Self.sha256(sourceBytes) == item.sha256 else {
          throw LocalImageError.checksumMismatch
        }
        if item.reused {
          guard Self.sha256(try Self.readRegularFile(item.targetURL)) == item.sha256 else {
            throw LocalImageError.targetConflict
          }
          continue
        }
        let staged = staging.appendingPathComponent("\(index)-\(UUID().uuidString)")
        try sourceBytes.write(to: staged, options: .atomic)
        guard Self.sha256(try Self.readRegularFile(staged)) == item.sha256 else {
          throw LocalImageError.checksumMismatch
        }
        try FileManager.default.createDirectory(
          at: item.targetURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: item.targetURL.path) {
          guard Self.sha256(try Self.readRegularFile(item.targetURL)) == item.sha256 else {
            throw LocalImageError.targetConflict
          }
        } else {
          try FileManager.default.moveItem(at: staged, to: item.targetURL)
        }
        guard Self.sha256(try Self.readRegularFile(item.targetURL)) == item.sha256 else {
          throw LocalImageError.checksumMismatch
        }
      }
      try writeJournal(plan, state: "published-awaiting-markdown")
    } catch {
      try? writeJournal(plan, state: "failed-conservative")
      throw error
    }
  }

  func confirm(_ plan: LocalImageMigrationPlan) throws {
    let url = journalURL(plan.id)
    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }

  func discoverRecovery() -> RecoveryDiscovery {
    guard
      let urls = try? FileManager.default.contentsOfDirectory(
        at: journalRoot, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey],
        options: [.skipsHiddenFiles])
    else { return RecoveryDiscovery(records: [], rejected: []) }
    var records: [RecoveryRecord] = []
    var rejected: [URL] = []
    for url in urls.sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
    where url.pathExtension == "json" {
      do {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else {
          throw LocalImageError.unsafePath
        }
        let journal = try JSONDecoder().decode(Journal.self, from: Self.readRegularFile(url))
        guard journal.schema == 2,
          url.deletingPathExtension().lastPathComponent == journal.id.uuidString.lowercased(),
          ["prepared", "published-awaiting-markdown", "failed-conservative"].contains(
            journal.state)
        else { throw LocalImageError.corruptManifest }
        try Self.validateJournalPaths(journal)
        let targetsMatch = try journal.items.allSatisfy { item in
          guard FileManager.default.fileExists(atPath: item.targetURL.path) else { return false }
          return Self.sha256(try Self.readRegularFile(item.targetURL)) == item.sha256
        }
        let markdownMatches: Bool
        if FileManager.default.fileExists(atPath: journal.targetDocumentURL.path) {
          markdownMatches =
            Self.sha256(try Self.readRegularMarkdown(journal.targetDocumentURL))
            == journal.markdownSHA256
        } else {
          markdownMatches = false
        }
        let current: RecoveryRecord.CurrentState
        if markdownMatches && targetsMatch {
          current = .markdownMatches
        } else if journal.state == "prepared" && !targetsMatch {
          current = .prepared
        } else {
          current = .awaitingMarkdown
        }
        records.append(
          RecoveryRecord(
            id: journal.id, journalState: journal.state, currentState: current,
            targetDocumentURL: journal.targetDocumentURL))
      } catch {
        rejected.append(url)
      }
    }
    return RecoveryDiscovery(records: records, rejected: rejected)
  }

  private func writeJournal(_ plan: LocalImageMigrationPlan, state: String) throws {
    try FileManager.default.createDirectory(at: journalRoot, withIntermediateDirectories: true)
    let journal = Journal(
      schema: 2, id: plan.id, state: state,
      markdownSHA256: Self.sha256(Data(plan.markdown.utf8)),
      sourceDocumentURL: plan.sourceDocumentURL,
      targetDocumentURL: plan.targetDocumentURL,
      sourceAuthorizedDirectory: plan.sourceAuthorizedDirectory,
      targetAuthorizedDirectory: plan.targetAuthorizedDirectory,
      items: plan.items)
    try JSONEncoder().encode(journal).write(to: journalURL(plan.id), options: .atomic)
  }

  private func journalURL(_ id: UUID) -> URL {
    journalRoot.appendingPathComponent("\(id.uuidString.lowercased()).json")
  }

  private static func validateJournalPaths(_ journal: Journal) throws {
    let sourceGrant = journal.sourceAuthorizedDirectory.standardizedFileURL
    let targetGrant = journal.targetAuthorizedDirectory.standardizedFileURL
    guard isInside(journal.sourceDocumentURL, sourceGrant),
      isInside(journal.targetDocumentURL, targetGrant),
      journal.items.allSatisfy({
        isInside($0.sourceURL, sourceGrant) && isInside($0.targetURL, targetGrant)
      })
    else { throw LocalImageError.unauthorizedDirectory }
    for item in journal.items {
      guard item.sourceURL.resolvingSymlinksInPath() == item.sourceURL.standardizedFileURL else {
        throw LocalImageError.unsafePath
      }
      if FileManager.default.fileExists(atPath: item.targetURL.path),
        item.targetURL.resolvingSymlinksInPath() != item.targetURL.standardizedFileURL
      {
        throw LocalImageError.unsafePath
      }
      guard Self.sha256(try Self.readRegularFile(item.sourceURL)) == item.sha256 else {
        throw LocalImageError.checksumMismatch
      }
    }
  }

  private static func isInside(_ url: URL, _ root: URL) -> Bool {
    let path = url.standardizedFileURL.path
    return path == root.path || path.hasPrefix(root.path + "/")
  }

  private static func readRegularMarkdown(_ url: URL) throws -> Data {
    let descriptor = open(url.path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw LocalImageError.invalidSource }
    defer { close(descriptor) }
    var information = stat()
    guard fstat(descriptor, &information) == 0,
      (information.st_mode & S_IFMT) == S_IFREG,
      information.st_size >= 0, information.st_size <= 64 * 1024 * 1024
    else { throw LocalImageError.invalidSource }
    var data = Data(count: Int(information.st_size))
    let count = data.withUnsafeMutableBytes { bytes -> Int in
      guard let base = bytes.baseAddress else { return 0 }
      var offset = 0
      while offset < bytes.count {
        let amount = Darwin.read(descriptor, base.advanced(by: offset), bytes.count - offset)
        if amount <= 0 { return -1 }
        offset += amount
      }
      return offset
    }
    guard count == data.count else { throw LocalImageError.invalidSource }
    return data
  }

  private static func isLocalRelativeURI(_ uri: String) -> Bool {
    guard !uri.isEmpty, !uri.hasPrefix("/"), !uri.hasPrefix("#"),
      !uri.lowercased().hasPrefix("inkora-draft:")
    else { return false }
    guard let components = URLComponents(string: uri) else { return false }
    return components.scheme == nil && components.host == nil
  }

  private static func resolve(
    uri: String,
    relativeTo directory: URL,
    authorizedDirectory: URL,
    mustExist: Bool
  ) throws -> URL {
    guard let encodedPath = percentEncodedFilePath(forLocalImageURI: uri)
    else { throw LocalImageError.unsafePath }
    let grant = authorizedDirectory.standardizedFileURL
    var target = directory.standardizedFileURL
    for encodedComponent in encodedPath.split(
      separator: "/", omittingEmptySubsequences: false)
    {
      guard !encodedComponent.isEmpty,
        let component = String(encodedComponent).removingPercentEncoding,
        !component.isEmpty, !component.contains("/"), !component.contains("\\"),
        !component.contains("\0"), component != "."
      else { throw LocalImageError.unsafePath }
      if component == ".." {
        target.deleteLastPathComponent()
      } else {
        target.appendPathComponent(component)
      }
      target = target.standardizedFileURL
      guard target.path == grant.path || target.path.hasPrefix(grant.path + "/") else {
        throw LocalImageError.unauthorizedDirectory
      }
    }
    guard target.path != grant.path else { throw LocalImageError.unsafePath }
    if mustExist {
      guard target.resolvingSymlinksInPath() == target else { throw LocalImageError.unsafePath }
    } else {
      var existing = target.deletingLastPathComponent()
      while !FileManager.default.fileExists(atPath: existing.path), existing.path != grant.path {
        existing.deleteLastPathComponent()
      }
      guard existing.resolvingSymlinksInPath() == existing else {
        throw LocalImageError.unsafePath
      }
    }
    return target
  }

  private static func readRegularFile(_ url: URL) throws -> Data {
    let descriptor = open(url.path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw LocalImageError.invalidSource }
    defer { close(descriptor) }
    var information = stat()
    guard fstat(descriptor, &information) == 0,
      (information.st_mode & S_IFMT) == S_IFREG,
      information.st_size >= 0,
      information.st_size <= 25 * 1024 * 1024
    else { throw LocalImageError.invalidSource }
    var data = Data(count: Int(information.st_size))
    let count = data.withUnsafeMutableBytes { bytes -> Int in
      guard let base = bytes.baseAddress else { return 0 }
      var offset = 0
      while offset < bytes.count {
        let amount = Darwin.read(descriptor, base.advanced(by: offset), bytes.count - offset)
        if amount <= 0 { return -1 }
        offset += amount
      }
      return offset
    }
    guard count == data.count else { throw LocalImageError.invalidSource }
    return data
  }

  private static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}
