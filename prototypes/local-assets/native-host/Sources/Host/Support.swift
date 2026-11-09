import CryptoKit
import Darwin
import Foundation

let prototypeBundleID = "com.huruizhi.Inkora.LocalAssetHostPrototype"

struct FixtureLocator: Codable {
    let schemaVersion: Int
    let runID: UUID
    let fixtureRootPath: String
    let markdownRelativePath: String
    let markdownSHA256: String
    let imageEncodedRelativePath: String
    let manifestSHA256: String

    var fixtureRoot: URL { URL(fileURLWithPath: fixtureRootPath, isDirectory: true) }
    var runRoot: URL { fixtureRoot.deletingLastPathComponent() }
}

struct FixtureFileRecord: Codable {
    let relativePath: String
    let kind: String
    let sha256: String?
    let expected: String
}

struct FixtureManifest: Codable {
    let schemaVersion: Int
    let runID: UUID
    let createdBy: String
    let files: [FixtureFileRecord]
}

func dataSHA256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

func applicationSupportDirectory() throws -> URL {
    let base = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
    )
    let result = base.appendingPathComponent("InkoraLocalAssetHost", isDirectory: true)
    try FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
    return result
}

final class EventLog {
    private let queue = DispatchQueue(label: "inkora.prototype.event-log")
    private let fileURL: URL
    var onLine: ((String) -> Void)?

    init() throws {
        fileURL = try applicationSupportDirectory().appendingPathComponent("events.jsonl")
        if !FileManager.default.fileExists(atPath: fileURL.path) {
            FileManager.default.createFile(atPath: fileURL.path, contents: nil)
        }
    }

    func emit(_ type: String, _ fields: [String: String] = [:]) {
        var object = fields
        object["type"] = type
        object["timestamp"] = ISO8601DateFormatter().string(from: Date())
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return }
        queue.async {
            if let handle = try? FileHandle(forWritingTo: self.fileURL) {
                defer { try? handle.close() }
                _ = try? handle.seekToEnd()
                try? handle.write(contentsOf: data + Data([0x0A]))
                try? handle.synchronize()
            }
            DispatchQueue.main.async { self.onLine?(text) }
        }
    }
}

enum NativeReadStatus: String {
    case success
    case missing
    case denied
    case symlink
    case invalid
    case ioError = "io-error"
}

struct NativeReadResult {
    let status: NativeReadStatus
    let data: Data?
    let errnoValue: Int32?
    let detail: String

    var sha256: String? { data.map(dataSHA256) }
}

func readFileNoFollow(root: URL, path: SafeRelativePath, maximumBytes: Int = 10 * 1024 * 1024) -> NativeReadResult {
    readRelativeNoFollow(root: root, components: path.components, maximumBytes: maximumBytes)
}

func readAbsoluteFileNoFollow(_ url: URL, maximumBytes: Int = 10 * 1024 * 1024) -> NativeReadResult {
    let fd = open(url.path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
    guard fd >= 0 else { return readFailure(errno, context: "open-selected-file") }
    defer { close(fd) }
    return readOpenedRegularFile(fd: fd, maximumBytes: maximumBytes)
}

func readRelativeNoFollow(root: URL, components: [String], maximumBytes: Int = 10 * 1024 * 1024) -> NativeReadResult {
    var directoryFD = open(root.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard directoryFD >= 0 else { return readFailure(errno, context: "open-root") }
    defer { close(directoryFD) }

    for component in components.dropLast() {
        let nextFD = openat(directoryFD, component, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
        guard nextFD >= 0 else { return readFailure(errno, context: "open-component") }
        close(directoryFD)
        directoryFD = nextFD
    }

    guard let final = components.last else {
        return NativeReadResult(status: .invalid, data: nil, errnoValue: nil, detail: "empty-path")
    }
    let fd = openat(directoryFD, final, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
    guard fd >= 0 else { return readFailure(errno, context: "open-final") }
    defer { close(fd) }

    return readOpenedRegularFile(fd: fd, maximumBytes: maximumBytes)
}

private func readOpenedRegularFile(fd: Int32, maximumBytes: Int) -> NativeReadResult {
    var info = stat()
    guard fstat(fd, &info) == 0 else { return readFailure(errno, context: "fstat") }
    guard (info.st_mode & S_IFMT) == S_IFREG else {
        return NativeReadResult(status: .invalid, data: nil, errnoValue: nil, detail: "not-regular-file")
    }
    guard info.st_size >= 0, info.st_size <= maximumBytes else {
        return NativeReadResult(status: .invalid, data: nil, errnoValue: nil, detail: "size-limit")
    }

    var data = Data(count: Int(info.st_size))
    let count = data.withUnsafeMutableBytes { bytes -> Int in
        guard let address = bytes.baseAddress else { return 0 }
        var offset = 0
        while offset < bytes.count {
            let readCount = Darwin.read(fd, address.advanced(by: offset), bytes.count - offset)
            if readCount < 0 { return -1 }
            if readCount == 0 { break }
            offset += readCount
        }
        return offset
    }
    guard count >= 0 else { return readFailure(errno, context: "read") }
    guard count == data.count else {
        return NativeReadResult(status: .ioError, data: nil, errnoValue: nil, detail: "short-read")
    }
    return NativeReadResult(status: .success, data: data, errnoValue: nil, detail: "read-ok")
}

private func readFailure(_ value: Int32, context: String) -> NativeReadResult {
    let status: NativeReadStatus
    switch value {
    case ENOENT: status = .missing
    case EACCES, EPERM: status = .denied
    case ELOOP: status = .symlink
    default: status = .ioError
    }
    return NativeReadResult(status: status, data: nil, errnoValue: value, detail: "\(context):\(String(cString: strerror(value)))")
}

func detectedMIME(_ data: Data, extension ext: String) -> String? {
    if data.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), ext.lowercased() == "png" {
        return "image/png"
    }
    if data.starts(with: [0xFF, 0xD8, 0xFF]), ["jpg", "jpeg"].contains(ext.lowercased()) {
        return "image/jpeg"
    }
    return nil
}

func sandboxIsActive() -> Bool {
    guard let account = getpwuid(getuid()) else { return false }
    let realHome = String(cString: account.pointee.pw_dir)
    let expected = realHome + "/Library/Containers/\(prototypeBundleID)/Data"
    return URL(fileURLWithPath: NSHomeDirectory()).standardizedFileURL.path == URL(fileURLWithPath: expected).standardizedFileURL.path
}
