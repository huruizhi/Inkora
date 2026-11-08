// Model.swift — INK-PROT-011 本地资源最小状态模型原型（INK-PROT-013 修正轮）
//
// 原型代码，非生产实现。本轮修正 256c30e 的两个缺陷：
//
// 缺陷A（提交顺序）：saveDraft/saveAs 原实现 staging→写 Markdown→发布资源，
// 发布失败时原件已变成指向缺图的新内容。现一律：
//   1. 校验（纯读：冲突/引用分类，不写任何文件）
//   2. 独占私有 staging 落盘并读回校验字节
//   3. 资源发布到最终位置，全部成功才继续（copyItem EEXIST 即原子排他，
//      不把 exists 预检当排他；发布期才发现目标存在 → 同字节视为无所有权复用，
//      异字节/不可读为 publish-collision 明确失败，绝不覆盖）
//   4. 最后一步原子提交 Markdown；失败则旧目标逐字节不变
//   5. 仅全流程成功快照 markSaved
// 失败时：已发布资源按“明确记录的孤儿”保留（不扫描其它文档猜无引用后删除）；
// 只删除未发布且明确属于本操作的私有 staging。非跨文件原子事务：publish 与
// markdown commit 之间存在 crash 窗口（见 Report.crashWindow）；journal 仅在
// 进程内存，不能声称跨重启恢复（见 Report.journalBoundary）。
//
// 缺陷B（Save As 断链）：原实现只有源不存在的相对引用才阻塞。现对源存在的
// 未托管相对引用（不在 *.assets）逐一检查目标等价位置：缺失或异字节 → 明确
// 阻塞并给出原因，不悄悄保存成断链；同字节 → 无所有权复用，引用字节原样保留。
// 普通外链(scheme)/绝对路径不参与本地图片决策（移动文档不改变其可用性），
// 记录于 passthroughExternalRefs；引用式定义只统计被 ![..][id] 用作图片的条目，
// 普通链接定义不混同本地图片（保守边界，正则覆盖范围见 README）。
//
// 故障注入诚实标注：S2/S6/S11/S12 为真实文件系统条件（目录占位 / chflags uchg /
// 悬空符号链接）；S13 的 beforePublish 注入缝仅让场景在发布瞬间写入目标路径
// 模拟并发发布者，引擎遇到的是真实 FS 状态，报告注入标签区分“非 OS 故障”。
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
        return ["path": path, "ok": false, "errno": Int(errno),
                "errnoMessage": String(cString: strerror(errno)), "sha256": nil, "byteCount": nil]
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

// MARK: - 所有权 Journal（仅进程内存；边界见 Report.journalBoundary）

struct JournalEntry: Codable {
    var id: String
    var op: String
    var session: String
    var path: String
    var event: String // staged | published | committed | reused-no-ownership |
                      // rolled-back-staging-deleted | kept-orphan-recorded | blocked |
                      // draft-import | cancelled-draft-kept | session-purged | markdown-committed
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

    func ownedStagedPaths(op: String) -> [String] {
        entries.filter { $0.op == op && $0.event == "staged" }.map(\.path)
    }

    func ownedPublishedPaths(op: String) -> [String] {
        entries.filter { $0.op == op && $0.event == "published" }.map(\.path)
    }

    /// 私有 staging 副本成功落到最终位置：条目路径随之指向最终路径。
    func markPublished(op: String, at stagingPath: String, to finalPath: String) {
        for i in entries.indices where entries[i].op == op && entries[i].event == "staged"
            && entries[i].path == stagingPath {
            entries[i].event = "published"
            entries[i].path = finalPath
        }
    }

    /// 全流程成功（含 Markdown 提交）后：published → committed。
    func commitStaged(op: String) {
        for i in entries.indices where entries[i].op == op && entries[i].event == "published" {
            entries[i].event = "committed"
        }
    }

    func markStagingRolledBack(op: String) {
        for i in entries.indices where entries[i].op == op && entries[i].event == "staged" {
            entries[i].event = "rolled-back-staging-deleted"
        }
    }

    /// 已发布但未完成 Markdown 提交的资源 → kept-orphan-recorded（保留，不删）。
    func markOrphansKept(op: String, remaining: Set<String>) {
        for i in entries.indices where entries[i].op == op && entries[i].event == "published"
            && remaining.contains(entries[i].path) {
            entries[i].event = "kept-orphan-recorded"
        }
    }
}

// MARK: - 未命名草稿会话

enum ModelError: Error {
    case invalidPreferredName(String)
}

struct PendingAsset {
    let name: String // 已分配的唯一托管文件名（保存时进 <文档名>.assets/）
    let file: URL    // 草稿会话内的字节副本
}

final class DraftSession {
    let id: String
    let dir: URL
    private(set) var pending: [PendingAsset] = []
    private(set) var dirty = false
    private(set) var saved = false // markSaved：仅在保存全流程成功后置 true

    init(root: URL, journal: OwnershipJournal) throws {
        id = UUID().uuidString
        dir = root.appendingPathComponent("recovery", isDirectory: true)
            .appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// 导入图片字节到草稿会话（复制，不引用用户原路径）。
    /// preferredName 必须是单个合法文件名；同名导入自动分配唯一名并如实返回。
    @discardableResult
    func importImage(bytes: Data, preferredName: String, journal: OwnershipJournal) throws -> PendingAsset {
        guard !preferredName.isEmpty,
              preferredName != "." && preferredName != "..",
              !preferredName.contains("/") else {
            throw ModelError.invalidPreferredName(preferredName)
        }
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
        let p = PendingAsset(name: name, file: f) // 使用实际分配的唯一名
        pending.append(p)
        dirty = true
        saved = false
        journal.record(op: "import", session: id, path: f, event: "draft-import", note: name)
        return p
    }

    /// markSaved：仅由保存引擎在全流程成功后调用
    func markSaved() { saved = true; dirty = false }
}

// MARK: - 保存结果（状态边界记录）

struct SaveOutcome: Codable {
    var saved = false
    var markSaved = false
    var markdownCommitted: Bool? = nil   // Markdown 是否走到最终原子提交（最后一步）
    var publishedAssets: [String] = []   // 已发布到最终位置的资源（绝对路径）
    var reused: [String] = []            // 同字节复用（不取得清理所有权）
    var conflicts: [String] = []         // 校验期异内容冲突（未写任何文件）
    var publishCollisions: [String] = [] // 发布期才发现的目标碰撞（并发/预检不可见）
    var stagingDir: String? = nil
    var stagingDeleted = false
    var orphanedKept: [String] = []      // 发布后未完成 Markdown 提交而保守保留的最终位置资源
    var unmanagedRelativeRefs: [String] = []     // Save As：源不存在 → 阻塞
    var unmanagedTargetMissing: [String] = []    // Save As：源存在但目标缺失等价资源 → 阻塞（缺陷B）
    var unmanagedTargetConflicts: [String] = []  // Save As：目标同路径异字节 → 阻塞（缺陷B）
    var passthroughExternalRefs: [String] = []   // 外链/绝对路径：不参与本地决策，原样保留
    var failurePhase: String? = nil     // validate | staging | publish | markdown-commit
    var error: String? = nil
}

/// 最小注入缝：场景在某个资源发布前一刻被回调，可对目标目录做真实文件系统修改
/// （模拟另一文档并发发布同名资源）。引擎不伪造任何错误，遇到的是真实 FS 状态。
/// 属模拟手段而非 OS 故障，场景必须以 injections 标注。
typealias BeforePublishHook = (_ relativePath: String) -> Void

// MARK: - 保存引擎

enum SaveEngine {

    static func managedDirName(forMarkdown url: URL) -> String {
        url.deletingPathExtension().lastPathComponent + ".assets"
    }

