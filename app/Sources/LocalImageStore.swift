import CryptoKit
import Darwin
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum LocalImageError: LocalizedError, Equatable {
  case invalidSource
  case unsupportedFormat
  case sizeLimit
  case unsafePath
  case unauthorizedDirectory
  case checksumMismatch
  case targetConflict
  case corruptManifest
  case unresolvedMarkdownOwner

  var errorDescription: String? {
    switch self {
    case .invalidSource: "图片来源不存在、不是普通文件或不可读取。"
    case .unsupportedFormat: "图片格式不受支持或文件内容与图片不符。"
    case .sizeLimit: "图片超过 25 MiB 限制。"
    case .unsafePath: "图片路径包含不安全的符号链接或越界组件。"
    case .unauthorizedDirectory: "尚未取得目标资源目录的写入授权。"
    case .checksumMismatch: "图片复制后的 SHA-256 校验失败。"
    case .targetConflict: "目标已有同名但内容不同的图片。"
    case .corruptManifest: "图片恢复清单损坏或与磁盘字节不一致。"
    case .unresolvedMarkdownOwner: "图片引用未完成安全路径确认，已阻止保存。"
    }
  }
}

struct LocalImageAsset: Codable, Equatable {
  enum Ownership: String, Codable { case session, operation, none }
  enum State: String, Codable { case draft, awaitingMarkdown, published, reused }
  enum Insertion: String, Codable { case pending, accepted }

  struct ImportIntent: Codable, Equatable {
    enum RecoveryState: String, Codable { case active, requiresConfirmation }
    let documentID: String
    let sessionID: UUID
    let documentEpoch: UUID
    let revision: Int
    let selectionAnchor: Int?
    let selectionHead: Int?
    var recoveryState: RecoveryState
  }

  let id: UUID
  let originalName: String
  var markdownURI: String
  var storageURL: URL
  let sha256: String
  let byteCount: Int
  let mimeType: String
  var ownership: Ownership
  var state: State
  var insertion: Insertion
  var pendingSaveID: UUID?
  var importIntent: ImportIntent?
}

struct LocalImageSavePlan: Equatable {
  struct Item: Equatable {
    let assetID: UUID
    let sourceURL: URL
    let targetURL: URL
    let sha256: String
    let targetURI: String
    let reused: Bool
  }

  let id: UUID
  let sessionID: UUID
  let documentURL: URL
  let authorizedDirectory: URL
  let rewrites: [String: String]
  let items: [Item]
}

struct LocalImageInspection: Equatable {
  let sha256: String
  let mimeType: String
}

final class LocalImageStore {
  let root: URL

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  func begin(documentID: String, sessionID: UUID = UUID()) throws -> LocalImageSession {
    try LocalImageSession(root: root, documentID: documentID, sessionID: sessionID)
  }
}

final class LocalImageSession {
  private struct Manifest: Codable {
    let schema: Int
    let sessionID: UUID
    let documentID: String
    var assets: [LocalImageAsset]
  }

  private static let maximumBytes = 25 * 1024 * 1024
  private let root: URL
  private let directory: URL
  private let manifestURL: URL
  let documentID: String
  let sessionID: UUID
  private(set) var assets: [LocalImageAsset]
  let wasRestored: Bool

  fileprivate init(root: URL, documentID: String, sessionID: UUID) throws {
    guard !documentID.isEmpty else { throw LocalImageError.corruptManifest }
    self.root = root
    self.documentID = documentID
    self.sessionID = sessionID
    directory = root.appendingPathComponent(sessionID.uuidString.lowercased(), isDirectory: true)
    manifestURL = directory.appendingPathComponent("manifest.json")
    if FileManager.default.fileExists(atPath: manifestURL.path) {
      wasRestored = true
      do {
        let manifestData: Data
        do {
          manifestData = try Self.readRegularFile(manifestURL)
        } catch {
          throw LocalImageError.corruptManifest
        }
        let manifest = try JSONDecoder().decode(
          Manifest.self, from: manifestData)
        guard [1, 2].contains(manifest.schema), manifest.sessionID == sessionID,
          manifest.documentID == documentID
        else { throw LocalImageError.corruptManifest }
        for asset in manifest.assets {
          if let intent = asset.importIntent {
            guard intent.documentID == documentID, intent.sessionID == sessionID,
              intent.revision >= 0,
              (intent.selectionAnchor == nil) == (intent.selectionHead == nil),
              (intent.selectionAnchor ?? 0) >= 0, (intent.selectionHead ?? 0) >= 0
            else { throw LocalImageError.corruptManifest }
          }
          try Self.validateStoredAsset(asset, inside: directory)
        }
        assets = manifest.assets
      } catch let error as LocalImageError {
        throw error
      } catch {
        throw LocalImageError.corruptManifest
      }
    } else {
      wasRestored = false
      assets = []
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try persist()
    }
  }

