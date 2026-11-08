// main.swift — INK-PROT-011 签名 Sandbox headless 探针
//
// 独立 bundleID com.huruizhi.Inkora.AssetPrototype，唯一 entitlement 为
// com.apple.security.app-sandbox。不使用 GUI，不访问用户真实内容：
// - 容器内：在自身容器写入并读回 fixture（应成功）。
// - 容器外：仅尝试读取控制脚本以 argv 传入的临时外部 fixture（应被 OS 拒绝）。
// 输出机器可读 JSON 到 stdout。自行判定 sandbox 是否激活；未激活时如实报告，
// 不把普通进程结果冒充 Sandbox 证据。

import Foundation
import CryptoKit

struct FileAccess: Codable {
    let path: String
    let ok: Bool
    let errno: Int?
    let errnoMessage: String?
    let sha256: String?
    let byteCount: Int?
}

struct ProbeReport: Codable {
    let probeVersion: String
    let processPath: String
    let bundleIDHint: String
    let containerHome: String
    let inheritedHomeEnv: String
    let sandboxActive: Bool
    let sandboxEvidence: String
    let containerWrite: Result
    let containerFixture: FileAccess
    let externalFixture: FileAccess

    struct Result: Codable {
        let ok: Bool
        let error: String?
    }
}

func posixRead(_ path: String) -> FileAccess {
    let fd = open(path, O_RDONLY)
    if fd < 0 {
        return .init(path: path, ok: false, errno: Int(errno),
                     errnoMessage: String(cString: strerror(errno)), sha256: nil, byteCount: nil)
    }
    var data = Data()
    var buf = [UInt8](repeating: 0, count: 65536)
    var readErrno: Int32? = nil
    while true {
        let n = read(fd, &buf, buf.count)
        if n > 0 { data.append(contentsOf: buf[0..<n]) }
        else { if n < 0 { readErrno = errno }; break }
    }
    close(fd)
    if let e = readErrno {
        return .init(path: path, ok: false, errno: Int(e),
                     errnoMessage: String(cString: strerror(e)), sha256: nil, byteCount: nil)
    }
    return .init(path: path, ok: true, errno: nil, errnoMessage: nil,
                 sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
                 byteCount: data.count)
}

let args = CommandLine.arguments
let externalPath = args.count > 1 ? args[1] : ""

let home = NSHomeDirectory()
let inheritedHome = ProcessInfo.processInfo.environment["HOME"] ?? ""
// secinit 会把 HOME 重定向到 /Users/<u>/Library/Containers/<id>/Data，且同步改写
// 进程环境 HOME，因此不能靠 NSHomeDirectory() != env HOME 判定；以容器路径形态为准，
// 外部读取 errno 作为主证据。
let sandboxActive = home.contains("/Library/Containers/") && home.hasSuffix("/Data")

// 容器内 fixture：写入后读回
let fixtureDir = URL(fileURLWithPath: home, isDirectory: true)
    .appendingPathComponent("probe-fixtures", isDirectory: true)
try? FileManager.default.createDirectory(at: fixtureDir, withIntermediateDirectories: true)
let fixture = fixtureDir.appendingPathComponent("容器 fixture.bin")
var writeResult: ProbeReport.Result
do {
    try Data("INK-PROT-011 sandbox probe fixture".utf8).write(to: fixture)
    writeResult = .init(ok: true, error: nil)
} catch {
    writeResult = .init(ok: false, error: String(describing: error))
}

let report = ProbeReport(
    probeVersion: "INK-PROT-011 AssetPrototype probe 0.1",
    processPath: CommandLine.arguments[0],
    bundleIDHint: "com.huruizhi.Inkora.AssetPrototype",
    containerHome: home,
    inheritedHomeEnv: inheritedHome,
    sandboxActive: sandboxActive,
    sandboxEvidence: "NSHomeDirectory()=\(home); HOME env=\(inheritedHome); sandboxActive=\(sandboxActive)",
    containerWrite: writeResult,
    containerFixture: posixRead(fixture.path),
    externalFixture: externalPath.isEmpty
        ? .init(path: "", ok: false, errno: nil, errnoMessage: "no external path argument", sha256: nil, byteCount: nil)
        : posixRead(externalPath))

let enc = JSONEncoder()
enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
FileHandle.standardOutput.write(try! enc.encode(report))
print()
