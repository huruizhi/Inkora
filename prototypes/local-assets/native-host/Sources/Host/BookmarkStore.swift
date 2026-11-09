import Foundation

enum BookmarkKind: String, Codable {
    case markdownFile
    case fixtureDirectory
}

struct StoredBookmark: Codable {
    let kind: BookmarkKind
    let runID: UUID
    let data: Data
}

struct RestoredBookmark {
    let kind: BookmarkKind
    let url: URL
    let stale: Bool
}

final class BookmarkStore {
    private let fileURL: URL
    private let log: EventLog

    init(log: EventLog) throws {
        self.log = log
        fileURL = try applicationSupportDirectory().appendingPathComponent("bookmarks.json")
    }

    func save(kind: BookmarkKind, url: URL, runID: UUID) throws {
        let data = try url.bookmarkData(options: [.withSecurityScope, .securityScopeAllowOnlyReadAccess], includingResourceValuesForKeys: nil, relativeTo: nil)
        var records = loadRecords().filter { $0.kind != kind }
        records.append(StoredBookmark(kind: kind, runID: runID, data: data))
        try JSONEncoder().encode(records).write(to: fileURL, options: [.atomic, .completeFileProtectionUnlessOpen])
        log.emit("bookmark-created", ["kind": kind.rawValue, "runID": runID.uuidString])
    }

    func restore(runID: UUID) -> [RestoredBookmark] {
        loadRecords().filter { $0.runID == runID }.compactMap { record in
            var stale = false
            do {
                let url = try URL(
                    resolvingBookmarkData: record.data,
                    options: [.withSecurityScope],
                    relativeTo: nil,
                    bookmarkDataIsStale: &stale
                )
                log.emit("bookmark-restored", ["kind": record.kind.rawValue, "stale": String(stale)])
                if stale {
                    log.emit("bookmark-stale", ["kind": record.kind.rawValue])
                    let active = url.startAccessingSecurityScopedResource()
                    defer { if active { url.stopAccessingSecurityScopedResource() } }
                    do {
                        try save(kind: record.kind, url: url, runID: runID)
                    } catch {
                        log.emit("bookmark-error", ["kind": record.kind.rawValue, "action": "refresh", "error": String(describing: error)])
                    }
                }
                return RestoredBookmark(kind: record.kind, url: url, stale: stale)
            } catch {
                log.emit("bookmark-error", ["kind": record.kind.rawValue, "error": String(describing: error)])
                return nil
            }
        }
    }

    func removeAll() {
        do {
            if FileManager.default.fileExists(atPath: fileURL.path) { try FileManager.default.removeItem(at: fileURL) }
            log.emit("bookmark-revoked")
        } catch {
            log.emit("bookmark-error", ["action": "remove", "error": String(describing: error)])
        }
    }

    private func loadRecords() -> [StoredBookmark] {
        guard let data = try? Data(contentsOf: fileURL),
              let records = try? JSONDecoder().decode([StoredBookmark].self, from: data) else { return [] }
        return records
    }
}