  @discardableResult
  func importFile(
    from sourceURL: URL,
    preferredName: String? = nil,
    documentURL: URL?,
    authorizedDirectory: URL?,
    importIntent: LocalImageAsset.ImportIntent? = nil
  ) throws -> LocalImageAsset {
    let data = try Self.readRegularFile(sourceURL)
    return try importData(
      data,
      sourceExtension: sourceURL.pathExtension,
      preferredName: preferredName ?? sourceURL.lastPathComponent,
      documentURL: documentURL,
      authorizedDirectory: authorizedDirectory,
      importIntent: importIntent)
  }

  static func inspectExternalFile(_ url: URL) throws -> LocalImageInspection {
    let data = try readRegularFile(url)
    let image = try inspectImage(data, sourceExtension: url.pathExtension)
    return LocalImageInspection(sha256: sha256(data), mimeType: image.mime)
  }

  @discardableResult
  func importBitmapPNG(
    _ data: Data,
    preferredName: String = "Pasted Image.png",
    documentURL: URL?,
    authorizedDirectory: URL?,
    importIntent: LocalImageAsset.ImportIntent? = nil
  ) throws -> LocalImageAsset {
    try importData(
      data,
      sourceExtension: "png",
      preferredName: preferredName,
      documentURL: documentURL,
      authorizedDirectory: authorizedDirectory,
      importIntent: importIntent)
  }

  private func importData(
    _ data: Data,
    sourceExtension: String,
    preferredName: String,
    documentURL: URL?,
    authorizedDirectory: URL?,
    importIntent: LocalImageAsset.ImportIntent?
  ) throws -> LocalImageAsset {
    guard data.count <= Self.maximumBytes else { throw LocalImageError.sizeLimit }
    let image = try Self.inspectImage(data, sourceExtension: sourceExtension)
    let requestedName = Self.safeFilename(
      preferredName, preferredExtension: image.extension)
    let checksum = Self.sha256(data)
    let id = UUID()
    let asset: LocalImageAsset

    if let documentURL {
      guard let authorizedDirectory else { throw LocalImageError.unauthorizedDirectory }
      let assetsDirectory = try Self.assetsDirectory(
        documentURL: documentURL, authorizedDirectory: authorizedDirectory)
      try FileManager.default.createDirectory(
        at: assetsDirectory, withIntermediateDirectories: true)
      let allocated = try Self.allocate(
        preferredName: requestedName, dataSHA: checksum, in: assetsDirectory)
      if !allocated.reused {
        try Self.atomicWrite(data, to: allocated.url)
        guard try Self.sha256(Self.readRegularFile(allocated.url)) == checksum else {
          throw LocalImageError.checksumMismatch
        }
      }
      let directoryName = documentURL.deletingPathExtension().lastPathComponent + ".assets"
      asset = LocalImageAsset(
        id: id,
        originalName: requestedName,
        markdownURI: Self.percentEncode(directoryName) + "/" + Self.percentEncode(allocated.name),
        storageURL: allocated.url,
        sha256: checksum,
        byteCount: data.count,
        mimeType: image.mime,
        ownership: allocated.reused ? .none : .operation,
        state: allocated.reused ? .reused : .published,
        insertion: .pending, pendingSaveID: nil, importIntent: importIntent)
    } else {
      let imports = directory.appendingPathComponent("imports", isDirectory: true)
      try FileManager.default.createDirectory(at: imports, withIntermediateDirectories: true)
      let allocated = try Self.allocate(
        preferredName: requestedName, dataSHA: checksum, in: imports)
      if !allocated.reused { try Self.atomicWrite(data, to: allocated.url) }
      guard try Self.sha256(Self.readRegularFile(allocated.url)) == checksum else {
        throw LocalImageError.checksumMismatch
      }
      asset = LocalImageAsset(
        id: id,
        originalName: allocated.name,
        markdownURI: "inkora-draft://asset/\(id.uuidString.lowercased())",
        storageURL: allocated.url,
        sha256: checksum,
        byteCount: data.count,
        mimeType: image.mime,
        ownership: .session,
        state: .draft,
        insertion: .pending, pendingSaveID: nil, importIntent: importIntent)
    }
    assets.append(asset)
    try persist()
    return asset
  }

