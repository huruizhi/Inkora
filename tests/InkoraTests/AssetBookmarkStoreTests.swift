import Foundation
import XCTest

final class AssetBookmarkStoreTests: XCTestCase {
  func testStaleBookmarkRefreshesWithOriginalAccessAndResolutionFailureIsAuthorization() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraBookmarks-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let manifest = root.appendingPathComponent("bookmarks.json")
    let directory = root.appendingPathComponent("授权目录")
    var creations: [(URL, AssetDirectoryAccess)] = []
    var shouldFail = false
    let store = AssetBookmarkStore(
      url: manifest,
      createBookmark: { url, access in
        creations.append((url, access))
        return Data(url.path.utf8)
      },
      resolveBookmark: { data in
        if shouldFail { throw CocoaError(.fileReadNoPermission) }
        return (URL(fileURLWithPath: String(decoding: data, as: UTF8.self)), true)
      })

    try store.remember(directory, role: "document", access: .readWrite)
    XCTAssertEqual(try store.resolve(role: "document"), directory)
    XCTAssertEqual(creations.map(\.1), [.readWrite, .readWrite])
    shouldFail = true
    XCTAssertThrowsError(try store.resolve(role: "document")) {
      XCTAssertEqual($0 as? LocalImageError, .unauthorizedDirectory)
    }
    XCTAssertTrue(FileManager.default.fileExists(atPath: manifest.path))
  }
}
