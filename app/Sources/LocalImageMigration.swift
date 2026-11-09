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
  private struct Journal: Codable {
    let schema: Int
    let id: UUID
    let state: String
    let items: [LocalImageMigrationPlan.Item]
  }

  private let journalRoot: URL

  init(journalRoot: URL) {
    self.journalRoot = journalRoot.standardizedFileURL
  }

  static func localImageURIs(in markdown: String) -> [String] {
    imageURIs(in: markdown).filter(isLocalRelativeURI)
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
    sourceDocumentURL: URL,
    targetDocumentURL: URL,
    sourceAuthorizedDirectory: URL,
    targetAuthorizedDirectory: URL,
    excludingURIs: Set<String> = []
  ) throws -> LocalImageMigrationPlan {
    let id = UUID()
    var items: [LocalImageMigrationPlan.Item] = []
    for uri in Self.imageURIs(in: markdown) {
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

  private func writeJournal(_ plan: LocalImageMigrationPlan, state: String) throws {
    try FileManager.default.createDirectory(at: journalRoot, withIntermediateDirectories: true)
    let journal = Journal(schema: 1, id: plan.id, state: state, items: plan.items)
    try JSONEncoder().encode(journal).write(to: journalURL(plan.id), options: .atomic)
  }

  private func journalURL(_ id: UUID) -> URL {
    journalRoot.appendingPathComponent("\(id.uuidString.lowercased()).json")
  }

  private static func imageURIs(in markdown: String) -> [String] {
    var result: [String] = []
    let originalUnits = Array(markdown.utf16)
    let searchable = maskNonImageContexts(markdown)
    let full = NSRange(searchable.startIndex..<searchable.endIndex, in: searchable)
    let definitions = matches(
      pattern: #"(?m)^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|([^ \t\n]+))"#,
      text: searchable, range: full
    )
    .reduce(into: [String: String]()) { definitions, match in
      guard let label = capture(match, 1, searchable)?.lowercased(),
        let uri = capture(match, 2, searchable) ?? capture(match, 3, searchable)
      else { return }
      definitions[label] = uri
    }
    for match in matches(
      pattern: #"!\[[^\]\n]*\]\([ \t]*(?:<([^>\n]+)>|([^ \t\n\)]+))"#,
      text: searchable, range: full)
    {
      guard !isEscaped(at: match.range.location, units: originalUnits) else { continue }
      if let uri = capture(match, 1, searchable) ?? capture(match, 2, searchable) {
        result.append(uri)
      }
    }
    for match in matches(
      pattern: #"!\[([^\]\n]*)\](?!\()[ \t]*(?:\[([^\]\n]*)\])?"#,
      text: searchable, range: full)
    {
      guard !isEscaped(at: match.range.location, units: originalUnits),
        let alt = capture(match, 1, searchable)
      else { continue }
      let explicit = capture(match, 2, searchable)
      let label = ((explicit?.isEmpty == false ? explicit : alt) ?? alt).lowercased()
      if let uri = definitions[label] { result.append(uri) }
    }
    var seen = Set<String>()
    return result.filter { seen.insert($0).inserted }
  }

  private static func maskNonImageContexts(_ markdown: String) -> String {
    let original = Array(markdown.utf16)
    var masked = original
    func blank(_ lower: Int, _ upper: Int) {
      guard lower < upper else { return }
      for index in lower..<upper where original[index] != 10 && original[index] != 13 {
        masked[index] = 32
      }
    }
    func marker(at start: Int, before end: Int) -> (UInt16, Int)? {
      var index = start
      var indentation = 0
      while index < end, original[index] == 32, indentation < 4 {
        indentation += 1
        index += 1
      }
      guard indentation <= 3, index < end, original[index] == 96 || original[index] == 126
      else { return nil }
      let character = original[index]
      let runStart = index
      while index < end, original[index] == character { index += 1 }
      let count = index - runStart
      return count >= 3 ? (character, count) : nil
    }

    var fence: (character: UInt16, count: Int)?
    var lineStart = 0
    while lineStart < original.count {
      var lineEnd = lineStart
      while lineEnd < original.count, original[lineEnd] != 10, original[lineEnd] != 13 {
        lineEnd += 1
      }
      var nextLine = lineEnd
      if nextLine < original.count, original[nextLine] == 13 { nextLine += 1 }
      if nextLine < original.count, original[nextLine] == 10 { nextLine += 1 }
      if let active = fence {
        if let close = marker(at: lineStart, before: lineEnd),
          close.0 == active.character, close.1 >= active.count
        {
          fence = nil
        }
        blank(lineStart, nextLine)
      } else if let open = marker(at: lineStart, before: lineEnd) {
        fence = (open.0, open.1)
        blank(lineStart, nextLine)
      }
      lineStart = nextLine
    }

    var index = 0
    while index + 3 < original.count {
      if masked[index] != 32, original[index...].starts(with: [60, 33, 45, 45]) {
        var end = index + 4
        while end + 2 < original.count,
          !original[end...].starts(with: [45, 45, 62])
        {
          end += 1
        }
        end = min(original.count, end + 3)
        blank(index, end)
        index = end
      } else {
        index += 1
      }
    }

    index = 0
    while index < original.count {
      guard masked[index] != 32, original[index] == 96 else {
        index += 1
        continue
      }
      let open = index
      while index < original.count, original[index] == 96 { index += 1 }
      let width = index - open
      var cursor = index
      var close: Int?
      while cursor < original.count {
        guard masked[cursor] != 32, original[cursor] == 96 else {
          cursor += 1
          continue
        }
        let runStart = cursor
        while cursor < original.count, original[cursor] == 96 { cursor += 1 }
        if cursor - runStart == width {
          close = cursor
          break
        }
      }
      if let close {
        blank(open, close)
        index = close
      }
    }
    return String(decoding: masked, as: UTF16.self)
  }

  private static func isEscaped(at offset: Int, units: [UInt16]) -> Bool {
    guard offset > 0, offset <= units.count else { return false }
    var index = offset - 1
    var count = 0
    while units[index] == 92 {
      count += 1
      guard index > 0 else { break }
      index -= 1
    }
    return count % 2 == 1
  }

  private static func matches(
    pattern: String, text: String, range: NSRange
  ) -> [NSTextCheckingResult] {
    (try? NSRegularExpression(pattern: pattern).matches(in: text, range: range)) ?? []
  }

  private static func capture(
    _ match: NSTextCheckingResult, _ index: Int, _ text: String
  ) -> String? {
    guard match.range(at: index).location != NSNotFound,
      let range = Range(match.range(at: index), in: text)
    else { return nil }
    return String(text[range])
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