  func markInsertionAccepted(assetID: UUID) throws {
    guard let index = assets.firstIndex(where: { $0.id == assetID }) else {
      throw LocalImageError.corruptManifest
    }
    assets[index].insertion = .accepted
    try persist()
  }

  func requireInsertionConfirmation(assetID: UUID) throws {
    guard let index = assets.firstIndex(where: { $0.id == assetID }),
      assets[index].insertion == .pending
    else { throw LocalImageError.corruptManifest }
    var intent =
      assets[index].importIntent
      ?? LocalImageAsset.ImportIntent(
        documentID: documentID, sessionID: sessionID,
        documentEpoch: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
        revision: 0, selectionAnchor: nil, selectionHead: nil,
        recoveryState: .requiresConfirmation)
    intent.recoveryState = .requiresConfirmation
    assets[index].importIntent = intent
    try persist()
  }

  func prepareFirstSave(
    documentURL: URL,
    authorizedDirectory: URL
  ) throws -> LocalImageSavePlan {
    let assetsDirectory = try Self.assetsDirectory(
      documentURL: documentURL, authorizedDirectory: authorizedDirectory)
    var reservedNames = Set<String>()
    var rewrites: [String: String] = [:]
    var items: [LocalImageSavePlan.Item] = []
    let directoryName = documentURL.deletingPathExtension().lastPathComponent + ".assets"
    for asset in assets
    where
      (asset.state == .draft || asset.state == .awaitingMarkdown)
      && asset.insertion == .accepted
    {
      try Self.validateStoredAsset(asset, inside: directory)
      let allocation = try Self.allocate(
        preferredName: asset.originalName,
        dataSHA: asset.sha256,
        in: assetsDirectory,
        additionallyReserved: reservedNames)
      reservedNames.insert(allocation.name)
      let uri = Self.percentEncode(directoryName) + "/" + Self.percentEncode(allocation.name)
      if asset.markdownURI != uri { rewrites[asset.markdownURI] = uri }
      items.append(
        .init(
          assetID: asset.id,
          sourceURL: asset.storageURL,
          targetURL: allocation.url,
          sha256: asset.sha256,
          targetURI: uri,
          reused: allocation.reused))
    }
    return LocalImageSavePlan(
      id: UUID(), sessionID: sessionID, documentURL: documentURL,
      authorizedDirectory: authorizedDirectory.standardizedFileURL,
      rewrites: rewrites, items: items)
  }

