import CryptoKit
import Darwin
import Foundation

struct SidebarFile: Codable, Equatable, Sendable {
  let id: String
  let name: String
  let relativePath: String
  let summary: String
  var isCurrent: Bool? = nil
}

struct SidebarSearchOptions: Codable, Equatable, Sendable {
  var caseSensitive = false
  var wholeWord = false
  var regularExpression = false
}

struct SidebarSearchHit: Codable, Equatable, Sendable {
  let fileID: String
  let line: Int
  let snippet: String
  let hitID: String
  let fileVersion: String
  let utf16Location: Int
  let utf16Length: Int
}

struct SidebarSearchLocation: Equatable, Sendable {
  let utf16Location: Int
  let utf16Length: Int
}

struct SidebarSearchResult: Codable, Equatable, Sendable {
  let hits: [SidebarSearchHit]
  let truncated: Bool
}

enum SidebarCatalogError: LocalizedError {
  case unavailable
  case staleFile
  case unsafeFile
  case sizeLimit
  case invalidEncoding
  case invalidPattern
  case searchTimedOut
  case scanTimedOut
  case cancelled

  var errorDescription: String? {
    switch self {
    case .unavailable: "无法读取所选文件夹，请重新选择。"
    case .staleFile: "文档列表已更新，请从当前列表重新打开。"
    case .unsafeFile: "文件已移动或为符号链接，请刷新列表。"
    case .sizeLimit: "文件超过侧栏读取上限，请通过文件菜单单独打开。"
    case .invalidEncoding: "文件不是有效UTF-8文本，未参与侧栏搜索。"
    case .invalidPattern: "正则表达式无效。"
    case .scanTimedOut: "文件夹读取超时，请选择更小的文件夹。"
    case .searchTimedOut: "搜索超时，请缩小范围或简化正则表达式。"
    case .cancelled: "搜索已取消。"
    }
  }
}

/// An immutable, authorized-folder index. Web receives opaque file IDs, never paths
/// it can substitute into a native read. Every read walks from the root descriptor.
struct SidebarCatalog: Sendable {
  struct RootIdentity: Equatable, Sendable {
    let device: dev_t
    let inode: ino_t
  }

  static func rootIdentity(folder: URL) throws -> RootIdentity {
    let descriptor = open(folder.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(descriptor) }
    var metadata = stat()
    guard fstat(descriptor, &metadata) == 0 else { throw SidebarCatalogError.unavailable }
    return RootIdentity(device: metadata.st_dev, inode: metadata.st_ino)
  }

  struct Limits: Sendable {
    var files = 10_000
    var fileBytes = 5 * 1024 * 1024
    var totalBytes = 50 * 1024 * 1024
    var depth = 32
    var searchHits = 1_000
    var searchSeconds: TimeInterval = 2
    var scanSeconds: TimeInterval = 10
    var directoryEntries = 100_000
  }

  struct OpenedFile: Sendable {
    let url: URL
    let data: Data
    let version: String
    let location: SidebarSearchLocation?
    let modified: Date?
    private let revalidation: (@MainActor @Sendable () throws -> OpenedFile)?

    /// Reopens only the original catalog capability. URL/data are not a durable
    /// navigation grant; callers must use this again after every asynchronous gate.
    @MainActor
    func revalidatedForNavigation() throws -> OpenedFile {
      guard let revalidation else { throw SidebarCatalogError.staleFile }
      return try revalidation()
    }

    func validatingNavigation(
      _ validate: @escaping @MainActor @Sendable () throws -> Void
    ) -> OpenedFile {
      OpenedFile(
        url: url, data: data, version: version, location: location, modified: modified,
        revalidation: {
          try validate()
          let fresh = try self.revalidatedForNavigation()
          // A fresh result must keep the request guard for a later await boundary.
          return fresh.validatingNavigation(validate)
        })
    }

    init(
      url: URL, data: Data, version: String, location: SidebarSearchLocation?,
      modified: Date? = nil,
      revalidation: (@MainActor @Sendable () throws -> OpenedFile)? = nil
    ) {
      self.url = url
      self.data = data
      self.version = version
      self.location = location
      self.modified = modified
      self.revalidation = revalidation
    }
  }

  private struct Entry: Sendable {
    let components: [String]
    let text: String
    let version: String
    let device: dev_t
    let inode: ino_t
  }

