// PersistentRecovery.swift — INK-PROT-021 跨真实进程中断恢复原型
//
// 这是独立 scratch 原型，不是生产实现。它用版本化 manifest + append-only
// event log 记录未命名草稿、资源发布与 Markdown 提交的可审计状态。恢复入口只读：
// 不覆盖目标、不重试提交、不删除 staging/孤儿/其它会话资源。

import Foundation
import CryptoKit
import Darwin

private let schemaVersion = 1
private let fm = FileManager.default

private func sha(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func read(_ url: URL) -> Data? { try? Data(contentsOf: url) }

private func isUUID(_ value: String) -> Bool {
    guard let u = UUID(uuidString: value) else { return false }
    return u.uuidString.lowercased() == value.lowercased()
}

private func isSHA256(_ value: String) -> Bool {
    value.count == 64 && value.allSatisfy { $0.isHexDigit }
}

private func isSafeRelative(_ value: String) -> Bool {
    guard !value.isEmpty, !value.hasPrefix("/"), !value.contains("\0") else { return false }
    let parts = value.split(separator: "/", omittingEmptySubsequences: false)
    return !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." })
}

private func inside(root: URL, relative: String) -> URL? {
    guard isSafeRelative(relative) else { return nil }
    let rootPath = root.standardizedFileURL.path
    var current = root.standardizedFileURL
    let parts = relative.split(separator: "/").map(String.init)
    for (index, part) in parts.enumerated() {
        current.appendPathComponent(part)
        // 任何已存在的路径组件都不得是符号链接。末尾不存在是合法的待写目标。
        if fm.fileExists(atPath: current.path) || index < parts.count - 1 {
            if (try? fm.destinationOfSymbolicLink(atPath: current.path)) != nil { return nil }
        }
    }
    let path = current.standardizedFileURL.path
    guard path == rootPath || path.hasPrefix(rootPath + "/") else { return nil }
    return current
}

private func fsyncDirectory(_ url: URL) throws {
    let fd = open(url.path, O_RDONLY)
    guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    defer { close(fd) }
    guard fsync(fd) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
}

private func writeFully(_ data: Data, to url: URL) throws {
    let fd = open(url.path, O_WRONLY | O_CREAT | O_TRUNC, S_IRUSR | S_IWUSR)
    guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    defer { close(fd) }
    try data.withUnsafeBytes { raw in
        var offset = 0
        while offset < raw.count {
            let count = Darwin.write(fd, raw.baseAddress!.advanced(by: offset), raw.count - offset)
            guard count > 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
            offset += count
        }
    }
    guard fsync(fd) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
}

private func atomicDurableWrite(_ data: Data, to url: URL) throws {
    let parent = url.deletingLastPathComponent()
    try fm.createDirectory(at: parent, withIntermediateDirectories: true)
    let temp = parent.appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
    do {
        try writeFully(data, to: temp)
        guard rename(temp.path, url.path) == 0 else {
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
        }
        try fsyncDirectory(parent)
    } catch {
        try? fm.removeItem(at: temp)
        throw error
    }
}

private struct AssetRecord: Codable {
    var name: String
    var draftRelativePath: String
    var sourceRelativePath: String?
    var targetRelativePath: String
    var sha256: String
    var byteCount: Int
    var ownership: String
    var publishState: String
}

private struct Manifest: Codable {
    var schemaVersion: Int
    var sessionID: String
    var operationID: String
    var operation: String
    var checkpoint: String
    var dirty: Bool
    var saved: Bool
    var originalMarkdown: Data
    var originalMarkdownSHA256: String
    var sourceRelativePath: String?
    var sourceBaselineSHA256: String?
    var targetRelativePath: String
    var targetBaselineSHA256: String?
    var assets: [AssetRecord]
    var createdAt: String
    var updatedAt: String
}

private struct Event: Codable {
    var schemaVersion: Int
    var sessionID: String
    var operationID: String
    var sequence: Int
    var kind: String
    var phase: String
    var relativePath: String?
    var sha256: String?
    var ownership: String?
    var at: String
}

private final class PersistentSession {
    let root: URL
    let directory: URL
    let manifestURL: URL
    let eventsURL: URL
    var manifest: Manifest
    private var sequence = 0

    init(root: URL, operation: String, sourceRelativePath: String?, targetRelativePath: String,
         markdown: Data, targetBaseline: String?) throws {
        let sid = UUID().uuidString.lowercased()
        let oid = UUID().uuidString.lowercased()
        self.root = root
        directory = root.appendingPathComponent("recovery/\(sid)", isDirectory: true)
        manifestURL = directory.appendingPathComponent("manifest.json")
        eventsURL = directory.appendingPathComponent("events.jsonl")
        try fm.createDirectory(at: directory.appendingPathComponent("imports", isDirectory: true),
                               withIntermediateDirectories: true)
        let now = ISO8601DateFormatter().string(from: Date())
        let sourceSHA = sourceRelativePath.flatMap { inside(root: root, relative: $0) }.flatMap(read).map(sha)
        manifest = Manifest(schemaVersion: schemaVersion, sessionID: sid, operationID: oid,
                            operation: operation, checkpoint: "created", dirty: true, saved: false,
                            originalMarkdown: markdown, originalMarkdownSHA256: sha(markdown),
                            sourceRelativePath: sourceRelativePath, sourceBaselineSHA256: sourceSHA,
                            targetRelativePath: targetRelativePath, targetBaselineSHA256: targetBaseline,
                            assets: [], createdAt: now, updatedAt: now)
        try checkpoint("created")
        try event(kind: "confirmed", phase: "session-created")
    }

    func event(kind: String, phase: String, relativePath: String? = nil,
               sha256: String? = nil, ownership: String? = nil) throws {
        sequence += 1
        let e = Event(schemaVersion: schemaVersion, sessionID: manifest.sessionID,
                      operationID: manifest.operationID, sequence: sequence, kind: kind,
                      phase: phase, relativePath: relativePath, sha256: sha256,
                      ownership: ownership, at: ISO8601DateFormatter().string(from: Date()))
        var data = try JSONEncoder().encode(e)
        data.append(0x0a)
        let fd = open(eventsURL.path, O_WRONLY | O_CREAT | O_APPEND, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
        defer { close(fd) }
        try data.withUnsafeBytes { raw in
            var offset = 0
            while offset < raw.count {
                let count = Darwin.write(fd, raw.baseAddress!.advanced(by: offset), raw.count - offset)
                guard count > 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
                offset += count
            }
        }
        guard fsync(fd) == 0 else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    }

    func checkpoint(_ value: String) throws {
        manifest.checkpoint = value
        manifest.updatedAt = ISO8601DateFormatter().string(from: Date())
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        var data = try enc.encode(manifest)
        data.append(0x0a)
        try atomicDurableWrite(data, to: manifestURL)
    }

    func importAsset(bytes: Data, preferredName: String, sourceRelativePath: String? = nil) throws {
        guard !preferredName.isEmpty, preferredName != ".", preferredName != "..",
              !preferredName.contains("/") else { throw NSError(domain: "invalid-name", code: 1) }
        let imports = directory.appendingPathComponent("imports", isDirectory: true)
        let base = (preferredName as NSString).deletingPathExtension
        let ext = (preferredName as NSString).pathExtension
        var name = preferredName
        var index = 1
        while fm.fileExists(atPath: imports.appendingPathComponent(name).path) {
            name = ext.isEmpty ? "\(base)-\(index)" : "\(base)-\(index).\(ext)"
            index += 1
        }
        let draftRel = "recovery/\(manifest.sessionID)/imports/\(name)"
        let targetDir = (manifest.targetRelativePath as NSString).deletingLastPathComponent
        let managedBase: String
        if manifest.operation == "saveAs", let source = manifest.sourceRelativePath {
            managedBase = ((source as NSString).lastPathComponent as NSString).deletingPathExtension
        } else {
            managedBase = ((manifest.targetRelativePath as NSString).lastPathComponent as NSString).deletingPathExtension
        }
        let targetRel = targetDir.isEmpty ? "\(managedBase).assets/\(name)" : "\(targetDir)/\(managedBase).assets/\(name)"
        try event(kind: "intent", phase: "import", relativePath: draftRel, sha256: sha(bytes), ownership: "session")
        try atomicDurableWrite(bytes, to: imports.appendingPathComponent(name))
        manifest.assets.append(AssetRecord(name: name, draftRelativePath: draftRel,
                                           sourceRelativePath: sourceRelativePath,
                                           targetRelativePath: targetRel, sha256: sha(bytes),
                                           byteCount: bytes.count, ownership: "session",
                                           publishState: "draft-only"))
        try checkpoint("imported")
        try event(kind: "confirmed", phase: "import", relativePath: draftRel, sha256: sha(bytes), ownership: "session")
    }

    func publishAssets(stopAfterFirst: (() throws -> Void)? = nil) throws {
        for index in manifest.assets.indices {
            let asset = manifest.assets[index]
            guard let source = inside(root: root, relative: asset.draftRelativePath),
                  let target = inside(root: root, relative: asset.targetRelativePath),
                  let bytes = read(source), sha(bytes) == asset.sha256 else {
                throw NSError(domain: "draft-asset-invalid", code: 1)
            }
            try event(kind: "intent", phase: "publish", relativePath: asset.targetRelativePath,
                      sha256: asset.sha256, ownership: "operation")
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            do {
                try fm.copyItem(at: source, to: target)
                try fsyncDirectory(target.deletingLastPathComponent())
                manifest.assets[index].publishState = "published-owned"
                manifest.assets[index].ownership = "operation"
                try event(kind: "confirmed", phase: "publish", relativePath: asset.targetRelativePath,
                          sha256: asset.sha256, ownership: "operation")
            } catch {
                if let existing = read(target), sha(existing) == asset.sha256 {
                    manifest.assets[index].publishState = "reused"
                    manifest.assets[index].ownership = "none"
                    try event(kind: "confirmed", phase: "publish-reused", relativePath: asset.targetRelativePath,
                              sha256: asset.sha256, ownership: "none")
                } else {
                    manifest.assets[index].publishState = "collision-kept"
                    try checkpoint("publish-blocked")
                    try event(kind: "blocked", phase: "publish-collision", relativePath: asset.targetRelativePath,
                              sha256: read(target).map(sha), ownership: "none")
                    throw error
                }
            }
            try checkpoint(index == 0 ? "partially-published" : "assets-published")
            if index == 0, manifest.assets.count > 1 { try stopAfterFirst?() }
        }
    }

    func commitMarkdown() throws {
        guard let target = inside(root: root, relative: manifest.targetRelativePath) else {
            throw NSError(domain: "unsafe-target", code: 1)
        }
        let currentSHA = read(target).map(sha)
        guard currentSHA == manifest.targetBaselineSHA256 else {
            try event(kind: "blocked", phase: "target-baseline-changed",
                      relativePath: manifest.targetRelativePath, sha256: currentSHA)
            try checkpoint("target-changed")
            throw NSError(domain: "target-baseline-changed", code: 1)
        }
        try event(kind: "intent", phase: "markdown-commit", relativePath: manifest.targetRelativePath,
                  sha256: manifest.originalMarkdownSHA256, ownership: "operation")
        try atomicDurableWrite(manifest.originalMarkdown, to: target)
        try event(kind: "confirmed", phase: "markdown-commit", relativePath: manifest.targetRelativePath,
                  sha256: manifest.originalMarkdownSHA256, ownership: "operation")
        try checkpoint("markdown-committed-unconfirmed")
    }

    func confirmSaved() throws {
        try event(kind: "intent", phase: "final-confirm")
        manifest.saved = true
        manifest.dirty = false
        try checkpoint("saved")
        try event(kind: "confirmed", phase: "final-confirm")
    }
}

private struct AuditAsset: Codable {
    var name: String
    var expectedSHA256: String
    var draftStatus: String
    var sourceStatus: String?
    var targetStatus: String
    var ownership: String
}

private struct AuditSession: Codable {
    var sessionID: String
    var operationID: String?
    var accepted: Bool
    var status: String
    var reason: String
    var checkpoint: String?
    var dirty: Bool
    var saved: Bool
    var markdownSHA256: String?
    var targetObservedSHA256: String?
    var sourceObservedSHA256: String?
    var eventCount: Int
    var assets: [AuditAsset]
    var preservation: String
}

private struct AuditReport: Codable {
    var schemaVersion: Int
    var root: String
    var mode: String
    var sessions: [AuditSession]
    var rejectedEntries: [String]
    var writesPerformed: Int
    var deletesPerformed: Int
}

private func validEvents(_ data: Data, manifest: Manifest) -> [Event]? {
    guard let text = String(data: data, encoding: .utf8), text.hasSuffix("\n") else { return nil }
    let lines = text.split(separator: "\n", omittingEmptySubsequences: true)
    var result: [Event] = []
    let dec = JSONDecoder()
    for (index, line) in lines.enumerated() {
        let validKinds: Set<String> = ["intent", "confirmed", "blocked"]
        let validPhases: Set<String> = ["session-created", "import", "save-start", "publish",
            "publish-reused", "publish-collision", "target-baseline-changed", "markdown-commit",
            "final-confirm"]
        guard let event = try? dec.decode(Event.self, from: Data(line.utf8)),
              event.schemaVersion == schemaVersion,
              event.sessionID == manifest.sessionID,
              event.operationID == manifest.operationID,
              event.sequence == index + 1, validKinds.contains(event.kind), validPhases.contains(event.phase),
              event.relativePath.map(isSafeRelative) ?? true else { return nil }
        result.append(event)
    }
    return result
}

private func audit(root: URL) -> AuditReport {
    let recovery = root.appendingPathComponent("recovery", isDirectory: true)
    var sessions: [AuditSession] = []
    var rejected: [String] = []
    guard (try? fm.destinationOfSymbolicLink(atPath: recovery.path)) == nil else {
        return AuditReport(schemaVersion: schemaVersion, root: root.path, mode: "read-only",
                           sessions: [], rejectedEntries: ["recovery-root-symlink"],
                           writesPerformed: 0, deletesPerformed: 0)
    }
    for name in ((try? fm.contentsOfDirectory(atPath: recovery.path)) ?? []).sorted() {
        guard isUUID(name) else { rejected.append("\(name):invalid-session-directory"); continue }
        let dir = recovery.appendingPathComponent(name, isDirectory: true)
        guard (try? fm.destinationOfSymbolicLink(atPath: dir.path)) == nil else {
            rejected.append("\(name):session-symlink"); continue
        }
        let murl = dir.appendingPathComponent("manifest.json")
        let eurl = dir.appendingPathComponent("events.jsonl")
        let validOperations: Set<String> = ["saveDraft", "saveAs"]
        let validCheckpoints: Set<String> = ["created", "imported", "save-started", "partially-published",
            "assets-published", "publish-blocked", "target-changed", "markdown-committed-unconfirmed", "saved"]
        let validOwnership: Set<String> = ["session", "operation", "none"]
        let validPublishStates: Set<String> = ["draft-only", "published-owned", "reused", "collision-kept"]
        guard let mdata = read(murl), let manifest = try? JSONDecoder().decode(Manifest.self, from: mdata),
              manifest.schemaVersion == schemaVersion,
              manifest.sessionID.lowercased() == name.lowercased(), isUUID(manifest.sessionID),
              isUUID(manifest.operationID), isSafeRelative(manifest.targetRelativePath),
              validOperations.contains(manifest.operation), validCheckpoints.contains(manifest.checkpoint),
              manifest.sourceRelativePath.map(isSafeRelative) ?? true,
              isSHA256(manifest.originalMarkdownSHA256),
              manifest.sourceBaselineSHA256.map(isSHA256) ?? true,
              manifest.targetBaselineSHA256.map(isSHA256) ?? true,
              sha(manifest.originalMarkdown) == manifest.originalMarkdownSHA256,
              manifest.assets.allSatisfy({ isSafeRelative($0.draftRelativePath)
                  && isSafeRelative($0.targetRelativePath)
                  && ($0.sourceRelativePath.map(isSafeRelative) ?? true)
                  && $0.draftRelativePath == "recovery/\(manifest.sessionID)/imports/\($0.name)"
                  && $0.name == URL(fileURLWithPath: $0.targetRelativePath).lastPathComponent
                  && isSHA256($0.sha256) && $0.byteCount >= 0
                  && validOwnership.contains($0.ownership)
                  && validPublishStates.contains($0.publishState) }) else {
            sessions.append(AuditSession(sessionID: name, operationID: nil, accepted: false,
                status: "record-rejected", reason: "manifest-invalid-or-unknown-schema",
                checkpoint: nil, dirty: true, saved: false, markdownSHA256: nil,
                targetObservedSHA256: nil, sourceObservedSHA256: nil, eventCount: 0, assets: [],
                preservation: "保留全部；未执行删除、覆盖或提交"))
            continue
        }
        guard let edata = read(eurl), let events = validEvents(edata, manifest: manifest) else {
            sessions.append(AuditSession(sessionID: name, operationID: manifest.operationID,
                accepted: false, status: "record-rejected", reason: "event-log-truncated-or-invalid",
                checkpoint: manifest.checkpoint, dirty: true, saved: false,
                markdownSHA256: manifest.originalMarkdownSHA256, targetObservedSHA256: nil,
                sourceObservedSHA256: nil, eventCount: 0, assets: [],
                preservation: "保留全部；未执行删除、覆盖或提交"))
            continue
        }
        let target = inside(root: root, relative: manifest.targetRelativePath)
        let targetSHA = target.flatMap(read).map(sha)
        let sourceSHA = manifest.sourceRelativePath.flatMap { inside(root: root, relative: $0) }.flatMap(read).map(sha)
        var reason = "已从磁盘记录重建为独立未保存草稿"
        var status = "not-committed"
        if manifest.saved {
            status = "recorded-saved"
            reason = "记录含最终确认；只读审计未修改文件"
        } else if manifest.sourceRelativePath != nil, sourceSHA != manifest.sourceBaselineSHA256 {
            status = "external-source-change"
            reason = "来源已外部修改；保守保留全部"
        } else if targetSHA == manifest.originalMarkdownSHA256 && !manifest.saved {
            status = "observed-bytes-match-completion-unknown"
            reason = "已观察目标字节符合计划，但最终完成状态未知"
        } else if targetSHA != manifest.targetBaselineSHA256 {
            status = "external-target-change"
            reason = "目标与记录基线/计划均不符；保守保留全部"
        }
        var assets: [AuditAsset] = []
        for asset in manifest.assets {
            let draftURL = inside(root: root, relative: asset.draftRelativePath)
            let targetURL = inside(root: root, relative: asset.targetRelativePath)
            let sourceAssetURL = asset.sourceRelativePath.flatMap { inside(root: root, relative: $0) }
            let draftSHA = draftURL.flatMap(read).map(sha)
            let sourceAssetSHA = sourceAssetURL.flatMap(read).map(sha)
            let publishedSHA = targetURL.flatMap(read).map(sha)
            let draftStatus = draftSHA == asset.sha256 ? "present-matching" :
                (draftSHA == nil ? "missing" : "different")
            let targetStatus = publishedSHA == asset.sha256 ? "present-matching" :
                (publishedSHA == nil ? "absent" : "different-preserved")
            let sourceStatus = asset.sourceRelativePath == nil ? nil :
                (sourceAssetSHA == asset.sha256 ? "present-matching" :
                    (sourceAssetSHA == nil ? "missing" : "different"))
            if draftStatus != "present-matching" {
                status = "draft-asset-missing-or-changed"
                reason = "草稿资源缺失或字节变化；保守保留全部"
            }
            if let sourceStatus, sourceStatus != "present-matching" {
                status = "external-source-asset-change"
                reason = "Save As 来源资源缺失或字节变化；保守保留全部"
            }
            assets.append(AuditAsset(name: asset.name, expectedSHA256: asset.sha256,
                                     draftStatus: draftStatus, sourceStatus: sourceStatus,
                                     targetStatus: targetStatus,
                                     ownership: asset.ownership))
        }
        sessions.append(AuditSession(sessionID: manifest.sessionID,
            operationID: manifest.operationID, accepted: true, status: status, reason: reason,
            checkpoint: manifest.checkpoint, dirty: status != "recorded-saved", saved: status == "recorded-saved",
            markdownSHA256: manifest.originalMarkdownSHA256, targetObservedSHA256: targetSHA,
            sourceObservedSHA256: sourceSHA, eventCount: events.count, assets: assets,
            preservation: "只读：未自动覆写目标、未重试 commit、未删除孤儿/其它会话资源"))
    }
    return AuditReport(schemaVersion: schemaVersion, root: root.path, mode: "read-only",
                       sessions: sessions, rejectedEntries: rejected,
                       writesPerformed: 0, deletesPerformed: 0)
}

private func emit<T: Encodable>(_ value: T, to url: URL? = nil) throws {
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    var data = try enc.encode(value)
    data.append(0x0a)
    if let url { try atomicDurableWrite(data, to: url) }
    else { FileHandle.standardOutput.write(data) }
}

private struct Ready: Codable {
    var pid: Int32
    var sessionID: String
    var operationID: String
    var operation: String
    var phase: String
    var checkpoint: String
}

private func waitForKill(_ session: PersistentSession, phase: String) throws -> Never {
    let ready = Ready(pid: getpid(), sessionID: session.manifest.sessionID,
                      operationID: session.manifest.operationID,
                      operation: session.manifest.operation, phase: phase,
                      checkpoint: session.manifest.checkpoint)
    try emit(ready, to: session.root.appendingPathComponent("ready.json"))
    while true { pause() }
}

private func runWorker(root: URL, operation: String, stop: String) throws -> Never {
    try fm.createDirectory(at: root, withIntermediateDirectories: true)
    let managedName = operation == "saveAs" ? "original.assets" : "note.assets"
    let markdown = Data([0xef, 0xbb, 0xbf]) + Data("# 中文 😀\r\n\r\n![一](\(managedName)/图.png)\r\n![二](\(managedName)/图-1.png)\r\n".utf8)
    let targetRel = operation == "saveAs" ? "destination/note.md" : "document/note.md"
    let sourceRel: String? = operation == "saveAs" ? "source/original.md" : nil
    if let sourceRel, let source = inside(root: root, relative: sourceRel), !fm.fileExists(atPath: source.path) {
        try fm.createDirectory(at: source.deletingLastPathComponent(), withIntermediateDirectories: true)
        try atomicDurableWrite(markdown, to: source)
        let sourceAssets = source.deletingLastPathComponent().appendingPathComponent("original.assets", isDirectory: true)
        try fm.createDirectory(at: sourceAssets, withIntermediateDirectories: true)
        try atomicDurableWrite(Data("PNG-一-😀".utf8), to: sourceAssets.appendingPathComponent("图.png"))
        try atomicDurableWrite(Data("PNG-二-不同".utf8), to: sourceAssets.appendingPathComponent("图-1.png"))
    }
    guard let target = inside(root: root, relative: targetRel) else { exit(65) }
    let session = try PersistentSession(root: root, operation: operation,
        sourceRelativePath: sourceRel, targetRelativePath: targetRel, markdown: markdown,
        targetBaseline: read(target).map(sha))
    try session.importAsset(bytes: Data("PNG-一-😀".utf8), preferredName: "图.png",
        sourceRelativePath: operation == "saveAs" ? "source/original.assets/图.png" : nil)
    try session.importAsset(bytes: Data("PNG-二-不同".utf8), preferredName: "图.png",
        sourceRelativePath: operation == "saveAs" ? "source/original.assets/图-1.png" : nil)
    if stop == "after-import-before-save" { try waitForKill(session, phase: stop) }
    try session.event(kind: "intent", phase: "save-start")
    try session.checkpoint("save-started")
    try session.publishAssets(stopAfterFirst: {
        if stop == "after-partial-publish" { try waitForKill(session, phase: stop) }
    })
    if stop == "after-all-published-before-markdown" { try waitForKill(session, phase: stop) }
    try session.commitMarkdown()
    if stop == "after-markdown-before-final-confirm" { try waitForKill(session, phase: stop) }
    try session.confirmSaved()
    exit(0)
}

private let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write(Data("usage: persistent-recovery worker <root> <saveDraft|saveAs> <phase> | audit <root>\n".utf8))
    exit(64)
}
let command = args[1]
let root = URL(fileURLWithPath: (args[2] as NSString).standardizingPath, isDirectory: true)
do {
    switch command {
    case "worker":
        guard args.count == 5, ["saveDraft", "saveAs"].contains(args[3]) else { exit(64) }
        try runWorker(root: root, operation: args[3], stop: args[4])
    case "audit":
        guard args.count == 3 else { exit(64) }
        try emit(audit(root: root))
        exit(0)
    default:
        exit(64)
    }
} catch {
    FileHandle.standardError.write(Data("persistent-recovery error: \(error)\n".utf8))
    exit(70)
}