  func publish(_ plan: LocalImageSavePlan) throws {
    guard plan.sessionID == sessionID else { throw LocalImageError.corruptManifest }
    _ = try Self.assetsDirectory(
      documentURL: plan.documentURL, authorizedDirectory: plan.authorizedDirectory)
    var updates: [UUID: LocalImageSavePlan.Item] = [:]
    for item in plan.items {
      guard let asset = assets.first(where: { $0.id == item.assetID }),
        asset.sha256 == item.sha256, asset.storageURL == item.sourceURL
      else { throw LocalImageError.corruptManifest }
      let bytes = try Self.readRegularFile(item.sourceURL)
      guard Self.sha256(bytes) == item.sha256 else { throw LocalImageError.checksumMismatch }
      try FileManager.default.createDirectory(
        at: item.targetURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      if FileManager.default.fileExists(atPath: item.targetURL.path) {
        let existing = try Self.readRegularFile(item.targetURL)
        guard Self.sha256(existing) == item.sha256 else { throw LocalImageError.targetConflict }
      } else {
        try Self.atomicWrite(bytes, to: item.targetURL)
      }
      guard Self.sha256(try Self.readRegularFile(item.targetURL)) == item.sha256 else {
        throw LocalImageError.checksumMismatch
      }
      updates[item.assetID] = item
    }
    for index in assets.indices {
      guard let item = updates[assets[index].id] else { continue }
      assets[index].state = .awaitingMarkdown
      assets[index].ownership = item.reused ? .none : .operation
      assets[index].pendingSaveID = plan.id
    }
    try persist()
  }

  func confirmMarkdownCommit(_ plan: LocalImageSavePlan) throws {
    guard plan.sessionID == sessionID else { throw LocalImageError.corruptManifest }
    let updates = Dictionary(uniqueKeysWithValues: plan.items.map { ($0.assetID, $0) })
    for index in assets.indices {
      guard let item = updates[assets[index].id],
        assets[index].state == .awaitingMarkdown,
        assets[index].pendingSaveID == plan.id
      else { continue }
      assets[index].markdownURI = item.targetURI
      assets[index].state = item.reused ? .reused : .published
      assets[index].pendingSaveID = nil
    }
    try persist()
  }

  func validateMarkdownSnapshot(_ markdown: String, for plan: LocalImageSavePlan) throws {
    guard plan.sessionID == sessionID else { throw LocalImageError.corruptManifest }
    let owners = Set(LocalImageMigrationCoordinator.imageURIs(in: markdown))
    for item in plan.items {
      guard let asset = assets.first(where: { $0.id == item.assetID }),
        asset.sha256 == item.sha256,
        !owners.contains(asset.markdownURI),
        owners.contains(item.targetURI)
      else { throw LocalImageError.unresolvedMarkdownOwner }
    }
  }

  func retireTransferredStorageIfPossible() throws {
    guard !assets.isEmpty,
      assets.allSatisfy({
        $0.insertion == .accepted && ($0.state == .published || $0.state == .reused)
      })
    else { return }
    assets.removeAll()
    if FileManager.default.fileExists(atPath: directory.path) {
      try FileManager.default.removeItem(at: directory)
    }
  }

  private func persist() throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let manifest = Manifest(schema: 2, sessionID: sessionID, documentID: documentID, assets: assets)
    try Self.atomicWrite(try JSONEncoder().encode(manifest), to: manifestURL)
  }

  private static func validateStoredAsset(_ asset: LocalImageAsset, inside session: URL) throws {
    let storage = asset.storageURL.standardizedFileURL
    let sessionOwned = asset.state == .draft || asset.state == .awaitingMarkdown
    guard !sessionOwned || storage.path.hasPrefix(session.standardizedFileURL.path + "/"),
      asset.byteCount >= 0, asset.byteCount <= maximumBytes
    else { throw LocalImageError.corruptManifest }
    do {
      let bytes = try readRegularFile(storage)
      guard bytes.count == asset.byteCount, sha256(bytes) == asset.sha256 else {
        throw LocalImageError.corruptManifest
      }
    } catch {
      throw LocalImageError.corruptManifest
    }
  }

  private static func readRegularFile(_ url: URL) throws -> Data {
    var information = stat()
    guard lstat(url.path, &information) == 0,
      (information.st_mode & S_IFMT) == S_IFREG
    else { throw LocalImageError.invalidSource }
    guard information.st_size >= 0, information.st_size <= maximumBytes else {
      throw LocalImageError.sizeLimit
    }
    let descriptor = open(url.path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw LocalImageError.invalidSource }
    defer { close(descriptor) }
    var data = Data(count: Int(information.st_size))
    let count = data.withUnsafeMutableBytes { bytes -> Int in
      guard let base = bytes.baseAddress else { return 0 }
      var offset = 0
      while offset < bytes.count {
        let amount = Darwin.read(descriptor, base.advanced(by: offset), bytes.count - offset)
        if amount <= 0 { return amount < 0 ? -1 : offset }
        offset += amount
      }
      return offset
    }
    guard count == data.count else { throw LocalImageError.invalidSource }
    return data
  }