  let id: String
  let root: URL
  let files: [SidebarFile]
  let incomplete: Bool
  let skippedFiles: Int
  private let entries: [String: Entry]
  private let limits: Limits
  private let rootDevice: dev_t
  private let rootInode: ino_t

  var contentVersion: String {
    let listing = files.map { file in
      "\(file.relativePath):\(entries[file.id]?.device ?? 0):\(entries[file.id]?.inode ?? 0):\(entries[file.id]?.version ?? "")"
    }.joined(separator: "\n")
    return Self.version(
      Data("\(rootDevice):\(rootInode):\(incomplete):\(skippedFiles):\(listing)".utf8))
  }

  static func scan(
    folder: URL, limits: Limits = Limits(), expectedRoot: RootIdentity? = nil,
    cancelled: @Sendable () -> Bool = { false }
  ) throws -> SidebarCatalog {
    let root = folder.standardizedFileURL
    let descriptor = open(root.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(descriptor) }
    var rootMetadata = stat()
    guard fstat(descriptor, &rootMetadata) == 0 else { throw SidebarCatalogError.unavailable }
    if let expectedRoot {
      guard expectedRoot == RootIdentity(device: rootMetadata.st_dev, inode: rootMetadata.st_ino)
      else { throw SidebarCatalogError.unsafeFile }
    }
    let deadline = ProcessInfo.processInfo.systemUptime + limits.scanSeconds
    var visited = 0
    var files: [SidebarFile] = []
    var entries: [String: Entry] = [:]
    var totalBytes = 0
    var incomplete = false
    var skippedFiles = 0
    let extensions: Set<String> = ["md", "markdown", "mdown", "mkd", "txt"]

    func check() throws {
      if cancelled() { throw SidebarCatalogError.cancelled }
      if ProcessInfo.processInfo.systemUptime > deadline {
        throw SidebarCatalogError.scanTimedOut
      }
    }

    func walk(_ parent: Int32, _ components: [String]) throws {
      try check()
      guard components.count <= limits.depth else {
        incomplete = true
        return
      }
      let copy = dup(parent)
      guard copy >= 0, let directory = fdopendir(copy) else {
        if copy >= 0 { Darwin.close(copy) }
        skippedFiles += 1
        return
      }
      defer { closedir(directory) }
      var names: [String] = []
      while let item = readdir(directory) {
        try check()
        visited += 1
        guard visited <= limits.directoryEntries else {
          incomplete = true
          return
        }
        let name = withUnsafePointer(to: item.pointee.d_name) {
          $0.withMemoryRebound(to: CChar.self, capacity: Int(MAXNAMLEN) + 1) {
            String(validatingCString: $0)
          }
        }
        if let name, !name.hasPrefix(".") { names.append(name) }
      }
      names.sort { $0.localizedStandardCompare($1) == .orderedAscending }
      for name in names {
        try check()
        guard files.count < limits.files else {
          incomplete = true
          return
        }
        var metadata = stat()
        guard fstatat(parent, name, &metadata, AT_SYMLINK_NOFOLLOW) == 0 else {
          skippedFiles += 1
          continue
        }
        let kind = metadata.st_mode & S_IFMT
        let path = components + [name]
        if kind == S_IFDIR {
          let child = openat(parent, name, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
          if child >= 0 {
            defer { Darwin.close(child) }
            try walk(child, path)
          } else {
            skippedFiles += 1
          }
        } else if kind == S_IFREG,
          extensions.contains((name as NSString).pathExtension.lowercased())
        {
          guard metadata.st_size <= limits.fileBytes else {
            skippedFiles += 1
            continue
          }
          guard totalBytes + Int(metadata.st_size) <= limits.totalBytes else {
            incomplete = true
            continue
          }
          do {
            let read = try read(
              rootDescriptor: descriptor, components: path, maximum: limits.fileBytes,
              cancelled: cancelled)
            let data = read.data
            guard let text = decode(data) else {
              skippedFiles += 1
              continue
            }
            guard totalBytes + data.count <= limits.totalBytes else {
              incomplete = true
              continue
            }
            totalBytes += data.count
            let token = UUID().uuidString
            let displayText = text.first == "\u{FEFF}" ? String(text.dropFirst()) : text
            let summary = displayText.split(whereSeparator: \.isNewline).prefix(2)
              .map { String($0.prefix(140)) }.joined(separator: "\n")
            files.append(
              SidebarFile(
                id: token, name: name, relativePath: path.joined(separator: "/"), summary: summary))
            entries[token] = Entry(
              components: path, text: text, version: version(data), device: read.metadata.st_dev,
              inode: read.metadata.st_ino)
          } catch SidebarCatalogError.cancelled { throw SidebarCatalogError.cancelled } catch {
            skippedFiles += 1
          }
        }
      }
    }
    try walk(descriptor, [])
    try check()
    return SidebarCatalog(
      id: UUID().uuidString, root: root, files: files, incomplete: incomplete,
      skippedFiles: skippedFiles, entries: entries, limits: limits,
      rootDevice: rootMetadata.st_dev, rootInode: rootMetadata.st_ino)
  }

  func openFile(id fileID: String, catalogID: String, hit: SidebarSearchHit? = nil) throws
    -> OpenedFile
  {
    guard catalogID == id, let entry = entries[fileID] else { throw SidebarCatalogError.staleFile }
    let descriptor = open(root.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(descriptor) }
    var metadata = stat()
    guard fstat(descriptor, &metadata) == 0, metadata.st_dev == rootDevice,
      metadata.st_ino == rootInode
    else { throw SidebarCatalogError.staleFile }
    let read = try Self.read(
      rootDescriptor: descriptor, components: entry.components, maximum: limits.fileBytes)
    let data = read.data
    guard Self.decode(data) != nil else { throw SidebarCatalogError.invalidEncoding }
    guard read.metadata.st_dev == entry.device, read.metadata.st_ino == entry.inode,
      Self.version(data) == entry.version
    else { throw SidebarCatalogError.staleFile }
    var location: SidebarSearchLocation?
    if let hit {
      guard hit.fileID == fileID, hit.fileVersion == entry.version,
        hit.utf16Location >= 0, hit.utf16Length >= 0,
        hit.utf16Location <= entry.text.utf16.count,
        hit.utf16Length <= entry.text.utf16.count - hit.utf16Location
      else { throw SidebarCatalogError.staleFile }
      location = SidebarSearchLocation(
        utf16Location: hit.utf16Location, utf16Length: hit.utf16Length)
    }
    return OpenedFile(
      url: entry.components.reduce(root) { $0.appendingPathComponent($1) }, data: data,
      version: entry.version, location: location,
      modified: Date(
        timeIntervalSince1970: Double(read.metadata.st_mtimespec.tv_sec)
          + Double(read.metadata.st_mtimespec.tv_nsec) / 1_000_000_000),
      revalidation: { try self.openFile(id: fileID, catalogID: catalogID, hit: hit) })
  }

  static func version(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  func search(
    _ query: String, options: SidebarSearchOptions,
    cancelled: @Sendable () -> Bool = { false }
  ) throws -> SidebarSearchResult {
    if cancelled() { throw SidebarCatalogError.cancelled }
    guard !query.isEmpty else {
      return SidebarSearchResult(hits: [], truncated: incomplete || skippedFiles > 0)
    }
    guard query.utf16.count <= 2_000 else { throw SidebarCatalogError.invalidPattern }
    var pattern = options.regularExpression ? query : NSRegularExpression.escapedPattern(for: query)
    if options.wholeWord { pattern = "\\b(?:\(pattern))\\b" }
    let flags: NSRegularExpression.Options =
      options.caseSensitive
      ? [.useUnicodeWordBoundaries] : [.caseInsensitive, .useUnicodeWordBoundaries]
    guard let expression = try? NSRegularExpression(pattern: pattern, options: flags) else {
      throw SidebarCatalogError.invalidPattern
    }
    let deadline = ProcessInfo.processInfo.systemUptime + limits.searchSeconds
    var hits: [SidebarSearchHit] = []
    var truncated = incomplete || skippedFiles > 0
    var timedOut = false
    var wasCancelled = false
    for file in files {
      if cancelled() { throw SidebarCatalogError.cancelled }
      if ProcessInfo.processInfo.systemUptime > deadline {
        throw SidebarCatalogError.searchTimedOut
      }
      guard let entry = entries[file.id] else { continue }
      let text = entry.text
      expression.enumerateMatches(
        in: text, options: [.reportProgress], range: NSRange(text.startIndex..., in: text)
      ) { match, _, stop in
        if cancelled() {
          wasCancelled = true
          stop.pointee = true
          return
        }
        if ProcessInfo.processInfo.systemUptime > deadline {
          timedOut = true
          stop.pointee = true
          return
        }
        guard let match else { return }
        guard hits.count < limits.searchHits else {
          truncated = true
          stop.pointee = true
          return
        }
        // Regex offsets may be inside a grapheme (e.g. a combining accent).
        // NSString keeps those valid UTF-16 hits instead of silently discarding them.
        let source = text as NSString
        let prefix = source.substring(to: match.range.location)
        let line = prefix.reduce(into: 1) { if $1.isNewline { $0 += 1 } }
        let lineRange = source.lineRange(for: NSRange(location: match.range.location, length: 0))
        let before = String(
          source.substring(
            with: NSRange(
              location: lineRange.location,
              length: match.range.location - lineRange.location)
          ).suffix(50))
        let after =
          source.substring(from: match.range.location).prefix(120)
          .split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
        hits.append(
          SidebarSearchHit(
            fileID: file.id, line: line, snippet: before + after,
            hitID: UUID().uuidString, fileVersion: entry.version,
            utf16Location: match.range.location, utf16Length: match.range.length))
      }
      if wasCancelled { throw SidebarCatalogError.cancelled }
      if timedOut { throw SidebarCatalogError.searchTimedOut }
      if truncated && hits.count >= limits.searchHits { break }
    }
    if cancelled() { throw SidebarCatalogError.cancelled }
    return SidebarSearchResult(hits: hits, truncated: truncated)
  }

  private static func decode(_ data: Data) -> String? {
    guard !data.starts(with: [0xFF, 0xFE]), !data.starts(with: [0xFE, 0xFF]),
      !data.starts(with: [0x00, 0x00, 0xFE, 0xFF])
    else { return nil }
    guard String(data: data, encoding: .utf8) != nil else { return nil }
    // Foundation's String(data:encoding:) consumes a leading UTF-8 BOM. Validate
    // with it, then decode exact code units so search ranges remain raw offsets.
    return String(decoding: data, as: UTF8.self)
  }

  private static func read(
    rootDescriptor: Int32, components: [String], maximum: Int,
    cancelled: @Sendable () -> Bool = { false }
  ) throws -> (data: Data, metadata: stat) {
    var current = dup(rootDescriptor)
    guard current >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(current) }
    for (index, name) in components.enumerated() {
      if cancelled() { throw SidebarCatalogError.cancelled }
      guard !name.isEmpty, name != ".", name != "..", !name.contains("/") else {
        throw SidebarCatalogError.unsafeFile
      }
      let isFile = index == components.count - 1
      let next = openat(
        current, name, O_RDONLY | O_CLOEXEC | O_NOFOLLOW | (isFile ? O_NONBLOCK : O_DIRECTORY))
      guard next >= 0 else { throw SidebarCatalogError.unsafeFile }
      Darwin.close(current)
      current = next
    }
    var metadata = stat()
    guard fstat(current, &metadata) == 0, metadata.st_mode & S_IFMT == S_IFREG else {
      throw SidebarCatalogError.unsafeFile
    }
    guard metadata.st_size <= maximum else { throw SidebarCatalogError.sizeLimit }
    var data = Data()
    var bytes = [UInt8](repeating: 0, count: 32_768)
    while true {
      if cancelled() { throw SidebarCatalogError.cancelled }
      let count = Darwin.read(current, &bytes, bytes.count)
      if count < 0 {
        if errno == EINTR { continue }
        throw SidebarCatalogError.unsafeFile
      }
      if count == 0 {
        var after = stat()
        guard fstat(current, &after) == 0, metadata.st_size == after.st_size,
          metadata.st_mtimespec.tv_sec == after.st_mtimespec.tv_sec,
          metadata.st_mtimespec.tv_nsec == after.st_mtimespec.tv_nsec,
          metadata.st_ctimespec.tv_sec == after.st_ctimespec.tv_sec,
          metadata.st_ctimespec.tv_nsec == after.st_ctimespec.tv_nsec,
          data.count == after.st_size
        else { throw SidebarCatalogError.staleFile }
        return (data, after)
      }
      guard data.count + count <= maximum else { throw SidebarCatalogError.sizeLimit }
      data.append(contentsOf: bytes.prefix(count))
    }
  }
}
