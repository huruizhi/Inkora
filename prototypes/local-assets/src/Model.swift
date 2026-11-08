// Model.swift — INK-PROT-011 本地资源最小状态模型原型
//
// 原型代码，非生产实现。目标：
// - 未命名草稿在独立恢复会话中保留导入图片；首次保存成功前不 markSaved。
// - 复制图片成功但 Markdown 写失败时：草稿与原资源不丢，回滚仅删本次明确拥有
//   且未被引用的文件；同名同字节可复用但不取得清理所有权，异内容拒绝覆盖。
// - 保存成功后托管相对路径与资源同在；Save As 不改引用字节、不删原资源。
// - 明确区分“本模型断言”与真实文件系统结果：所有 SHA/存在性均来自实际文件。
// - 不把复制与写 Markdown 假装成跨文件原子事务；用所有权 journal 跟踪边界。
//
// 用法：
//   local-assets-model <scratchRoot> <baselineSHA>   运行全部场景，输出 JSON
//   local-assets-model posix-read <path>             单文件 POSIX 读取探针（对照用）
// 退出码：0 全部通过；3 存在失败场景。

import Foundation
import CryptoKit

// MARK: - 基础工具

func sha256Hex(_ url: URL) -> String? {
    guard let d = try? Data(contentsOf: url) else { return nil }
    return sha256Hex(d)
}

func sha256Hex(_ d: Data) -> String {
    SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined()
}

func posixRead(_ path: String) -> [String: Any?] {
    let fd = open(path, O_RDONLY)
    if fd < 0 {
        let e = errno
        return ["path": path, "ok": false, "errno": e,
                "errnoMessage": String(cString: strerror(e)), "sha256": nil, "byteCount": nil]
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
        return ["path": path, "ok": false, "errno": Int(e),
                "errnoMessage": String(cString: strerror(e)), "sha256": nil, "byteCount": nil]
    }
    return ["path": path, "ok": true, "errno": nil, "errnoMessage": nil,
            "sha256": sha256Hex(data), "byteCount": data.count]
}

func jsonValue(_ dict: [String: Any?]) -> Any {
    dict.mapValues { $0 == nil ? NSNull() : $0! }
}

// MARK: - 所有权 Journal

struct JournalEntry: Codable {
    var id: String
    var op: String
    var session: String
    var path: String
    var event: String // created | committed | reused-no-ownership | rolled-back-deleted | rolled-back-kept-referenced | blocked | draft-import | cancelled-draft-kept | session-purged
    var note: String?
}

final class OwnershipJournal {
    private(set) var entries: [JournalEntry] = []

    @discardableResult
    func record(op: String, session: String, path: URL, event: String, note: String? = nil) -> String {
        let id = UUID().uuidString
        entries.append(.init(id: id, op: op, session: session, path: path.path, event: event, note: note))
        return id
    }

    func ownedCreatedPaths(op: String) -> [String] {
        entries.filter { $0.op == op && $0.event == "created" }.map(\.path)
    }

    func commit(op: String) {
        for i in entries.indices where entries[i].op == op && entries[i].event == "created" {
            entries[i].event = "committed"
        }
    }

    func markRolledBack(op: String, deleted: Set<String>, kept: Set<String>) {
        for i in entries.indices where entries[i].op == op && entries[i].event == "created" {
            if deleted.contains(entries[i].path) { entries[i].event = "rolled-back-deleted" }
            else if kept.contains(entries[i].path) { entries[i].event = "rolled-back-kept-referenced" }
        }
    }
}

// MARK: - 未命名草稿会话

struct PendingAsset {
    let name: String // 拟用的托管文件名（保存时进 <文档名>.assets/）
    let file: URL    // 草稿会话内的字节副本
}

final class DraftSession {
    let id: String
    let dir: URL
    private(set) var pending: [PendingAsset] = []
    private(set) var dirty = false
    private(set) var saved = false // markSaved：仅在 Markdown 实际落盘成功后置 true