  private static func inspectImage(
    _ data: Data, sourceExtension: String
  ) throws -> (mime: String, extension: String) {
    guard !data.isEmpty,
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      CGImageSourceGetCount(source) > 0,
      let type = CGImageSourceGetType(source) as String?,
      let uniformType = UTType(type), uniformType.conforms(to: .image),
      uniformType != .svg,
      CGImageSourceCreateImageAtIndex(source, 0, nil) != nil,
      let mime = uniformType.preferredMIMEType,
      let preferredExtension = uniformType.preferredFilenameExtension
    else { throw LocalImageError.unsupportedFormat }
    let supported = ["image/png", "image/jpeg", "image/gif", "image/webp"]
    guard supported.contains(mime) else { throw LocalImageError.unsupportedFormat }
    let requested = sourceExtension.lowercased()
    let compatible =
      requested.isEmpty || requested == preferredExtension.lowercased()
      || (mime == "image/jpeg" && ["jpg", "jpeg"].contains(requested))
    guard compatible else { throw LocalImageError.unsupportedFormat }
    return (mime, preferredExtension.lowercased())
  }

  private static func assetsDirectory(documentURL: URL, authorizedDirectory: URL) throws -> URL {
    let grant = authorizedDirectory.standardizedFileURL
    let parent = documentURL.deletingLastPathComponent().standardizedFileURL
    guard parent.path == grant.path || parent.path.hasPrefix(grant.path + "/"),
      !hasSymlinkComponent(from: grant, to: parent)
    else { throw LocalImageError.unauthorizedDirectory }
    let name = documentURL.deletingPathExtension().lastPathComponent + ".assets"
    guard !name.isEmpty, name != ".assets", !name.contains("/") else {
      throw LocalImageError.unsafePath
    }
    return parent.appendingPathComponent(name, isDirectory: true)
  }

  private static func hasSymlinkComponent(from root: URL, to target: URL) -> Bool {
    var current = root.standardizedFileURL
    let rootCount = current.pathComponents.count
    for component in target.standardizedFileURL.pathComponents.dropFirst(rootCount) {
      current.appendPathComponent(component)
      var information = stat()
      if lstat(current.path, &information) == 0,
        (information.st_mode & S_IFMT) == S_IFLNK
      {
        return true
      }
    }
    return false
  }

  private static func safeFilename(_ raw: String, preferredExtension: String) -> String {
    let component = URL(fileURLWithPath: raw).lastPathComponent
    var base = URL(fileURLWithPath: component).deletingPathExtension().lastPathComponent
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if base.isEmpty || base == "." || base == ".." { base = "image" }
    base = base.replacingOccurrences(of: "/", with: "-")
      .replacingOccurrences(of: ":", with: "-")
    return "\(base).\(preferredExtension)"
  }

  private static func allocate(
    preferredName: String,
    dataSHA: String,
    in directory: URL,
    additionallyReserved: Set<String> = []
  ) throws -> (url: URL, name: String, reused: Bool) {
    let fileURL = URL(fileURLWithPath: preferredName)
    let base = fileURL.deletingPathExtension().lastPathComponent
    let ext = fileURL.pathExtension
    var index = 1
    while true {
      let suffix = index == 1 ? "" : "-\(index)"
      let name = ext.isEmpty ? base + suffix : "\(base)\(suffix).\(ext)"
      if additionallyReserved.contains(name) {
        index += 1
        continue
      }
      let url = directory.appendingPathComponent(name)
      if !FileManager.default.fileExists(atPath: url.path) {
        return (url, name, false)
      }
      do {
        if sha256(try readRegularFile(url)) == dataSHA { return (url, name, true) }
      } catch LocalImageError.invalidSource {
        throw LocalImageError.unsafePath
      }
      index += 1
    }
  }

  private static func atomicWrite(_ data: Data, to url: URL) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: url, options: .atomic)
  }

  private static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static func percentEncode(_ value: String) -> String {
    value.utf8.map { byte in
      switch byte {
      case 65...90, 97...122, 48...57, 45, 46, 95, 126:
        String(UnicodeScalar(byte))
      default:
        String(format: "%%%02X", byte)
      }
    }.joined()
  }
}
