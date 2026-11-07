import Foundation

// Exact bytes are the content fingerprint: timestamps alone miss atomic replacements
// and tools that restore the original modification date.
struct DocumentDiskVersion: Equatable, Sendable {
  let data: Data
  let modified: Date?

  init(url: URL) throws {
    data = try Data(contentsOf: url)
    modified = try url.resourceValues(forKeys: [.contentModificationDateKey])
      .contentModificationDate
  }
}

enum DocumentFileState: String, Error, LocalizedError {
  case current, readOnly, externalChange, deleted, moved

  var errorDescription: String? {
    switch self {
    case .current: "文件可保存"
    case .readOnly: "文件为只读，请另存为"
    case .externalChange: "文件已在应用外修改"
    case .deleted: "文件已删除或移入废纸篓，请另存为"
    case .moved: "文件已移动，已跟随新路径"
    }
  }

  static func isWritable(_ url: URL) throws -> Bool {
    let manager = FileManager.default
    let values = try url.resourceValues(forKeys: [.isUserImmutableKey, .volumeIsReadOnlyKey])
    let attributes = try manager.attributesOfItem(atPath: url.path)
    let mode = (attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0
    return values.isUserImmutable != true && values.volumeIsReadOnly != true
      && mode & 0o222 != 0 && manager.isWritableFile(atPath: url.path)
  }
}
