import CryptoKit
import Foundation

struct RecoveryFingerprint: Codable, Equatable {
  let modified: Date?
  let size: Int
  let sha256: String

  init(data: Data, modified: Date? = nil) {
    self.modified = modified
    size = data.count
    sha256 = Self.hash(data)
  }

  static func hash(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  static func read(_ url: URL) throws -> Self {
    let version = try DocumentDiskVersion(url: url)
    return Self(data: version.data, modified: version.modified)
  }
}

struct RecoveryDraft: Codable, Equatable {
  let schema: Int
  let id: UUID
  let generation: UUID
  let revision: Int
  let data: Data
  let payloadHash: String
  let sourceURL: URL?
  let bookmark: Data?
  let sourceFingerprint: RecoveryFingerprint?
  let hasBOM: Bool
  let lineEndings: [String]
  let writtenAt: Date
  let appVersion: String

  init(
    id: UUID, revision: Int, data: Data, sourceURL: URL?,
    sourceFingerprint: RecoveryFingerprint?, bookmark: Data? = nil
  ) {
    schema = 1
    self.id = id
    generation = UUID()
    self.revision = revision
    self.data = data
    payloadHash = RecoveryFingerprint.hash(data)
    self.sourceURL = sourceURL
    self.bookmark = bookmark
    self.sourceFingerprint = sourceFingerprint
    hasBOM = data.starts(with: [0xEF, 0xBB, 0xBF])
    let text = String(decoding: data, as: UTF8.self)
    var endings: [String] = []
    if text.contains("\r\n") { endings.append("\r\n") }
    let remaining = text.replacingOccurrences(of: "\r\n", with: "")
    if remaining.contains("\r") { endings.append("\r") }
    if remaining.contains("\n") { endings.append("\n") }
    lineEndings = endings.sorted()
    writtenAt = Date()
    appVersion =
      Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? "development"
  }

  func validate() throws {
    guard schema == 1, revision >= 0, revision <= BridgeProtocolV1.maxSafeRevision,
      sourceURL == nil || sourceURL?.isFileURL == true,
      payloadHash == RecoveryFingerprint.hash(data),
      String(data: data, encoding: .utf8) != nil,
      hasBOM == data.starts(with: [0xEF, 0xBB, 0xBF])
    else { throw CocoaError(.fileReadCorruptFile) }
  }

  func resolvedSourceURL() -> URL? {
    if let bookmark {
      var stale = false
      if let url = try? URL(
        resolvingBookmarkData: bookmark, options: [.withSecurityScope],
        relativeTo: nil, bookmarkDataIsStale: &stale), !stale, url.isFileURL
      {
        return url
      }
    }
    return sourceURL
  }

  var sourceChanged: Bool {
    guard let url = resolvedSourceURL() else { return false }
    guard let sourceFingerprint, let current = try? RecoveryFingerprint.read(url) else {
      return true
    }
    return current != sourceFingerprint
  }
}

// Main-thread document callbacks serialize store operations. Injected writers and
// removers let tests model full disks and a failed unlink without touching real data.
final class RecoveryStore {
  struct Discovery {
    var drafts: [RecoveryDraft] = []
    var corruptCount = 0
  }

  private struct Receipt: Codable, Equatable {
    let generation: UUID
    let revision: Int
    let payloadHash: String

    init(_ draft: RecoveryDraft) {
      generation = draft.generation
      revision = draft.revision
      payloadHash = draft.payloadHash
    }
  }

  let directory: URL
  private let writer: any DocumentDataWriting
  private let remove: (URL) throws -> Void

  init(
    directory: URL, writer: any DocumentDataWriting = AtomicDocumentDataWriter(),
    remove: @escaping (URL) throws -> Void = { try FileManager.default.removeItem(at: $0) }
  ) {
    self.directory = directory
    self.writer = writer
    self.remove = remove
  }

  func write(_ draft: RecoveryDraft) throws {
    try draft.validate()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = draftURL(draft.id)
    let receipt = try? JSONDecoder().decode(
      Receipt.self, from: Data(contentsOf: receiptURL(draft.id)))
    if let previous = try? decodeDraft(url),
      receipt != Receipt(previous),
      previous.data == draft.data,
      previous.sourceURL == draft.sourceURL,
      previous.sourceFingerprint == draft.sourceFingerprint
    {
      return
    }
    try writer.write(try JSONEncoder().encode(draft), to: url)
  }

  func retire(_ id: UUID) throws {
    let url = draftURL(id)
    guard FileManager.default.fileExists(atPath: url.path) else { return }
    // A durable receipt suppresses exactly this generation even if unlink fails.
    let receipt = try decodeDraft(url)
    do {
      try writer.write(
        try JSONEncoder().encode(
          Receipt(receipt)), to: receiptURL(id))
    } catch {
      try remove(url)
      return
    }
    do {
      try remove(url)
      try? remove(receiptURL(id))
    } catch {
      // The receipt remains authoritative when unlink fails.
    }
  }

  func discover() -> Discovery {
    var result = Discovery()
    let files =
      (try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: nil)) ?? []
    for url in files where url.pathExtension == "json" {
      do {
        let draft = try decodeDraft(url)
        guard url.lastPathComponent == draftURL(draft.id).lastPathComponent else {
          throw CocoaError(.fileReadCorruptFile)
        }
        let receipt = try? JSONDecoder().decode(
          Receipt.self, from: Data(contentsOf: receiptURL(draft.id)))
        if receipt == Receipt(draft) { continue }
        // Covers a crash between the original save and receipt commit.
        if let source = draft.resolvedSourceURL(),
          let current = try? RecoveryFingerprint.read(source), current.sha256 == draft.payloadHash
        {
          continue
        }
        result.drafts.append(draft)
      } catch { result.corruptCount += 1 }
    }
    result.drafts.sort { $0.writtenAt < $1.writtenAt }
    return result
  }

  private func decodeDraft(_ url: URL) throws -> RecoveryDraft {
    let draft = try JSONDecoder().decode(RecoveryDraft.self, from: Data(contentsOf: url))
    try draft.validate()
    return draft
  }

  func draftURL(_ id: UUID) -> URL { directory.appendingPathComponent("\(id).json") }
  private func receiptURL(_ id: UUID) -> URL { directory.appendingPathComponent("\(id).resolved") }

  static func applicationStore() -> RecoveryStore? {
    // Hostless XCTest never writes real user recovery data.
    guard Bundle.main.bundleIdentifier == "com.huruizhi.Inkora" else { return nil }
    var url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Inkora/Recovery", isDirectory: true)
    let args = ProcessInfo.processInfo.arguments
    if let index = args.firstIndex(of: "--inkora-test-recovery-session"), args.count > index + 1,
      let id = UUID(uuidString: args[index + 1])
    {
      url = url.appendingPathComponent("UITests/\(id.uuidString)", isDirectory: true)
    }
    return RecoveryStore(directory: url)
  }
}
