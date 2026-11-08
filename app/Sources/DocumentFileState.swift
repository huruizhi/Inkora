import Foundation

// Exact bytes are the content fingerprint: timestamps alone miss atomic replacements
// and tools that restore the original modification date.
struct DocumentDiskVersion: Equatable, Sendable {
  let data: Data
  let modified: Date?

  init(url: URL) throws {
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    data = try Data(contentsOf: url)
    modified = try url.resourceValues(forKeys: [.contentModificationDateKey])
      .contentModificationDate
  }
}

enum DocumentFileState: String, Error, LocalizedError {
  case current, readOnly, externalChange, deleted, moved, unsupportedEncoding, bareCR

  var errorDescription: String? {
    switch self {
    case .current: "文件可保存"
    case .readOnly: "文件为只读，请另存为"
    case .externalChange: "文件已在应用外修改"
    case .deleted: "文件已删除或移入废纸篓，请另存为"
    case .moved: "文件已移动，已跟随新路径"
    case .bareCR: "含 bare CR 换行，整篇只读；请显式转换为 LF 后编辑"
    case .unsupportedEncoding: "文件编码不受支持，只读打开"
    }
  }

  static func isWritable(_ url: URL, checkAccess: Bool = true) throws -> Bool {
    let manager = FileManager.default
    let values = try? url.resourceValues(forKeys: [.volumeIsReadOnlyKey])
    let attributes = try manager.attributesOfItem(atPath: url.path)
    let mode = (attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0
    return (attributes[.immutable] as? NSNumber)?.boolValue != true
      && values?.volumeIsReadOnly != true && mode & 0o222 != 0
      && (!checkAccess || manager.isWritableFile(atPath: url.path))
  }
}
