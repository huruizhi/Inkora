// main.swift — INK-PROT-011 签名 Sandbox headless 探针
//
// 独立 bundleID com.huruizhi.Inkora.AssetPrototype，唯一 entitlement 为
// com.apple.security.app-sandbox。无 GUI，不访问用户真实内容：
// - 仅当 NSHomeDirectory() 精确匹配预期的独立容器路径（getpwuid 真实 HOME +
//   /Library/Containers/<bundleID>/Data）时，才向容器内唯一 run ID 会话子目录
//   写入并读回 fixture；沙盒未激活时绝不写任何 HOME 位置，只报告。
// - 容器外：仅尝试读取控制脚本以 argv 传入的临时外部 fixture，记录实际 errno。
// 输出机器可读 JSON 到 stdout；不把普通进程结果冒充 Sandbox 证据。

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

struct ContainerWrite: Codable {
    let attempted: Bool
    let ok: Bool?
    let error: String?
}

struct ProbeReport: Codable {
    let probeVersion: String
    let runID: String
    let processPath: String
    let bundleID: String
    let containerHome: String // NSHomeDirectory()
    let expectedContainerHome: String // 真实 HOME 推导的预期容器路径
    let realHomeFromPasswd: String // getpwuid，不受沙盒改写影响
    let inheritedHomeEnv: String
    let sandboxActive: Bool
    let containerWrite: ContainerWrite
    let containerFixture: FileAccess
    let externalFixture: FileAccess
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
let runID = args.count > 1 ? args[1] : ""
let externalPath = args.count > 2 ? args[2] : ""

let bundleID = "com.huruizhi.Inkora.AssetPrototype"
let home = NSHomeDirectory()
let inheritedHome = ProcessInfo.processInfo.environment["HOME"] ?? ""
// 真实 HOME 从 passwd 取：沙盒激活时环境 HOME/NSHomeDirectory 都会被 secinit 改写
var realHome = inheritedHome
if let pw = getpwuid(getuid()) {
    realHome = String(cString: pw.pointee.pw_dir)
}
let expectedContainer = realHome + "/Library/Containers/" + bundleID + "/Data"
// 沙盒激活判定：NSHomeDirectory() 必须精确等于预期独立容器路径
let sandboxActive = !runID.isEmpty && home == expectedContainer

// 容器内 fixture：仅在确认预期容器后才写，且只写本次 run ID 子目录
var containerWrite: ContainerWrite
var fixturePath = ""
if sandboxActive {
    let dir = URL(fileURLWithPath: home, isDirectory: true)
        .appendingPathComponent("probe-fixtures", isDirectory: true)
        .appendingPathComponent(runID, isDirectory: true)
    do {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let f = dir.appendingPathComponent("容器 fixture.bin")
        try Data("INK-PROT-011 sandbox probe fixture run=\(runID)".utf8).write(to: f)
        fixturePath = f.path
        containerWrite = .init(attempted: true, ok: true, error: nil)
    } catch {
        containerWrite = .init(attempted: true, ok: false, error: String(describing: error))
    }
} else {
    // 未激活：不写任何 HOME 位置，避免污染真实用户目录
    containerWrite = .init(attempted: false, ok: nil, error: "sandbox-inactive: container write skipped")
}

let report = ProbeReport(
    probeVersion: "INK-PROT-011 AssetPrototype probe 0.2",
    runID: runID,
    processPath: CommandLine.arguments[0],
    bundleID: bundleID,
    containerHome: home,
    expectedContainerHome: expectedContainer,
    realHomeFromPasswd: realHome,
    inheritedHomeEnv: inheritedHome,
    sandboxActive: sandboxActive,
    containerWrite: containerWrite,
    containerFixture: fixturePath.isEmpty
        ? .init(path: "", ok: false, errno: nil, errnoMessage: "not attempted (sandbox inactive)",
                sha256: nil, byteCount: nil)
        : posixRead(fixturePath),
    externalFixture: externalPath.isEmpty
        ? .init(path: "", ok: false, errno: nil, errnoMessage: "no external path argument", sha256: nil, byteCount: nil)
        : posixRead(externalPath))

let enc = JSONEncoder()
enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
FileHandle.standardOutput.write(try! enc.encode(report))
print()
