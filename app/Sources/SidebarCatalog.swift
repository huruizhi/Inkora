import Darwin
import Foundation

struct SidebarFile: Codable, Equatable, Sendable {
  let id: String
  let name: String
  let relativePath: String
  let summary: String
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
  case cancelled

  var errorDescription: String? {
    switch self {
    case .unavailable: "无法读取所选文件夹，请重新选择。"
    case .staleFile: "文档列表已更新，请从当前列表重新打开。"
    case .unsafeFile: "文件已移动或为符号链接，请刷新列表。"
    case .sizeLimit: "文件超过侧栏读取上限，请通过文件菜单单独打开。"
    case .invalidEncoding: "文件不是有效UTF-8文本，未参与侧栏搜索。"
    case .invalidPattern: "正则表达式无效。"
    case .searchTimedOut: "搜索超时，请缩小范围或简化正则表达式。"
    case .cancelled: "搜索已取消。"
    }
  }
}

/// An immutable, authorized-folder index. Web receives opaque file IDs, never paths
/// it can substitute into a native read. Every read walks from the root descriptor.
struct SidebarCatalog: Sendable {
  struct Limits: Sendable {
    var files = 10_000
    var fileBytes = 5 * 1024 * 1024
    var totalBytes = 50 * 1024 * 1024
    var depth = 32
    var searchHits = 1_000
    var searchSeconds: TimeInterval = 2
  }

  struct OpenedFile: Sendable {
    let url: URL
    let data: Data
  }

  private struct Entry: Sendable {
    let components: [String]
    let text: String
  }

  let id: String
  let root: URL
  let files: [SidebarFile]
  let incomplete: Bool
  let skippedFiles: Int
  private let entries: [String: Entry]
  private let limits: Limits