    init(root: URL, journal: OwnershipJournal) throws {
        id = UUID().uuidString
        dir = root.appendingPathComponent("recovery", isDirectory: true)
            .appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// 导入图片字节到草稿会话（复制，不引用用户原路径）。
    @discardableResult
    func importImage(bytes: Data, preferredName: String, journal: OwnershipJournal) throws -> PendingAsset {
        let imports = dir.appendingPathComponent("imports", isDirectory: true)
        try FileManager.default.createDirectory(at: imports, withIntermediateDirectories: true)
        // 唯一化：同名时追加序号，避免覆盖
        var name = preferredName
        var i = 1
        while FileManager.default.fileExists(atPath: imports.appendingPathComponent(name).path) {
            let base = (preferredName as NSString).deletingPathExtension
            let ext = (preferredName as NSString).pathExtension
            name = ext.isEmpty ? "\(preferredName)-\(i)" : "\(base)-\(i).\(ext)"
            i += 1
        }
        let f = imports.appendingPathComponent(name)
        try bytes.write(to: f)
        let p = PendingAsset(name: preferredName, file: f)
        pending.append(p)
        dirty = true
        saved = false
        journal.record(op: "import", session: id, path: f, event: "draft-import", note: name)
        return p
    }

    /// markSaved：仅由保存引擎在 Markdown 实际落盘成功后调用
    func markSaved() { saved = true; dirty = false }
}

// MARK: - 保存结果

struct SaveOutcome: Codable {
    var saved = false
    var markSaved = false
    var markdownWritten: Bool? = nil
    var reused: [String] = []
    var conflicts: [String] = []
    var rolledBackDeleted: [String] = []
    var rolledBackKept: [String] = []
    var unmanagedRelativeRefs: [String] = []
    var error: String? = nil
}

// MARK: - 保存引擎

enum SaveEngine {

    static func managedDirName(forMarkdown url: URL) -> String {
        url.deletingPathExtension().lastPathComponent + ".assets"
    }