    /// 原型级行内图片引用解析（正则限制见 README）；返回原始引用串。
    /// 不覆盖引用式/HTML 等全部语法——保存决策只把它当“已知的引用形态”，
    /// 回滚安全性不依赖该扫描（见 staging 边界）。
    static func imageRefs(inMarkdown data: Data) -> [String] {
        guard let s = String(data: data, encoding: .utf8) else { return [] }
        guard let re = try? NSRegularExpression(pattern: #"!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#) else { return [] }
        let r = NSRange(s.startIndex..., in: s)
        return re.matches(in: s, range: r).compactMap { m in
            Range(m.range(at: 1), in: s).map { String(s[$0]) }
        }
    }

    /// 被用作图片（`![alt][id]` 全形态）的引用式定义 id。
    /// 简写 `![id]`、`![id][]` 折叠形态不覆盖——保守边界，见 README。
    static func imageUsedDefinitionIds(inMarkdown data: Data) -> Set<String> {
        guard let s = String(data: data, encoding: .utf8) else { return [] }
        guard let re = try? NSRegularExpression(pattern: #"!\[[^\]]*\]\[([^\]]+)\]"#) else { return [] }
        let r = NSRange(s.startIndex..., in: s)
        return Set(re.matches(in: s, range: r).compactMap { m in
            Range(m.range(at: 1), in: s).map { String(s[$0]) }
        })
    }

    /// 引用式链接定义 `[id]: path` 的目标（多行模式）。
    /// 只返回被用作图片的定义；普通链接定义（如 `[repo]: ./README`）不混同
    /// 本地图片参与决策（缺陷B保守边界）。
    static func definitionRefs(inMarkdown data: Data) -> [String] {
        guard let s = String(data: data, encoding: .utf8) else { return [] }
        let usedIds = imageUsedDefinitionIds(inMarkdown: data)
        guard let re = try? NSRegularExpression(
            pattern: #"(?m)^[ \t]{0,3}\[([^\]]+)\]:[ \t]+(\S+)(?:[ \t]+"[^"]*")?[ \t]*$"#) else { return [] }
        let r = NSRange(s.startIndex..., in: s)
        return re.matches(in: s, range: r).compactMap { m in
            guard let idR = Range(m.range(at: 1), in: s), let pR = Range(m.range(at: 2), in: s) else { return nil }
            return usedIds.contains(String(s[idR])) ? String(s[pR]) : nil
        }
    }

    /// 托管相对引用解析：拒绝绝对路径、常见 scheme、`..` 越界、符号链接组件。
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

    // MARK: 失败收尾（诚实删除）

    /// 只删除本操作独占的私有 staging 目录；其余文档不可能引用其中路径，因此无需
    /// （也不允许）依赖对目标目录 Markdown 的可读性/语法全覆盖扫描来证明“无引用”。
    /// 删除失败则如实保留为孤儿记录，不以“已清理”掩盖磁盘状态。
    static func rollbackStaging(op: String, staging: URL, session: String,
                                journal: OwnershipJournal, out: inout SaveOutcome) {
        let fm = FileManager.default
        if fm.fileExists(atPath: staging.path) {
            try? fm.removeItem(at: staging)
        }
        if !fm.fileExists(atPath: staging.path) {
            journal.markStagingRolledBack(op: op)
            out.stagingDeleted = true
        } else {
            // 发布使用 copy（而非 move），已发布条目的 staging 副本也可能仍在目录中。
            // 删除失败时直接记录本操作独占的 staging 根，不扫描/猜测其中哪些文件可删。
            journal.record(op: op, session: session, path: staging,
                           event: "kept-orphan-recorded", note: "staging-delete-failed")
            out.orphanedKept.append(staging.path)
            out.stagingDeleted = false
        }
    }

    /// 用 POSIX mkdir 排他创建本操作 staging 根。createDirectory(..., true) 在目录已
    /// 存在时会成功，不能证明所有权；排他创建失败时调用者不得清理该路径。
    static func createPrivateStaging(_ staging: URL) throws {
        let parent = staging.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
        if mkdir(staging.path, S_IRWXU) != 0 {
            let e = errno
            throw NSError(domain: NSPOSIXErrorDomain, code: Int(e), userInfo: [
                NSLocalizedDescriptionKey: "exclusive staging mkdir failed: \(String(cString: strerror(e)))"
            ])
        }
    }

    /// 发布/Markdown 提交失败的统一收尾：已发布资源 → kept-orphan-recorded
    /// （保留在最终位置并记录，不删、不扫描猜测无引用）；未发布 staging → 私有删除。
    static func finalizePublishFailure(op: String, staging: URL, session: String,
                                       journal: OwnershipJournal, out: inout SaveOutcome) {
        let published = journal.ownedPublishedPaths(op: op)
        journal.markOrphansKept(op: op, remaining: Set(published))
        out.orphanedKept += published.filter { FileManager.default.fileExists(atPath: $0) }
        rollbackStaging(op: op, staging: staging, session: session, journal: journal, out: &out)
        out.orphanedKept.sort()
    }

    /// copyItem 失败时的发布期碰撞定界（exists 预检不是原子排他，EEXIST 才是）：
    /// - 目标可读且与 staged 同字节 → 另一发布者的并发同字节结果，无所有权复用，返回 true 继续；
    /// - 目标可读但异字节 / 目标不可读（含悬空符号链接） → publish-collision，返回 false；
    /// - 其它错误 → publish-failed（真实 OS 错误），返回 false。任何路径都不覆盖已有文件。
    static func classifyPublishFailure(stagedURL: URL, final: URL, rel: String, error: Error,
                                       op: String, session: String, journal: OwnershipJournal,
                                       out: inout SaveOutcome) -> Bool {
        if let dest = try? Data(contentsOf: final), let src = try? Data(contentsOf: stagedURL) {
            if dest == src {
                journal.record(op: op, session: session, path: final,
                               event: "reused-no-ownership", note: "concurrent-same-bytes")
                out.reused.append(final.path)
                return true
            }
            out.publishCollisions.append(final.path)
            out.error = "publish-collision-different-bytes: \(rel)"
        } else if ((try? FileManager.default.destinationOfSymbolicLink(atPath: final.path)) ?? nil) != nil {
            out.publishCollisions.append(final.path)
            out.error = "publish-collision-unreadable-dest: \(rel) (symlink invisible to exists-precheck)"
        } else {
            out.error = "publish-failed: \(rel): \(error)"
        }
        out.failurePhase = "publish"
        return false
    }

    /// 首次保存。顺序固定：校验(纯读) → 私有 staging 落盘+读回校验 →
    /// 全部资源发布成功 → 最后原子提交 Markdown → 仅成功后 markSaved。
    /// 发布失败：既有目标 Markdown 逐字节不变；Markdown 提交失败：旧目标保留、
    /// 已发布资源记录为孤儿保留。均不 markSaved、草稿保留。
    static func saveDraft(session: DraftSession, to target: URL,
                          journal: OwnershipJournal, markdown: String,
                          beforePublish: BeforePublishHook? = nil) -> SaveOutcome {
        var out = SaveOutcome()
        let op = "save-" + UUID().uuidString.lowercased()
        let fm = FileManager.default
        let targetDir = target.deletingLastPathComponent()
        let mdir = targetDir.appendingPathComponent(managedDirName(forMarkdown: target), isDirectory: true)
        let staging = targetDir.appendingPathComponent(".inkora-\(op)", isDirectory: true)

        // —— 1. 校验（纯读，不写任何文件；失败时磁盘零改动）——
        var toPublish: [(name: String, file: URL)] = []
        for p in session.pending {
            let final = mdir.appendingPathComponent(p.name)
            guard fm.fileExists(atPath: final.path) else {
                toPublish.append((p.name, p.file)); continue
            }
            guard let existing = try? Data(contentsOf: final),
                  let want = try? Data(contentsOf: p.file) else {
                out.error = "stat-failed: \(p.name)"
                out.failurePhase = "validate"
                return out
            }
            if existing == want {
                // 同名同字节可复用，但不取得清理所有权（文件不属于本操作）
                journal.record(op: op, session: session.id, path: final, event: "reused-no-ownership")
                out.reused.append(final.path)
                continue
            }
            out.conflicts.append(final.path)
            out.error = "conflict-different-bytes: \(p.name)"
            out.failurePhase = "validate"
            return out
        }

        // —— 2. 私有 staging 落盘 + 读回校验（本操作独占目录）——
        if !toPublish.isEmpty {
            out.stagingDir = staging.path
            do {
                try createPrivateStaging(staging)
            } catch {
                // 排他创建失败意味着 staging 不属于本操作，绝不能调用 rollback 删除它。
                out.error = "staging-exclusive-create-failed: \(String(describing: error))"
                out.failurePhase = "staging"
                return out
            }
            do {
                for p in toPublish {
                    let stagedURL = staging.appendingPathComponent(p.name)
                    try fm.copyItem(at: p.file, to: stagedURL)
                    guard let stagedBytes = try? Data(contentsOf: stagedURL),
                          let wantBytes = try? Data(contentsOf: p.file),
                          stagedBytes == wantBytes else {
                        out.error = "staging-verify-failed: \(p.name)"
                        out.failurePhase = "staging"
                        rollbackStaging(op: op, staging: staging, session: session.id,
                                        journal: journal, out: &out)
                        return out
                    }
                    journal.record(op: op, session: session.id, path: stagedURL, event: "staged", note: p.name)
                }
            } catch {
                out.error = "staging-failed: \(String(describing: error))"
                out.failurePhase = "staging"
                rollbackStaging(op: op, staging: staging, session: session.id, journal: journal, out: &out)
                return out
            }
        }

        // —— 3. 发布：全部成功才继续；任何失败都不触碰目标 Markdown ——
        do {
            try fm.createDirectory(at: mdir, withIntermediateDirectories: true)
            for p in toPublish {
                let stagedURL = staging.appendingPathComponent(p.name)
                let final = mdir.appendingPathComponent(p.name)
                let rel = managedDirName(forMarkdown: target) + "/" + p.name
                beforePublish?(rel)
                do {
                    try fm.copyItem(at: stagedURL, to: final)
                } catch {
                    if classifyPublishFailure(stagedURL: stagedURL, final: final, rel: rel, error: error,
                                              op: op, session: session.id, journal: journal, out: &out) {
                        continue // 并发同字节复用，不覆盖、无所有权
                    }
                    finalizePublishFailure(op: op, staging: staging, session: session.id,
                                           journal: journal, out: &out)
                    return out
                }
                journal.markPublished(op: op, at: stagedURL.path, to: final.path)
                out.publishedAssets.append(final.path)
            }
        } catch {
            out.error = "publish-failed: \(String(describing: error))"
            out.failurePhase = "publish"
            finalizePublishFailure(op: op, staging: staging, session: session.id,
                                   journal: journal, out: &out)
            return out
        }

        // —— 4. 最后一步：原子提交 Markdown（此前目标从未被触碰）——
        do {
            try Data(markdown.utf8).write(to: target, options: .atomic)
        } catch {
            out.markdownCommitted = false
            out.error = "markdown-commit-failed: \(String(describing: error))"
            out.failurePhase = "markdown-commit"
            finalizePublishFailure(op: op, staging: staging, session: session.id,
                                   journal: journal, out: &out)
            return out
        }
        out.markdownCommitted = true
        journal.record(op: op, session: session.id, path: target, event: "markdown-committed")

        // —— 5. 成功：清私有 staging、journal 提交、markSaved ——
        rollbackStaging(op: op, staging: staging, session: session.id, journal: journal, out: &out)
        journal.commitStaged(op: op)
        session.markSaved() // markSaved 仅在全流程成功之后
        out.saved = true
        out.markSaved = true
        return out
    }

    /// 显式放弃草稿：仅在明确放弃时删除会话自有文件，不触碰来源或其它草稿。
    static func abandon(session: DraftSession, journal: OwnershipJournal) {
        try? FileManager.default.removeItem(at: session.dir)
        journal.record(op: "abandon", session: session.id, path: session.dir, event: "session-purged")
    }

    /// Save As：提交顺序与 saveDraft 相同（校验→staging→发布→最后写 Markdown）。
    /// 原字节保留原 Markdown 引用；托管资源按**原目录名**复制到新位置；
    /// 未托管相对引用（含引用式图片定义）在目标等价位置无法解析到同字节资源时
    /// 明确阻塞，不悄悄保存成断链（缺陷B）；不删除原资源/原文档。
    static func saveAs(from source: URL, to target: URL, journal: OwnershipJournal,
                       beforePublish: BeforePublishHook? = nil) -> SaveOutcome {
        var out = SaveOutcome()
        let op = "saveas-" + UUID().uuidString.lowercased()
        let fm = FileManager.default
        guard let mdBytes = try? Data(contentsOf: source) else {
            out.error = "source-read-failed: \(source.path)"
            out.failurePhase = "validate"
            return out
        }
        let srcDir = source.deletingLastPathComponent()
        let dstDir = target.deletingLastPathComponent()
        let staging = dstDir.appendingPathComponent(".inkora-\(op)", isDirectory: true)

        // —— 1. 校验（纯读；阻塞时目标目录零改动）——
        var dirsToCopy = Set<String>()
        var sourceMissing: [String] = []   // 源不存在（011 语义保留）
        var targetMissing: [String] = []   // 源存在但目标缺失等价资源（缺陷B）
        var targetConflicts: [String] = [] // 目标同路径异字节（缺陷B）
        var passthrough: [String] = []
        let refs = Array(Set(imageRefs(inMarkdown: mdBytes) + definitionRefs(inMarkdown: mdBytes))).sorted()
        for ref in refs {
            switch resolveManaged(markdownDir: srcDir, ref: ref) {
            case .failure(let e):
                if e.message.hasPrefix("scheme-rejected:") || e.message.hasPrefix("absolute-rejected:") {
                    // 外链/绝对路径：移动文档不改变其可用性，引用字节原样保留
                    passthrough.append(ref)
                } else {
                    out.error = "ref-resolve-failed: \(e.message)"
                    out.failurePhase = "validate"
                    return out
                }
            case .success(let srcURL):
                if !fm.fileExists(atPath: srcURL.path) {
                    sourceMissing.append(ref)
                    continue
                }
                let dirName = srcURL.deletingLastPathComponent().lastPathComponent
                if dirName.hasSuffix(".assets") {
                    dirsToCopy.insert(dirName)
                    continue
                }
                // 未托管相对引用（源存在）：目标等价位置必须已解析到同字节资源；
                // 本原型无复制/授权通道，缺失或异字节都明确阻塞，不保存成断链。
                if case .success(let dstURL) = resolveManaged(markdownDir: dstDir, ref: ref),
                   fm.fileExists(atPath: dstURL.path),
                   let srcBytes = try? Data(contentsOf: srcURL),
                   let dstBytes = try? Data(contentsOf: dstURL) {
                    if srcBytes == dstBytes {
                        journal.record(op: op, session: "n/a", path: dstURL,
                                       event: "reused-no-ownership", note: "unmanaged-equivalent-same-bytes")
                        out.reused.append(dstURL.path)
                    } else {
                        targetConflicts.append(ref)
                    }
                } else {
                    targetMissing.append(ref)
                }
            }
        }
        out.passthroughExternalRefs = passthrough.sorted()
        out.unmanagedRelativeRefs = sourceMissing.sorted()
        out.unmanagedTargetMissing = targetMissing.sorted()
        out.unmanagedTargetConflicts = targetConflicts.sorted()
        if !targetConflicts.isEmpty {
            out.error = "blocked-target-conflict-different-bytes"
        } else if !sourceMissing.isEmpty || !targetMissing.isEmpty {
            out.error = "blocked-unmanaged-relative-refs"
        }
        if out.error != nil {
            out.failurePhase = "validate"
            journal.record(op: op, session: "n/a", path: target, event: "blocked",
                           note: (sourceMissing + targetMissing + targetConflicts).sorted().joined(separator: ","))
            return out
        }

        // 托管目录逐文件校验：同字节复用（无所有权）/ 异字节冲突（不覆盖）
        var toStage: [(dir: String, name: String, src: URL)] = []
        for d in dirsToCopy.sorted() {
            let srcD = srcDir.appendingPathComponent(d, isDirectory: true)
            guard let files = try? fm.contentsOfDirectory(at: srcD, includingPropertiesForKeys: nil) else {
                out.error = "managed-dir-read-failed: \(d)"
                out.failurePhase = "validate"
                return out
            }
            for f in files {
                let final = dstDir.appendingPathComponent(d, isDirectory: true)
                    .appendingPathComponent(f.lastPathComponent)
                if fm.fileExists(atPath: final.path) {
                    guard let a = try? Data(contentsOf: f), let b = try? Data(contentsOf: final) else {
                        out.error = "stat-failed: \(d)/\(f.lastPathComponent)"
                        out.failurePhase = "validate"
                        return out
                    }
                    if a == b {
                        journal.record(op: op, session: "n/a", path: final, event: "reused-no-ownership")
                        out.reused.append(final.path)
                        continue
                    }
                    out.conflicts.append(final.path)
                    out.error = "conflict-different-bytes: \(d)/\(f.lastPathComponent)"
                    out.failurePhase = "validate"
                    return out
                }
                toStage.append((d, f.lastPathComponent, f))
            }
        }

        // —— 2. 私有 staging 落盘 + 读回校验 ——
        if !toStage.isEmpty {
            out.stagingDir = staging.path
            do {
                try fm.createDirectory(at: dstDir, withIntermediateDirectories: true)
                try createPrivateStaging(staging)
            } catch {
                // 排他创建失败时 staging 不是本操作所有，不能回滚/删除。
                out.error = "staging-exclusive-create-failed: \(String(describing: error))"
                out.failurePhase = "staging"
                return out
            }
            do {
                for t in toStage {
                    let stagedD = staging.appendingPathComponent(t.dir, isDirectory: true)
                    try fm.createDirectory(at: stagedD, withIntermediateDirectories: true)
                    let s = stagedD.appendingPathComponent(t.name)
                    try fm.copyItem(at: t.src, to: s)
                    guard let a = try? Data(contentsOf: s), let b = try? Data(contentsOf: t.src), a == b else {
                        out.error = "staging-verify-failed: \(t.dir)/\(t.name)"
                        out.failurePhase = "staging"
                        rollbackStaging(op: op, staging: staging, session: "n/a",
                                        journal: journal, out: &out)
                        return out
                    }
                    journal.record(op: op, session: "n/a", path: s, event: "staged", note: "\(t.dir)/\(t.name)")
                }
            } catch {
                out.error = "staging-failed: \(String(describing: error))"
                out.failurePhase = "staging"
                rollbackStaging(op: op, staging: staging, session: "n/a", journal: journal, out: &out)
                return out
            }
        }

        // —— 3. 发布：全部成功才继续 ——
        for t in toStage {
            let s = staging.appendingPathComponent(t.dir, isDirectory: true).appendingPathComponent(t.name)
            let dstD = dstDir.appendingPathComponent(t.dir, isDirectory: true)
            let final = dstD.appendingPathComponent(t.name)
            let rel = "\(t.dir)/\(t.name)"
            beforePublish?(rel)
            do {
                try fm.createDirectory(at: dstD, withIntermediateDirectories: true)
                try fm.copyItem(at: s, to: final)
            } catch {
                if classifyPublishFailure(stagedURL: s, final: final, rel: rel, error: error,
                                          op: op, session: "n/a", journal: journal, out: &out) {
                    continue
                }
                finalizePublishFailure(op: op, staging: staging, session: "n/a",
                                       journal: journal, out: &out)
                return out
            }
            journal.markPublished(op: op, at: s.path, to: final.path)
            out.publishedAssets.append(final.path)
        }

        // —— 4. 最后一步：原字节原子提交新 Markdown（不改写引用）——
        do {
            try mdBytes.write(to: target, options: .atomic)
        } catch {
            out.markdownCommitted = false
            out.error = "markdown-commit-failed: \(String(describing: error))"
            out.failurePhase = "markdown-commit"
            finalizePublishFailure(op: op, staging: staging, session: "n/a",
                                   journal: journal, out: &out)
            return out
        }
        out.markdownCommitted = true
        journal.record(op: op, session: "n/a", path: target, event: "markdown-committed")

        // —— 5. 成功清理（不删除原文档/原资源）——
        rollbackStaging(op: op, staging: staging, session: "n/a", journal: journal, out: &out)
        journal.commitStaged(op: op)
        out.saved = true
        out.markSaved = true
        return out
    }
}

struct RefError: Error { let message: String; init(_ m: String) { message = m } }

// MARK: - 场景框架

struct ScenarioResult: Codable {
    let name: String
    var pass: Bool = true
    var detail: [String] = []
    var injections: [String] = [] // 故障注入标注：真实 FS 条件 vs 模拟注入缝
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
    func inject(_ label: String) { result.injections.append(label) }
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

func stagingLeftovers(_ dir: URL) -> [String] {
    let names = (try? fm.contentsOfDirectory(atPath: dir.path)) ?? []
    return names.filter { $0.hasPrefix(".inkora-save") }
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
        s.check(imported.name == "图 片%20.png", "preferred single legal name kept verbatim")
        s.check(session.dirty && !session.saved, "dirty=true saved=false before first save")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S1-draft-import-retained", pass: false, detail: ["FAIL threw \(error)"])) }

    // S2 资源已发布后 Markdown 提交失败（真实注入：目标路径被目录占用）：
    // 不 markSaved；已发布资源按孤儿保留并记录；只删私有 staging；草稿字节与无关文件不变
    do {
        let s = Scenario("S2-markdown-commit-failure-keeps-target")
        s.inject("real-fs-fault: Markdown 目标路径被目录占用（真实 EISDIR 类错误，非模拟异常）")
        let base = try makeDir(root.appendingPathComponent("s2", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let bytes = Data("PNGDATA-S2".utf8)
        let imported = try session.importImage(bytes: bytes, preferredName: "a.png", journal: journal)
        let md = base.appendingPathComponent("note.md")
        _ = try makeDir(md) // 故障注入：Markdown 目标路径被目录占用，真实写失败
        let pre = base.appendingPathComponent("unrelated.txt")
        try Data("untouched".utf8).write(to: pre)
        s.snapshot([imported.file, pre], into: \.initial)
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: "# n\n\n![](note.assets/a.png)\n")
        s.check(!out.saved && !out.markSaved && out.markdownCommitted == false
                && out.failurePhase == "markdown-commit",
                "not saved, no markSaved, commit actually failed (phase=\(out.failurePhase ?? ""))")
        s.check(out.error?.hasPrefix("markdown-commit-failed") == true, "error recorded: \(out.error ?? "")")
        let mdir = base.appendingPathComponent("note.assets", isDirectory: true)
        let published = mdir.appendingPathComponent("a.png")
        s.check(out.publishedAssets == [published.path], "asset published before markdown commit (order)")
        s.check(fm.fileExists(atPath: published.path)
                && sha256Hex(published) == sha256Hex(bytes)
                && out.orphanedKept == [published.path],
                "published asset kept as recorded orphan, bytes intact")
        s.check(out.stagingDeleted && stagingLeftovers(base).isEmpty, "private staging rolled back, no leftovers")
        s.snapshot([imported.file, pre], into: \.final)
        s.check(s.result.initial.map(\.sha256) == s.result.final.map(\.sha256), "draft + unrelated file SHAs unchanged")
        s.check(session.dirty && !session.saved, "session still dirty, not saved")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S2-markdown-commit-failure-keeps-target", pass: false, detail: ["FAIL threw \(error)"])) }

    // S3 首次保存成功：托管相对路径与资源同在，字节一致
    do {
        let s = Scenario("S3-first-save-success")
        let base = try makeDir(root.appendingPathComponent("s3", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let bytes = Data("PNGDATA-S3-中文".utf8)
        _ = try session.importImage(bytes: bytes, preferredName: "图 片%20.png", journal: journal)
        let md = base.appendingPathComponent("笔记 note.md")
        let ref = "笔记 note.assets/图%20片%2520.png"
        let markdown = "# 标题\n\n![图](\(ref))\n"
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: markdown)
        s.check(out.saved && out.markSaved && out.markdownCommitted == true, "saved + markSaved after full flow")
        s.check(fm.fileExists(atPath: md.path), "markdown exists")
        s.check(stagingLeftovers(base).isEmpty, "staging cleaned after publish")
        if case .success(let resolved) = SaveEngine.resolveManaged(markdownDir: base, ref: ref) {
            s.check(fm.fileExists(atPath: resolved.path), "percent/中文/空格 ref resolves: \(resolved.path)")
            s.check(sha256Hex(resolved) == sha256Hex(bytes), "managed bytes SHA == draft bytes")
        } else { s.check(false, "ref resolve failed") }
        s.check(session.saved && !session.dirty, "session clean after success")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S3-first-save-success", pass: false, detail: ["FAIL threw \(error)"])) }

    // S4 Save As：不改引用字节、不删原资源、托管资源随迁（含引用式定义同路径）
    do {
        let s = Scenario("S4-save-as-byte-identical")
        let srcBase = try makeDir(root.appendingPathComponent("s4-src", isDirectory: true))
        let srcMD = srcBase.appendingPathComponent("笔记 note.md")
        let srcAsset = try makeDir(srcBase.appendingPathComponent("笔记 note.assets", isDirectory: true))
            .appendingPathComponent("图 名.png")
        try Data("PNG-S4".utf8).write(to: srcAsset)
        try Data("# S4\n\n![x](%E7%AC%94%E8%AE%B0%20note.assets/%E5%9B%BE%20%E5%90%8D.png)\n\n[y]: %E7%AC%94%E8%AE%B0%20note.assets/%E5%9B%BE%20%E5%90%8D.png \"t\"\n".utf8).write(to: srcMD)
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
        s.check(out.publishedAssets.count == 1, "asset published before markdown commit (order)")
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
        // 5a 预置同字节文件 → 复用；随后 Markdown 提交失败 → 不得删除预置文件
        let mdA = base.appendingPathComponent("a.md")
        let mdirA = try makeDir(base.appendingPathComponent("a.assets", isDirectory: true))
        try bytes.write(to: mdirA.appendingPathComponent("same.png"))
        _ = try makeDir(mdA) // Markdown 提交失败注入（真实）
        let outA = SaveEngine.saveDraft(session: session, to: mdA, journal: journal, markdown: "![](a.assets/same.png)")
        s.check(outA.reused == [mdirA.appendingPathComponent("same.png").path], "same-bytes reused, error=\(outA.error ?? "nil")")
        s.check(outA.failurePhase == "markdown-commit" && !outA.saved, "failed at markdown commit after reuse")
        s.check(stagingLeftovers(base).isEmpty, "no staging created (nothing to publish)")
        s.check(fm.fileExists(atPath: mdirA.appendingPathComponent("same.png").path)
                && sha256Hex(mdirA.appendingPathComponent("same.png")) == sha256Hex(bytes),
                "reused pre-existing file NOT deleted (no ownership)")
        // 5b 预置异内容 → 校验期拒绝且不覆盖（磁盘零改动）
        let mdB = base.appendingPathComponent("b.md")
        let mdirB = try makeDir(base.appendingPathComponent("b.assets", isDirectory: true))
        try Data("DIFFERENT".utf8).write(to: mdirB.appendingPathComponent("same.png"))
        let outB = SaveEngine.saveDraft(session: session, to: mdB, journal: journal, markdown: "![](b.assets/same.png)")
        s.check(!outB.saved && outB.conflicts == [mdirB.appendingPathComponent("same.png").path]
                && outB.failurePhase == "validate", "different-bytes rejected at validation (nothing written)")
        s.check(sha256Hex(mdirB.appendingPathComponent("same.png")) == sha256Hex(Data("DIFFERENT".utf8)), "target not overwritten")
        s.check(stagingLeftovers(base).isEmpty, "no staging leftovers")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S5-conflict-rules", pass: false, detail: ["FAIL threw \(error)"])) }

    // S6 校验中止所有权边界：目标目录含不可读文档与引用式图片时，校验期冲突
    // 中止不写任何文件；回滚安全性不依赖对目标文档的可读性/语法全覆盖扫描
    do {
        let s = Scenario("S6-validation-abort-boundary")
        s.inject("real-fs-fault: 校验期异内容冲突 + 预置不可读文档（chmod 000）")
        let base = try makeDir(root.appendingPathComponent("s6", isDirectory: true))
        let mdir = try makeDir(base.appendingPathComponent("note.assets", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        _ = try session.importImage(bytes: Data("KEEP".utf8), preferredName: "keep.png", journal: journal)
        _ = try session.importImage(bytes: Data("DROP".utf8), preferredName: "drop.png", journal: journal)
        // 行内引用文档
        let other = base.appendingPathComponent("other.md")
        try Data("![](note.assets/keep.png)\n".utf8).write(to: other)
        // 引用式定义文档（行内正则不覆盖的形态）
        let refstyle = base.appendingPathComponent("refstyle.md")
        try Data("![图][img]\n\n[img]: note.assets/refonly.png \"标题\"\n".utf8).write(to: refstyle)
        try Data("REFONLY".utf8).write(to: mdir.appendingPathComponent("refonly.png"))
        try Data("KEEP-PRE".utf8).write(to: mdir.appendingPathComponent("keep.png"))
        // 不可读文档（读取失败不得被当成“无引用”）
        let locked = base.appendingPathComponent("locked.md")
        try Data("![l](note.assets/keep.png)\n".utf8).write(to: locked)
        try? fm.setAttributes([.posixPermissions: 0o000], ofItemAtPath: locked.path)
        defer { try? fm.setAttributes([.posixPermissions: 0o644], ofItemAtPath: locked.path) }
        let md = base.appendingPathComponent("note.md")
        try Data("# OLD".utf8).write(to: md)
        let before = [mdir.appendingPathComponent("keep.png"),
                      mdir.appendingPathComponent("refonly.png"),
                      other, refstyle, md].map(shaRecord)
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: "![](note.assets/keep.png) ![](note.assets/drop.png)")
        s.check(!out.saved && out.failurePhase == "validate"
                && out.error?.hasPrefix("conflict-different-bytes") == true,
                "validation abort on keep.png conflict: \(out.error ?? "")")
        s.check(out.publishedAssets.isEmpty && out.stagingDir == nil, "nothing staged/published before validation passes")
        s.check(stagingLeftovers(base).isEmpty, "no staging leftovers")
        let after = [mdir.appendingPathComponent("keep.png"),
                     mdir.appendingPathComponent("refonly.png"),
                     other, refstyle, md].map(shaRecord)
        s.check(before.map(\.sha256) == after.map(\.sha256), "pre-existing assets + docs + old markdown untouched (incl. refstyle target)")
        s.check(!fm.fileExists(atPath: mdir.appendingPathComponent("drop.png").path), "no unpublished copy ever created")
        s.check(session.dirty && !session.saved, "draft retained")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S6-validation-abort-boundary", pass: false, detail: ["FAIL threw \(error)"])) }

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

    // S10 同名不同字节导入：实际分配唯一名，两张都保存成功且引用各自字节
    do {
        let s = Scenario("S10-unique-name-same-preferred")
        let base = try makeDir(root.appendingPathComponent("s10", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let b1 = Data("UNIQUE-A".utf8), b2 = Data("UNIQUE-B-BYTES".utf8)
        let p1 = try session.importImage(bytes: b1, preferredName: "dup.png", journal: journal)
        let p2 = try session.importImage(bytes: b2, preferredName: "dup.png", journal: journal)
        s.check(p1.name == "dup.png" && p2.name == "dup-1.png", "second same-name import got unique name: \(p1.name), \(p2.name)")
        s.check(p1.file.path != p2.file.path, "distinct session files")
        let md = base.appendingPathComponent("dup.md")
        let markdown = "# dup\n\n![a](dup.assets/\(p1.name))\n\n![b](dup.assets/\(p2.name))\n"
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal, markdown: markdown)
        s.check(out.saved && out.conflicts.isEmpty, "saved without conflict, error=\(out.error ?? "nil")")
        let mdir = base.appendingPathComponent("dup.assets", isDirectory: true)
        s.check(sha256Hex(mdir.appendingPathComponent("dup.png")) == sha256Hex(b1), "first bytes at canonical name")
        s.check(sha256Hex(mdir.appendingPathComponent("dup-1.png")) == sha256Hex(b2), "second bytes at unique name")
        // 非法 preferredName 拒绝
        do {
            _ = try session.importImage(bytes: b1, preferredName: "../evil.png", journal: journal)
            s.check(false, "path-bearing preferredName should be rejected")
        } catch { s.check(true, "path-bearing preferredName rejected") }
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S10-unique-name-same-preferred", pass: false, detail: ["FAIL threw \(error)"])) }

    // S11 第2张资源发布失败（第1张已发布）。真实 FS 条件：悬空符号链接占据 b.png
    // 最终路径 —— fileExists 预检跟随符号链接返回 false（证明 exists 预检不是原子
    // 排他），copyItem 以 lstat 语义拒绝（EEXIST）。断言：既有 note.md 逐字节不变、
    // 原图片/其它会话不变、dirty 与草稿保留、a.png 作为已发布孤儿保留并记录、
    // 未发布私有 staging 删除、悬空符号链接（非本操作创建）不被删除。
    do {
        let s = Scenario("S11-publish-failure-second-asset")
        s.inject("real-fs-fault: 悬空符号链接占据 b.png 最终路径（fileExists 预检不可见；copyItem EEXIST）")
        let base = try makeDir(root.appendingPathComponent("s11", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let b1 = Data("PNG-A".utf8), b2 = Data("PNG-B".utf8)
        let pa = try session.importImage(bytes: b1, preferredName: "a.png", journal: journal)
        let pb = try session.importImage(bytes: b2, preferredName: "b.png", journal: journal)
        let md = base.appendingPathComponent("note.md")
        try Data("# OLD".utf8).write(to: md) // 既有旧 Markdown：失败后必须逐字节不变
        let otherSession = try DraftSession(root: root, journal: journal)
        let otherAsset = try otherSession.importImage(bytes: Data("OTHER".utf8), preferredName: "o.png", journal: journal)
        let otherDocDir = try makeDir(base.appendingPathComponent("other.assets", isDirectory: true))
        let otherDocAsset = otherDocDir.appendingPathComponent("keep.png")
        try Data("OTHER-DOC-ASSET".utf8).write(to: otherDocAsset)
        let mdir = try makeDir(base.appendingPathComponent("note.assets", isDirectory: true))
        let dang = mdir.appendingPathComponent("b.png")
        try fm.createSymbolicLink(at: dang, withDestinationURL: base.appendingPathComponent("missing-target.png"))
        s.snapshot([md, pa.file, pb.file, otherAsset.file, otherDocAsset], into: \.initial)
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal,
                                       markdown: "![](note.assets/a.png) ![](note.assets/b.png)")
        s.check(!out.saved && !out.markSaved && out.markdownCommitted == nil
                && out.failurePhase == "publish",
                "publish-phase failure, not saved/markSaved (phase=\(out.failurePhase ?? ""))")
        s.check(out.error?.hasPrefix("publish-collision") == true, "collision boundary recorded: \(out.error ?? "")")
        s.snapshot([md, pa.file, pb.file, otherAsset.file, otherDocAsset], into: \.final)
        s.check(s.result.initial.map(\.sha256) == s.result.final.map(\.sha256),
                "old markdown + draft bytes + OTHER session/doc asset unchanged (SHA)")
        let publishedA = mdir.appendingPathComponent("a.png")
        s.check(fm.fileExists(atPath: publishedA.path)
                && sha256Hex(publishedA) == sha256Hex(b1)
                && out.publishedAssets == [publishedA.path]
                && out.orphanedKept == [publishedA.path],
                "first asset published-orphan kept, bytes intact, recorded at final path")
        s.check(out.stagingDeleted && stagingLeftovers(base).isEmpty, "unpublished private staging deleted")
        let stillLink = (try? fm.destinationOfSymbolicLink(atPath: dang.path)) ?? nil
        s.check(stillLink != nil, "pre-existing dangling symlink NOT removed (no ownership)")
        s.check(session.dirty && !session.saved, "session still dirty, draft retained")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S11-publish-failure-second-asset", pass: false, detail: ["FAIL threw \(error)"])) }

    // S12 资源全部发布成功后 Markdown 提交失败。真实 FS 条件：旧 note.md 置
    // chflags uchg（SF_IMMUTABLE）→ Data.write(.atomic) 的 rename 得 EPERM，
    // 旧字节保持、无临时残留。断言：旧 Markdown SHA 不变、已发布资源保留并记录
    // 且不 markSaved、草稿保留。S12b 为 saveAs 同类变体（旧目标逐字节不变）。
    do {
        let s = Scenario("S12-markdown-commit-failure-after-full-publish")
        s.inject("real-fs-fault: chflags uchg(SF_IMMUTABLE) 旧 note.md → 原子写 rename EPERM")
        let base = try makeDir(root.appendingPathComponent("s12", isDirectory: true))
        let session = try DraftSession(root: root, journal: journal)
        let b1 = Data("PNG-A12".utf8), b2 = Data("PNG-B12".utf8)
        let pa = try session.importImage(bytes: b1, preferredName: "a.png", journal: journal)
        let pb = try session.importImage(bytes: b2, preferredName: "b.png", journal: journal)
        let md = base.appendingPathComponent("note.md")
        try Data("# OLD-UNCHANGED".utf8).write(to: md)
        let otherSession = try DraftSession(root: root, journal: journal)
        let otherSessionAsset = try otherSession.importImage(
            bytes: Data("OTHER-SESSION-12".utf8), preferredName: "keep.png", journal: journal)
        let otherDocDir = try makeDir(base.appendingPathComponent("other.assets", isDirectory: true))
        let otherDocAsset = otherDocDir.appendingPathComponent("keep.png")
        try Data("OTHER-DOC-12".utf8).write(to: otherDocAsset)
        try fm.setAttributes([.immutable: true], ofItemAtPath: md.path)
        defer { try? fm.setAttributes([.immutable: false], ofItemAtPath: md.path) } // 保证 scratch 可清理
        s.snapshot([md, pa.file, pb.file, otherSessionAsset.file, otherDocAsset], into: \.initial)
        let out = SaveEngine.saveDraft(session: session, to: md, journal: journal,
                                       markdown: "![](note.assets/a.png) ![](note.assets/b.png)")
        s.check(!out.saved && !out.markSaved && out.markdownCommitted == false
                && out.failurePhase == "markdown-commit",
                "markdown commit failed after full publish, not saved/markSaved")
        s.check(out.publishedAssets.count == 2, "both assets published before commit attempt")
        s.snapshot([md, pa.file, pb.file, otherSessionAsset.file, otherDocAsset], into: \.final)
        s.check(s.result.initial.map(\.sha256) == s.result.final.map(\.sha256),
                "old markdown + drafts + OTHER session/doc asset SHAs unchanged")
        let mdir = base.appendingPathComponent("note.assets", isDirectory: true)
        let fa = mdir.appendingPathComponent("a.png"), fb2 = mdir.appendingPathComponent("b.png")
        s.check(fm.fileExists(atPath: fa.path) && sha256Hex(fa) == sha256Hex(b1)
                && fm.fileExists(atPath: fb2.path) && sha256Hex(fb2) == sha256Hex(b2),
                "published assets kept with correct bytes")
        s.check(out.orphanedKept.sorted() == [fa.path, fb2.path].sorted(), "both orphans recorded at final paths")
        s.check(out.stagingDeleted && stagingLeftovers(base).isEmpty, "private staging deleted, no temp leftovers")
        s.check(session.dirty && !session.saved, "session still dirty")
        // —— S12b：saveAs 同类故障 ——
        let srcBase = try makeDir(root.appendingPathComponent("s12b-src", isDirectory: true))
        let srcMD = srcBase.appendingPathComponent("原 doc.md")
        _ = try makeDir(srcBase.appendingPathComponent("原 doc.assets", isDirectory: true))
        let srcAsset = srcBase.appendingPathComponent("原 doc.assets/m.png")
        try Data("M12B".utf8).write(to: srcAsset)
        try Data("![m](%E5%8E%9F%20doc.assets/m.png)\n".utf8).write(to: srcMD)
        let dstBase = try makeDir(root.appendingPathComponent("s12b-dst", isDirectory: true))
        let dstMD = dstBase.appendingPathComponent("新 doc.md")
        try Data("# OLD-DST".utf8).write(to: dstMD)
        let unrelatedDir = try makeDir(dstBase.appendingPathComponent("unrelated.assets", isDirectory: true))
        let unrelatedAsset = unrelatedDir.appendingPathComponent("keep.png")
        try Data("UNRELATED-12B".utf8).write(to: unrelatedAsset)
        try fm.setAttributes([.immutable: true], ofItemAtPath: dstMD.path)
        defer { try? fm.setAttributes([.immutable: false], ofItemAtPath: dstMD.path) }
        let beforeB = [srcMD, srcAsset, dstMD, unrelatedAsset].map(shaRecord)
        let outB = SaveEngine.saveAs(from: srcMD, to: dstMD, journal: journal)
        s.check(!outB.saved && outB.markdownCommitted == false && outB.failurePhase == "markdown-commit",
                "S12b saveAs markdown commit failed: \(outB.error ?? "")")
        let afterB = [srcMD, srcAsset, dstMD, unrelatedAsset].map(shaRecord)
        s.check(beforeB.map(\.sha256) == afterB.map(\.sha256),
                "S12b source + old target + unrelated resource byte-identical (SHA)")
        let pubB = dstBase.appendingPathComponent("原 doc.assets/m.png")
        s.check(fm.fileExists(atPath: pubB.path) && outB.orphanedKept == [pubB.path],
                "S12b published asset kept + recorded as orphan")
        s.check(stagingLeftovers(dstBase).isEmpty, "S12b no staging leftovers")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S12-markdown-commit-failure-after-full-publish", pass: false, detail: ["FAIL threw \(error)"])) }

    // S13 并发发布同名资源定界。注入缝 beforePublish 在发布瞬间写入目标路径，
    // 模拟另一文档并发发布（模拟手段，非 OS 故障）。定界：
    // - 同字节出现 → 无所有权复用，流程继续成功，不覆盖；
    // - 异字节出现 → publish-collision-different-bytes 明确失败，不覆盖，
    //   已发布的第1张资源按孤儿保留，注入文件（非本操作创建）不被删除。
    do {
        let s = Scenario("S13-concurrent-publisher-boundary")
        s.inject("simulated-concurrency: beforePublish 注入缝（场景代码在发布瞬间写入目标，模拟另一文档并发发布；非 OS 故障）")
        // 13a 同字节并发 → 复用并成功
        let baseA = try makeDir(root.appendingPathComponent("s13a", isDirectory: true))
        let sessionA = try DraftSession(root: root, journal: journal)
        let sb = Data("SHARED-SAME".utf8)
        _ = try sessionA.importImage(bytes: sb, preferredName: "s.png", journal: journal)
        let mdA = baseA.appendingPathComponent("c1.md")
        try Data("# OLD1".utf8).write(to: mdA)
        let mdirA = baseA.appendingPathComponent("c1.assets", isDirectory: true)
        let outA = SaveEngine.saveDraft(session: sessionA, to: mdA, journal: journal,
                                        markdown: "![](c1.assets/s.png)",
                                        beforePublish: { rel in
                                            if rel == "c1.assets/s.png" {
                                                try? sb.write(to: mdirA.appendingPathComponent("s.png"))
                                            }
                                        })
        s.check(outA.saved && outA.markSaved && outA.markdownCommitted == true,
                "13a concurrent same-bytes reuses and succeeds, error=\(outA.error ?? "nil")")
        s.check(outA.reused == [mdirA.appendingPathComponent("s.png").path]
                && outA.publishedAssets.isEmpty,
                "13a reused without ownership, nothing published by us")
        s.check(sha256Hex(mdirA.appendingPathComponent("s.png")) == sha256Hex(sb), "13a target bytes = concurrent same bytes")
        s.check(stagingLeftovers(baseA).isEmpty, "13a no staging leftovers")
        // 13b 异字节并发（第2张）→ 明确失败，第1张孤儿保留，注入文件不被删
        let baseB = try makeDir(root.appendingPathComponent("s13b", isDirectory: true))
        let sessionB = try DraftSession(root: root, journal: journal)
        let x1 = Data("X1".utf8)
        _ = try sessionB.importImage(bytes: x1, preferredName: "x1.png", journal: journal)
        _ = try sessionB.importImage(bytes: Data("X2".utf8), preferredName: "x2.png", journal: journal)
        let mdB = baseB.appendingPathComponent("c2.md")
        try Data("# OLD2".utf8).write(to: mdB)
        let mdirB = try makeDir(baseB.appendingPathComponent("c2.assets", isDirectory: true))
        let raced = mdirB.appendingPathComponent("x2.png")
        let outB = SaveEngine.saveDraft(session: sessionB, to: mdB, journal: journal,
                                        markdown: "![](c2.assets/x1.png) ![](c2.assets/x2.png)",
                                        beforePublish: { rel in
                                            if rel == "c2.assets/x2.png" {
                                                try? Data("RACED-DIFFERENT".utf8).write(to: raced)
                                            }
                                        })
        s.check(!outB.saved && !outB.markSaved && outB.failurePhase == "publish"
                && outB.error?.hasPrefix("publish-collision-different-bytes") == true,
                "13b different-bytes collision fails explicitly: \(outB.error ?? "")")
        s.check(sha256Hex(mdB) == sha256Hex(Data("# OLD2".utf8)), "13b old markdown SHA unchanged")
        let pubX1 = mdirB.appendingPathComponent("x1.png")
        s.check(fm.fileExists(atPath: pubX1.path) && outB.orphanedKept == [pubX1.path],
                "13b first asset published-orphan kept + recorded")
        s.check(sha256Hex(raced) == sha256Hex(Data("RACED-DIFFERENT".utf8)),
                "13b concurrently-created file NOT overwritten/deleted (no ownership)")
        s.check(outB.stagingDeleted && stagingLeftovers(baseB).isEmpty, "13b unpublished staging deleted")
        s.check(sessionB.dirty && !sessionB.saved, "13b draft retained")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S13-concurrent-publisher-boundary", pass: false, detail: ["FAIL threw \(error)"])) }

    // S14 Save As 未托管相对引用（缺陷B）三类对照 + 引用式图片定义：
    // - 源存在/目标缺失（含 [cdef] 引用式定义）→ 阻塞，目标零改动；
    // - 目标已同字节 → 放行，引用字节原样保留，无所有权复用，不复制；
    // - 目标同路径异字节 → 阻塞，不覆盖。
    // 外链定义（含未用作图片的普通链接定义）不混同本地图片，不阻塞。
    do {
        let s = Scenario("S14-saveas-unmanaged-relative-refs")
        let srcBase = try makeDir(root.appendingPathComponent("s14-src", isDirectory: true))
        let pics = try makeDir(srcBase.appendingPathComponent("pics", isDirectory: true))
        let bytesA = Data("PIC-A".utf8), bytesB = Data("PIC-B".utf8), bytesC = Data("PIC-C".utf8)
        try bytesA.write(to: pics.appendingPathComponent("a.png"))
        try bytesB.write(to: pics.appendingPathComponent("b.png"))
        try bytesC.write(to: pics.appendingPathComponent("c.png"))
        let dstBase = try makeDir(root.appendingPathComponent("s14-dst", isDirectory: true))

        // 14a 源存在/目标缺失（含引用式图片定义 [cdef]）→ 明确阻塞
        let mdA = srcBase.appendingPathComponent("a.md")
        try Data("![a](pics/a.png)\n![b](pics/b.png)\n![c][cdef]\n\n[cdef]: pics/c.png \"t\"\n".utf8).write(to: mdA)
        s.snapshot([mdA, pics.appendingPathComponent("a.png")], into: \.initial)
        let dstMDA = dstBase.appendingPathComponent("copy-a.md")
        let outA = SaveEngine.saveAs(from: mdA, to: dstMDA, journal: journal)
        s.check(!outA.saved && outA.failurePhase == "validate"
                && outA.error == "blocked-unmanaged-relative-refs",
                "14a blocked with explicit reason: \(outA.error ?? "")")
        s.check(outA.unmanagedTargetMissing.sorted() == ["pics/a.png", "pics/b.png", "pics/c.png"],
                "14a all three refs (inline ×2 + reference-style def) classified target-missing")
        s.check(!fm.fileExists(atPath: dstMDA.path)
                && stagingLeftovers(dstBase).isEmpty
                && ((try? fm.contentsOfDirectory(atPath: dstBase.path)) ?? []).isEmpty,
                "14a target dir untouched (no markdown, no staging, no partial files)")
        s.snapshot([mdA, pics.appendingPathComponent("a.png")], into: \.final)
        s.check(s.result.initial.map(\.sha256) == s.result.final.map(\.sha256), "14a source untouched")

        // 14b 目标已同字节 → 放行且不复制；普通链接定义/外链不阻塞
        _ = try makeDir(dstBase.appendingPathComponent("pics", isDirectory: true))
        try bytesB.write(to: dstBase.appendingPathComponent("pics/b.png"))
        let mdB = srcBase.appendingPathComponent("b.md")
        try Data("![b](pics/b.png)\n[ordinary local link](pics/a.png)\n\n[repo]: ./other/README.md\n[site]: https://example.com/s.png \"t\"\n".utf8).write(to: mdB)
        let dstMDB = dstBase.appendingPathComponent("copy-b.md")
        let outB = SaveEngine.saveAs(from: mdB, to: dstMDB, journal: journal)
        s.check(outB.saved && outB.markSaved, "14b allowed via equivalent same bytes, error=\(outB.error ?? "nil")")
        if let a = try? Data(contentsOf: mdB), let b = try? Data(contentsOf: dstMDB) {
            s.check(a == b, "14b markdown bytes identical (ordinary link/defs & image ref untouched)")
        }
        s.check(outB.reused == [dstBase.appendingPathComponent("pics/b.png").path],
                "14b equivalent target reused without ownership, no copy performed")
        s.check(sha256Hex(dstBase.appendingPathComponent("pics/b.png")) == sha256Hex(bytesB),
                "14b pre-placed target bytes unchanged")

        // 14c 目标同路径异字节 → 阻塞且不覆盖
        try Data("CONFLICTING".utf8).write(to: dstBase.appendingPathComponent("pics/c.png"))
        let mdC = srcBase.appendingPathComponent("c.md")
        try Data("![c][cdef]\n\n[cdef]: pics/c.png \"t\"\n".utf8).write(to: mdC)
        let dstMDC = dstBase.appendingPathComponent("copy-c.md")
        let outC = SaveEngine.saveAs(from: mdC, to: dstMDC, journal: journal)
        s.check(!outC.saved && outC.error == "blocked-target-conflict-different-bytes"
                && outC.unmanagedTargetConflicts == ["pics/c.png"],
                "14c reference-style def conflicting target blocked: \(outC.error ?? "")")
        s.check(sha256Hex(dstBase.appendingPathComponent("pics/c.png")) == sha256Hex(Data("CONFLICTING".utf8)),
                "14c target not overwritten")
        s.check(!fm.fileExists(atPath: dstMDC.path) && stagingLeftovers(dstBase).isEmpty, "14c no markdown written")

        // 14d 外链/绝对路径图片引用：不参与本地决策（passthrough），不阻塞
        let mdD = srcBase.appendingPathComponent("d.md")
        try Data("![e](https://example.com/e.png)\n![s][site]\n\n[site]: https://example.com/s.png \"t\"\n".utf8).write(to: mdD)
        let dstMDD = dstBase.appendingPathComponent("copy-d.md")
        let outD = SaveEngine.saveAs(from: mdD, to: dstMDD, journal: journal)
        s.check(outD.saved && outD.passthroughExternalRefs.count == 2,
                "14d external image refs passthrough, not treated as local assets: \(outD.passthroughExternalRefs)")
        scenarios.append(s.result)
    } catch { scenarios.append(ScenarioResult(name: "S14-saveas-unmanaged-relative-refs", pass: false, detail: ["FAIL threw \(error)"])) }

    // 汇总输出
    struct Report: Codable {
        let prototype: String
        let baseline: String
        let ranAt: String
        let scratchRoot: String
        let commitOrder: String
        let crashWindow: String
        let journalBoundary: String
        let allPass: Bool
        let scenarios: [ScenarioResult]
        let journal: [JournalEntry]
    }
    let report = Report(
        prototype: "INK-PROT-011 local-assets model 0.3 (INK-PROT-013 correction)",
        baseline: baseline,
        ranAt: ISO8601DateFormatter().string(from: Date()),
        scratchRoot: root.path,
        commitOrder: "validate(read-only) → private staging + readback verify → publish ALL assets to final locations → atomic markdown commit LAST → markSaved only on full success",
        crashWindow: "publish 与 markdown commit 之间崩溃：资源已在最终位置而旧 Markdown 未被替换，表现为孤儿资源；非跨文件原子事务，本原型无法消除该窗口，只如实记录并保留",
        journalBoundary: "journal 仅存在于本进程内存、不落盘：崩溃/重启后没有任何磁盘 journal 可恢复，不能声称跨重启恢复已完成操作；持久化 per-op journal 属父票14剩余范围",
        allPass: scenarios.allSatisfy(\.pass),
        scenarios: scenarios,
        journal: journal.entries)
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
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