  static func scan(
    folder: URL, limits: Limits = Limits(),
    cancelled: @Sendable () -> Bool = { false }
  ) throws -> SidebarCatalog {
    let root = folder.standardizedFileURL
    let descriptor = open(root.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(descriptor) }
    var files: [SidebarFile] = []
    var entries: [String: Entry] = [:]
    var totalBytes = 0
    var incomplete = false
    var skippedFiles = 0
    let extensions: Set<String> = ["md", "markdown", "mdown", "mkd", "txt"]

    func walk(_ parent: Int32, _ components: [String]) throws {
      if cancelled() { throw SidebarCatalogError.cancelled }
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
        if cancelled() { throw SidebarCatalogError.cancelled }
        let name = withUnsafePointer(to: item.pointee.d_name) {
          $0.withMemoryRebound(to: CChar.self, capacity: Int(MAXNAMLEN) + 1) {
            String(validatingCString: $0)
          }
        }
        if let name, !name.hasPrefix(".") { names.append(name) }
      }
      names.sort { $0.localizedStandardCompare($1) == .orderedAscending }
      for name in names {
        if cancelled() { throw SidebarCatalogError.cancelled }
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
            let data = try read(
              rootDescriptor: descriptor, components: path, maximum: limits.fileBytes)
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
            let summary = text.split(whereSeparator: \.isNewline).prefix(2)
              .map { String($0.prefix(140)) }.joined(separator: "\n")
            files.append(
              SidebarFile(
                id: token, name: name, relativePath: path.joined(separator: "/"), summary: summary))
            entries[token] = Entry(components: path, text: text)
          } catch { skippedFiles += 1 }
        }
      }
    }
    try walk(descriptor, [])
    return SidebarCatalog(
      id: UUID().uuidString, root: root, files: files, incomplete: incomplete,
      skippedFiles: skippedFiles, entries: entries, limits: limits)
  }

  func openFile(id fileID: String, catalogID: String) throws -> OpenedFile {
    guard catalogID == id, let entry = entries[fileID] else { throw SidebarCatalogError.staleFile }
    let descriptor = open(root.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(descriptor) }
    let data = try Self.read(
      rootDescriptor: descriptor, components: entry.components, maximum: limits.fileBytes)
    guard Self.decode(data) != nil else { throw SidebarCatalogError.invalidEncoding }
    return OpenedFile(
      url: entry.components.reduce(root) { $0.appendingPathComponent($1) }, data: data)
  }

  func search(
    _ query: String, options: SidebarSearchOptions,
    cancelled: @Sendable () -> Bool = { false }
  ) throws -> SidebarSearchResult {
    guard !query.isEmpty else { return SidebarSearchResult(hits: [], truncated: incomplete) }
    guard query.utf16.count <= 2_000 else { throw SidebarCatalogError.invalidPattern }
    var pattern = options.regularExpression ? query : NSRegularExpression.escapedPattern(for: query)
    if options.wholeWord { pattern = "\\b(?:\(pattern))\\b" }
    let flags: NSRegularExpression.Options =
      options.caseSensitive
      ? [.useUnicodeWordBoundaries] : [.caseInsensitive, .useUnicodeWordBoundaries]
    guard let expression = try? NSRegularExpression(pattern: pattern, options: flags) else {
      throw SidebarCatalogError.invalidPattern
    }
    let deadline = Date().addingTimeInterval(limits.searchSeconds)
    var hits: [SidebarSearchHit] = []
    var truncated = incomplete
    var timedOut = false
    var wasCancelled = false
    for file in files {
      if cancelled() { throw SidebarCatalogError.cancelled }
      if Date() > deadline { throw SidebarCatalogError.searchTimedOut }
      guard let text = entries[file.id]?.text else { continue }
      expression.enumerateMatches(
        in: text, options: [.reportProgress], range: NSRange(text.startIndex..., in: text)
      ) { match, _, stop in
        if cancelled() {
          wasCancelled = true
          stop.pointee = true
          return
        }
        if Date() > deadline {
          timedOut = true
          stop.pointee = true
          return
        }
        guard let match, let range = Range(match.range, in: text) else { return }
        guard hits.count < limits.searchHits else {
          truncated = true
          stop.pointee = true
          return
        }
        let prefix = text[..<range.lowerBound]
        let line = prefix.reduce(into: 1) { if $1.isNewline { $0 += 1 } }
        let lineStart =
          prefix.lastIndex(where: \.isNewline).map { prefix.index(after: $0) } ?? prefix.startIndex
        let before = String(prefix[lineStart...].suffix(50))
        let after =
          text[range.lowerBound...].prefix(120).split(whereSeparator: \.isNewline).first.map(
            String.init) ?? ""
        hits.append(SidebarSearchHit(fileID: file.id, line: line, snippet: before + after))
      }
      if wasCancelled { throw SidebarCatalogError.cancelled }
      if timedOut { throw SidebarCatalogError.searchTimedOut }
      if truncated && hits.count >= limits.searchHits { break }
    }
    return SidebarSearchResult(hits: hits, truncated: truncated)
  }

  private static func decode(_ data: Data) -> String? {
    guard !data.starts(with: [0xFF, 0xFE]), !data.starts(with: [0xFE, 0xFF]),
      !data.starts(with: [0x00, 0x00, 0xFE, 0xFF])
    else { return nil }
    guard var text = String(data: data, encoding: .utf8) else { return nil }
    if text.first == "\u{FEFF}" { text.removeFirst() }
    return text
  }

  private static func read(rootDescriptor: Int32, components: [String], maximum: Int) throws -> Data
  {
    var current = dup(rootDescriptor)
    guard current >= 0 else { throw SidebarCatalogError.unavailable }
    defer { Darwin.close(current) }
    for (index, name) in components.enumerated() {
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
      let count = Darwin.read(current, &bytes, bytes.count)
      if count < 0 {
        if errno == EINTR { continue }
        throw SidebarCatalogError.unsafeFile
      }
      if count == 0 { return data }
      guard data.count + count <= maximum else { throw SidebarCatalogError.sizeLimit }
      data.append(contentsOf: bytes.prefix(count))
    }
  }
}