    /// 原型级图片引用解析（正则限制见 README）；返回原始引用串。
    static func imageRefs(inMarkdown data: Data) -> [String] {
        guard let s = String(data: data, encoding: .utf8) else { return [] }
        guard let re = try? NSRegularExpression(pattern: #"!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#) else { return [] }
        let r = NSRange(s.startIndex..., in: s)
        return re.matches(in: s, range: r).compactMap { m in
            Range(m.range(at: 1), in: s).map { String(s[$0]) }
        }
    }

struct RefError: Error { let message: String; init(_ m: String) { message = m } }

    /// 托管相对引用解析：拒绝绝对路径、file: scheme、`..` 越界、符号链接组件。
    static func resolveManaged(markdownDir: URL, ref: String) -> Result<URL, RefError> {
        if ref.hasPrefix("/") { return .failure(RefError("absolute-rejected: \(ref)")) }
        let lower = ref.lowercased()
        if lower.hasPrefix("file:") || lower.hasPrefix("http:") || lower.hasPrefix("https:") || lower.hasPrefix("data:") {
            return .failure(RefError("scheme-rejected: \(ref)"))
        }
        guard let dec = ref.removingPercentEncoding else { return .failure(RefError("percent-decode-failed: \(ref)")) }
        let comps = dec.split(separator: "/").map(String.init)
        if comps.contains("..") { return .failure(RefError("dotdot-rejected: \(ref)")) }
        var cur = markdownDir.standardizedFileURL
        for c in comps {
            cur = cur.appendingPathComponent(c)
            if let _ = try? FileManager.default.destinationOfSymbolicLink(atPath: cur.path) {
                return .failure(RefError("symlink-rejected: \(cur.path)"))
            }
        }
        return .success(cur)
    }

    /// 首次保存：先把草稿资源复制到 <文档名>.assets/，再写 Markdown。
    /// 复制与写入不是原子事务；失败按 journal 回滚本次创建且未被引用的文件。
    static func saveDraft(session: DraftSession, to target: URL,
                          journal: OwnershipJournal, markdown: String) -> SaveOutcome {
        var out = SaveOutcome()
        let op = "save-" + UUID().uuidString.prefix(8)
        let fm = FileManager.default
        let targetDir = target.deletingLastPathComponent()
        let mdir = targetDir.appendingPathComponent(managedDirName(forMarkdown: target), isDirectory: true)
        do {
            try fm.createDirectory(at: mdir, withIntermediateDirectories: true)
            for p in session.pending {
                let dest = mdir.appendingPathComponent(p.name)
                if fm.fileExists(atPath: dest.path) {
                    guard let existing = try? Data(contentsOf: dest),
                          let want = try? Data(contentsOf: p.file) else {
                        out.error = "stat-failed: \(p.name)"
                        rollback(op: op, targetDir: targetDir, journal: journal, out: &out)
                        return out
                    }
                    if existing == want {
                        // 同名同字节可复用，但不取得清理所有权
                        journal.record(op: op, session: session.id, path: dest, event: "reused-no-ownership")
                        out.reused.append(dest.lastPathComponent)
                        continue
                    }
                    out.conflicts.append(dest.lastPathComponent)
                    out.error = "conflict-different-bytes: \(p.name)"
                    rollback(op: op, targetDir: targetDir, journal: journal, out: &out)
                    return out
                }
                try fm.copyItem(at: p.file, to: dest)
                journal.record(op: op, session: session.id, path: dest, event: "created", note: "copy \(p.name)")
            }
            try Data(markdown.utf8).write(to: target, options: .atomic)
            out.markdownWritten = true
            session.markSaved() // markSaved 仅在此之后
            journal.commit(op: op)
            out.saved = true
            out.markSaved = true
            return out
        } catch {
            out.markdownWritten = false
            out.error = "markdown-write-failed: \(String(describing: error))"
            rollback(op: op, targetDir: targetDir, journal: journal, out: &out)
            return out
        }
    }

    /// 回滚：只处理本次 journal 记录为 created 且可确认未被目标目录任何 Markdown 引用的文件。
    static func rollback(op: String, targetDir: URL, journal: OwnershipJournal, out: inout SaveOutcome) {
        let fm = FileManager.default
        var referenced = Set<String>()
        if let mds = try? fm.contentsOfDirectory(at: targetDir, includingPropertiesForKeys: nil) {
            for md in mds where md.pathExtension == "md" {
                for ref in imageRefs(inMarkdown: (try? Data(contentsOf: md)) ?? Data()) {
                    if case .success(let u) = resolveManaged(markdownDir: targetDir, ref: ref) {
                        referenced.insert(u.path)
                    }
                }
            }
        }
        var deleted = Set<String>(), kept = Set<String>()
        for path in journal.ownedCreatedPaths(op: op) {
            if referenced.contains(path) {
                kept.insert(path)
            } else if fm.fileExists(atPath: path) {
                do { try fm.removeItem(atPath: path); deleted.insert(path) }
                catch { kept.insert(path) } // 删除失败保留并如实记录，不静默
            }
        }
        journal.markRolledBack(op: op, deleted: deleted, kept: kept)
        out.rolledBackDeleted = deleted.sorted()
        out.rolledBackKept = kept.sorted()
    }

    /// 显式放弃草稿：仅在明确放弃时删除会话自有文件，不触碰来源或其它草稿。
    static func abandon(session: DraftSession, journal: OwnershipJournal) {
        try? FileManager.default.removeItem(at: session.dir)
        journal.record(op: "abandon", session: session.id, path: session.dir, event: "session-purged")
    }

    /// Save As：逐字节保留原 Markdown 引用；托管资源按原目录名复制到新位置；
    /// 未托管相对引用若将失效则明确阻塞，不悄悄保存成断链；不删除原资源。
    static func saveAs(from source: URL, to target: URL, journal: OwnershipJournal) -> SaveOutcome {
        var out = SaveOutcome()
        let op = "saveas-" + UUID().uuidString.prefix(8)
        let fm = FileManager.default
        guard let mdBytes = try? Data(contentsOf: source) else {
            out.error = "source-read-failed: \(source.path)"
            return out
        }
        let srcDir = source.deletingLastPathComponent()
        let dstDir = target.deletingLastPathComponent()
        var dirsToCopy = Set<String>()
        var unmanaged: [String] = []
        for ref in imageRefs(inMarkdown: mdBytes) {
            switch resolveManaged(markdownDir: srcDir, ref: ref) {
            case .failure:
                out.error = "ref-resolve-failed: \(ref)"
                return out
            case .success(let u):
                if fm.fileExists(atPath: u.path) {
                    let dirName = u.deletingLastPathComponent().lastPathComponent
                    if dirName.hasSuffix(".assets") { dirsToCopy.insert(dirName) }
                } else {
                    unmanaged.append(ref) // 相对引用在新位置将失效
                }
            }
        }
        out.unmanagedRelativeRefs = unmanaged
        if !unmanaged.isEmpty {
            out.error = "blocked-unmanaged-relative-refs"
            journal.record(op: op, session: "n/a", path: target, event: "blocked",
                           note: unmanaged.joined(separator: ","))
            return out
        }
        do {
            try fm.createDirectory(at: dstDir, withIntermediateDirectories: true)
            for d in dirsToCopy.sorted() {
                let srcD = srcDir.appendingPathComponent(d, isDirectory: true)
                let dstD = dstDir.appendingPathComponent(d, isDirectory: true)
                if fm.fileExists(atPath: dstD.path) {
                    for f in try fm.contentsOfDirectory(at: srcD, includingPropertiesForKeys: nil) {
                        let df = dstD.appendingPathComponent(f.lastPathComponent)
                        if fm.fileExists(atPath: df.path) {
                            guard let a = try? Data(contentsOf: f), let b = try? Data(contentsOf: df), a == b else {
                                out.conflicts.append("\(d)/\(f.lastPathComponent)")
                                out.error = "conflict-different-bytes"
                                return out
                            }
                            journal.record(op: op, session: "n/a", path: df, event: "reused-no-ownership")
                            continue
                        }
                        try fm.copyItem(at: f, to: df)
                        journal.record(op: op, session: "n/a", path: df, event: "created")
                    }
                } else {
                    try fm.copyItem(at: srcD, to: dstD)
                    if let files = try? fm.contentsOfDirectory(at: dstD, includingPropertiesForKeys: nil) {
                        for f in files { journal.record(op: op, session: "n/a", path: f, event: "created", note: "copied dir \(d)") }
                    }
                }
            }
            try mdBytes.write(to: target, options: .atomic) // 原字节，不改写引用
            out.markdownWritten = true
            out.saved = true
            out.markSaved = true
            journal.commit(op: op)
            return out // 不删除原文档/原资源
        } catch {
            out.error = "saveas-failed: \(String(describing: error))"
            return out
        }
    }
}

// MARK: - 场景框架

struct ScenarioResult: Codable {
    let name: String
    var pass: Bool = true
    var detail: [String] = []
    var initial: [SHARecord] = []
    var final: [SHARecord] = []
}

struct SHARecord: Codable {
    let path: String
    let sha256: String?
    let exists: Bool
}

func shaRecord(_ url: URL) -> SHARecord {
    let e = FileManager.default.fileExists(atPath: url.path)
    return .init(path: url.lastPathComponent, sha256: e ? sha256Hex(url) : nil, exists: e)
}

final class Scenario {
    let name: String
    var result: ScenarioResult
    init(_ name: String) { self.name = name; self.result = .init(name: name) }
    func check(_ cond: Bool, _ label: String) {
        if cond { result.detail.append("PASS \(label)") }
        else { result.detail.append("FAIL \(label)"); result.pass = false }
    }
    func snapshot(_ urls: [URL], into key: WritableKeyPath<ScenarioResult, [SHARecord]>) {
        result[keyPath: key] = urls.map(shaRecord)
    }
}

// MARK: - 场景实现

let fm = FileManager.default

func makeDir(_ u: URL) throws -> URL {
    try fm.createDirectory(at: u, withIntermediateDirectories: true)
    return u
}

func runAll(root: URL, baseline: String) -> Int {
    var scenarios: [ScenarioResult] = []
    let journal = OwnershipJournal()

    // S1 未命名草稿：导入图片保留在恢复会话中，首次保存成功前不 markSaved
    do {
        let s = Scenario("S1-draft-import-retained")
        let session = try DraftSession(root: root, journal: journal)
        let bytes = Data("PNGDATA-S1-图 片%20".utf8)
        let imported = try session.importImage(bytes: bytes, preferredName: "图 片%20.png", journal: journal)
        s.check(fm.fileExists(atPath: imported.file.path), "imported file exists in session dir")
        s.check(sha256Hex(imported.file) == sha256Hex(bytes), "session bytes SHA == imported bytes")
        s.check(session.dirty && !session.saved, "dirty=true saved=false before first save")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S1-draft-import-retained", pass: false, detail: ["FAIL threw \(error)"])) }

    // S2 复制成功但 Markdown 写失败：草稿/原资源不丢，回滚只删本次拥有的未引用文件
    do {
        let s = Scenario("S2-md-write-failure-keeps-draft")
        let base = try makeDir(root.appendingPathComponent("s2", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let bytes = Data("PNGDATA-S2".utf8)
        let imported = try session.importImage(bytes: bytes, preferredName: "a.png", journal: journal)
        let md = base.appendingPathComponent("note.md")
        try makeDir(md) // 故障注入：Markdown 目标路径被目录占用，真实写失败
        let pre = base.appendingPathComponent("unrelated.txt")
        try Data("untouched".utf8).write(to: pre)
        s.snapshot([imported.file, pre], into: \.initial)
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: "# n\n\n![](note.assets/a.png)\n")
        s.check(!out.saved && !out.markSaved && out.markdownWritten == false, "not saved, no markSaved, write actually failed")
        s.check(out.error?.hasPrefix("markdown-write-failed") == true, "error recorded: \(out.error ?? "")")
        let mdir = base.appendingPathComponent("note.assets", isDirectory: true)
        s.check(!fm.fileExists(atPath: mdir.appendingPathComponent("a.png").path), "owned unreferenced copy rolled back (deleted)")
        s.snapshot([imported.file, pre], into: \.final)
        s.check(s.result.initial.map(\.sha256) == s.result.final.map(\.sha256), "draft + unrelated file SHAs unchanged")
        s.check(session.dirty && !session.saved, "session still dirty, not saved")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S2-md-write-failure-keeps-draft", pass: false, detail: ["FAIL threw \(error)"])) }

    // S3 首次保存成功：托管相对路径与资源同在，字节一致
    do {
        let s = Scenario("S3-first-save-success")
        let base = try makeDir(root.appendingPathComponent("s3", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let bytes = Data("PNGDATA-S3-中文".utf8)
        let imported = try session.importImage(bytes: bytes, preferredName: "图 片%20.png", journal: journal)
        let md = base.appendingPathComponent("笔记 note.md")
        let ref = "笔记 note.assets/图%20片%2520.png"
        let markdown = "# 标题\n\n![图](\(ref))\n"
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: markdown)
        s.check(out.saved && out.markSaved && out.markdownWritten == true, "saved + markSaved after md write")
        s.check(fm.fileExists(atPath: md.path), "markdown exists")
        if case .success(let resolved) = SaveEngine.resolveManaged(markdownDir: base, ref: ref) {
            s.check(fm.fileExists(atPath: resolved.path), "percent/中文/空格 ref resolves: \(resolved.path)")
            s.check(sha256Hex(resolved) == sha256Hex(bytes), "managed bytes SHA == draft bytes")
        } else { s.check(false, "ref resolve failed") }
        s.check(session.saved && !session.dirty, "session clean after success")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S3-first-save-success", pass: false, detail: ["FAIL threw \(error)"])) }

    // S4 Save As：不改引用字节、不删原资源、托管资源随迁
    do {
        let s = Scenario("S4-save-as-byte-identical")
        let srcBase = try makeDir(root.appendingPathComponent("s4-src", isDirectory: true))
        let srcMD = srcBase.appendingPathComponent("笔记 note.md")
        let srcAsset = try makeDir(srcBase.appendingPathComponent("笔记 note.assets", isDirectory: true))
            .appendingPathComponent("图 名.png")
        try Data("PNG-S4".utf8).write(to: srcAsset)
        try Data("# S4\n\n![x](%E7%AC%94%E8%AE%B0%20note.assets/%E5%9B%BE%20%E5%90%8D.png)\n".utf8).write(to: srcMD)
        s.snapshot([srcMD, srcAsset], into: \.initial)
        let dstBase = try makeDir(root.appendingPathComponent("s4-dst", isDirectory: true))
        let dstMD = dstBase.appendingPathComponent("副本 copy.md")
        let out = SaveEngine.saveAs(from: srcMD, to: dstMD, journal: journal)
        s.check(out.saved, "saveAs saved, error=\(out.error ?? "nil")")
        s.check(fm.fileExists(atPath: dstMD.path), "new markdown exists")
        if let a = try? Data(contentsOf: srcMD), let b = try? Data(contentsOf: dstMD) {
            s.check(a == b, "markdown bytes identical (ref bytes unchanged)")
        }
        s.check(fm.fileExists(atPath: dstBase.appendingPathComponent("笔记 note.assets/图 名.png").path),
                "managed asset copied under ORIGINAL dir name at new location")
        s.snapshot([srcMD, srcAsset], into: \.final)
        s.check(s.result.initial.map(\.sha256) == s.result.final.map(\.sha256), "originals untouched (still exist, same SHA)")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S4-save-as-byte-identical", pass: false, detail: ["FAIL threw \(error)"])) }

    // S5 冲突规则：同字节复用不取得所有权（失败回滚不删）；异内容拒绝且不覆盖
    do {
        let s = Scenario("S5-conflict-rules")
        let base = try makeDir(root.appendingPathComponent("s5", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let bytes = Data("SAME-BYTES".utf8)
        _ = try session.importImage(bytes: bytes, preferredName: "same.png", journal: journal)
        // 5a 预置同字节文件 → 复用；随后写失败 → 回滚不得删除预置文件
        let mdA = base.appendingPathComponent("a.md")
        let mdirA = try makeDir(base.appendingPathComponent("a.assets", isDirectory: true))
        try bytes.write(to: mdirA.appendingPathComponent("same.png"))
        try makeDir(mdA) // 写失败注入
        let outA = SaveEngine.saveDraft(session: session, to: mdA, journal: journal, markdown: "![](a.assets/same.png)")
        s.check(outA.reused == ["same.png"], "same-bytes reused, error=\(outA.error ?? "nil")")
        s.check(!outA.rolledBackDeleted.contains(mdirA.appendingPathComponent("same.png").path),
                "rollback did not claim reused file")
        let preSHA = sha256Hex(mdirA.appendingPathComponent("same.png"))
        s.check(fm.fileExists(atPath: mdirA.appendingPathComponent("same.png").path) && sha256Hex(mdirA.appendingPathComponent("same.png")) == preSHA,
                "reused pre-existing file NOT deleted on rollback (no ownership)")
        // 5b 预置异内容 → 拒绝且不覆盖
        let mdB = base.appendingPathComponent("b.md")
        let mdirB = try makeDir(base.appendingPathComponent("b.assets", isDirectory: true))
        try Data("DIFFERENT".utf8).write(to: mdirB.appendingPathComponent("same.png"))
        let outB = SaveEngine.saveDraft(session: session, to: mdB, journal: journal, markdown: "![](b.assets/same.png)")
        s.check(!outB.saved && outB.conflicts == ["same.png"], "different-bytes rejected")
        s.check(sha256Hex(mdirB.appendingPathComponent("same.png")) == sha256Hex(Data("DIFFERENT".utf8)), "target not overwritten")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S5-conflict-rules", pass: false, detail: ["FAIL threw \(error)"])) }

    // S6 回滚所有权边界：被其它 Markdown 引用的本次创建文件保留，未引用删除，外来文件不动
    do {
        let s = Scenario("S6-rollback-ownership-boundary")
        let base = try makeDir(root.appendingPathComponent("s6", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        _ = try session.importImage(bytes: Data("KEEP".utf8), preferredName: "keep.png", journal: journal)
        _ = try session.importImage(bytes: Data("DROP".utf8), preferredName: "drop.png", journal: journal)
        let other = base.appendingPathComponent("other.md")
        try Data("![](note.assets/keep.png)\n".utf8).write(to: other)
        let foreign = base.appendingPathComponent("note.assets/foreign.png")
        try makeDir(foreign.deletingLastPathComponent())
        try Data("FOREIGN".utf8).write(to: foreign)
        let md = base.appendingPathComponent("note.md")
        try makeDir(md) // 写失败注入
        let before = shaRecord(other)
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: "![](note.assets/keep.png) ![](note.assets/drop.png)")
        s.check(!out.saved, "save failed as injected")
        s.check(out.rolledBackKept.map { URL(fileURLWithPath: $0).lastPathComponent } == ["keep.png"], "referenced created file kept: \(out.rolledBackKept)")
        s.check(out.rolledBackDeleted.map { URL(fileURLWithPath: $0).lastPathComponent } == ["drop.png"], "unreferenced created file deleted: \(out.rolledBackDeleted)")
        s.check(shaRecord(other).sha256 == before.sha256, "other.md untouched")
        s.check(fm.fileExists(atPath: foreign.path) && sha256Hex(foreign) == sha256Hex(Data("FOREIGN".utf8)), "foreign file untouched")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S6-rollback-ownership-boundary", pass: false, detail: ["FAIL threw \(error)"])) }

    // S7 取消保存：不删除草稿
    do {
        let s = Scenario("S7-cancel-keeps-draft")
        let session = try DraftSession(root: root, journal: journal)
        let imported = try session.importImage(bytes: Data("CANCEL".utf8), preferredName: "c.png", journal: journal)
        journal.record(op: "cancel", session: session.id, path: session.dir, event: "cancelled-draft-kept")
        s.check(fm.fileExists(atPath: imported.file.path), "draft import still exists after cancel")
        s.check(fm.fileExists(atPath: session.dir.path), "session dir still exists after cancel")
        s.check(session.dirty && !session.saved, "still dirty, not saved")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S7-cancel-keeps-draft", pass: false, detail: ["FAIL threw \(error)"])) }

    // S8 解析边界：中文/空格/百分号通过；`..`、绝对路径、符号链接拒绝并给出最小反例
    do {
        let s = Scenario("S8-resolution-boundaries")
        let base = try makeDir(root.appendingPathComponent("s8", isDirectory: true))
        let mdir = try makeDir(base.appendingPathComponent("doc.assets", isDirectory: true))
        try Data("OK".utf8).write(to: mdir.appendingPathComponent("图 片%20.png"))
        // 通过：中文/空格/百分号
        if case .success(let u) = SaveEngine.resolveManaged(markdownDir: base, ref: "doc.assets/图%20片%2520.png") {
            s.check(fm.fileExists(atPath: u.path), "中文/空格/百分号 ref resolves")
        } else { s.check(false, "中文/空格/百分号 ref should resolve") }
        // 反例：..
        if case .failure(let e) = SaveEngine.resolveManaged(markdownDir: base, ref: "../escape.png") {
            s.check(e.message.hasPrefix("dotdot-rejected"), "dotdot rejected: \(e.message)")
        } else { s.check(false, "dotdot should be rejected") }
        // 反例：绝对路径
        if case .failure(let e) = SaveEngine.resolveManaged(markdownDir: base, ref: "/etc/passwd") {
            s.check(e.message.hasPrefix("absolute-rejected"), "absolute rejected: \(e.message)")
        } else { s.check(false, "absolute should be rejected") }
        // 反例：符号链接逃逸
        let secret = try makeDir(root.appendingPathComponent("s8-outside", isDirectory: true))
            .appendingPathComponent("secret.png")
        try Data("SECRET".utf8).write(to: secret)
        let link = mdir.appendingPathComponent("link.png")
        try fm.createSymbolicLink(at: link, withDestinationURL: secret)
        if case .failure(let e) = SaveEngine.resolveManaged(markdownDir: base, ref: "doc.assets/link.png") {
            s.check(e.message.hasPrefix("symlink-rejected"), "symlink rejected: \(e.message)")
        } else { s.check(false, "symlink should be rejected") }
        s.check(fm.fileExists(atPath: secret.path), "external secret untouched by rejection")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S8-resolution-boundaries", pass: false, detail: ["FAIL threw \(error)"])) }

    // S9 显式放弃草稿：只删会话自有目录
    do {
        let s = Scenario("S9-explicit-abandon")
        let session = try DraftSession(root: root, journal: journal)
        let imported = try session.importImage(bytes: Data("ABANDON".utf8), preferredName: "x.png", journal: journal)
        SaveEngine.abandon(session: session, journal: journal)
        s.check(!fm.fileExists(atPath: imported.file.path) && !fm.fileExists(atPath: session.dir.path), "session dir purged on explicit abandon")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S9-explicit-abandon", pass: false, detail: ["FAIL threw \(error)"])) }

    // 汇总输出
    struct Report: Codable {
        let prototype: String
        let baseline: String
        let ranAt: String
        let scratchRoot: String
        let allPass: Bool
        let scenarios: [ScenarioResult]
        let journal: [JournalEntry]
    }
    let report = Report(
        prototype: "INK-PROT-011 local-assets model 0.1",
        baseline: baseline,
        ranAt: ISO8601DateFormatter().string(from: Date()),
        scratchRoot: root.path,
        allPass: scenarios.allSatisfy(\.pass),
        scenarios: scenarios,
        journal: journal.entries)
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys]
    enc.outputFormatting.insert(.withoutEscapingSlashes)
    let data = try! enc.encode(report)
    FileHandle.standardOutput.write(data)
    print()
    return scenarios.allSatisfy(\.pass) ? 0 : 3
}

// MARK: - main

let args = CommandLine.arguments
if args.count >= 3, args[1] == "posix-read" {
    // 非沙盒对照读取：与 Sandbox 探针同一语义的 POSIX 读取
    let d = posixRead(args[2])
    let json = try! JSONSerialization.data(withJSONObject: jsonValue(d), options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(json)
    print()
    exit(0)
}
guard args.count >= 3 else {
    FileHandle.standardError.write(Data("usage: local-assets-model <scratchRoot> <baselineSHA> | posix-read <path>\n".utf8))
    exit(64)
}
let root = URL(fileURLWithPath: (args[1] as NSString).standardizingPath, isDirectory: true)
try? fm.createDirectory(at: root, withIntermediateDirectories: true)
exit(Int32(runAll(root: root, baseline: args[2])))
