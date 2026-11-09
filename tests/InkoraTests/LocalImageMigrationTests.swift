import Foundation
import XCTest

final class LocalImageMigrationTests: XCTestCase {
  private let png = Data(
    base64Encoded:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  )!

  func testSaveAsPreservesReferenceBytesAndPublishesExactResource() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let sourceDirectory = scratch.appendingPathComponent("Source")
    let targetDirectory = scratch.appendingPathComponent("Target")
    try FileManager.default.createDirectory(
      at: sourceDirectory.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: true)
    try png.write(to: sourceDirectory.appendingPathComponent("Old.assets/架构 图%.png"))
    let markdown = "前 ![图](Old.assets/%E6%9E%B6%E6%9E%84%20%E5%9B%BE%25.png) 后\n"
    let migration = LocalImageMigrationCoordinator(
      journalRoot: scratch.appendingPathComponent("Journal"))

    let plan = try migration.prepare(
      markdown: markdown,
      sourceDocumentURL: sourceDirectory.appendingPathComponent("Old.md"),
      targetDocumentURL: targetDirectory.appendingPathComponent("New.md"),
      sourceAuthorizedDirectory: sourceDirectory,
      targetAuthorizedDirectory: targetDirectory)
    try migration.publish(plan)

    XCTAssertEqual(plan.markdown, markdown)
    XCTAssertEqual(
      try Data(contentsOf: targetDirectory.appendingPathComponent("Old.assets/架构 图%.png")),
      png)
    XCTAssertTrue(
      FileManager.default.fileExists(
        atPath: sourceDirectory.appendingPathComponent("Old.assets/架构 图%.png").path))
    try migration.confirm(plan)
  }

  func testSaveAsReusesSameBytesButRejectsDifferentTargetWithoutOverwrite() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    for directory in [source, target] {
      try FileManager.default.createDirectory(
        at: directory.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    }
    try png.write(to: source.appendingPathComponent("Old.assets/a.png"))
    try png.write(to: target.appendingPathComponent("Old.assets/a.png"))
    let migration = LocalImageMigrationCoordinator(
      journalRoot: scratch.appendingPathComponent("Journal"))
    let markdown = "![x](Old.assets/a.png)"

    let reusable = try migration.prepare(
      markdown: markdown,
      sourceDocumentURL: source.appendingPathComponent("Old.md"),
      targetDocumentURL: target.appendingPathComponent("New.md"),
      sourceAuthorizedDirectory: source,
      targetAuthorizedDirectory: target)
    XCTAssertTrue(reusable.items.first?.reused == true)
    try migration.publish(reusable)

    let different = Data("different".utf8)
    try different.write(to: target.appendingPathComponent("Old.assets/a.png"))
    XCTAssertThrowsError(
      try migration.prepare(
        markdown: markdown,
        sourceDocumentURL: source.appendingPathComponent("Old.md"),
        targetDocumentURL: target.appendingPathComponent("New.md"),
        sourceAuthorizedDirectory: source,
        targetAuthorizedDirectory: target)
    ) { XCTAssertEqual($0 as? LocalImageError, .targetConflict) }
    XCTAssertEqual(
      try Data(contentsOf: target.appendingPathComponent("Old.assets/a.png")), different)
  }

  func testSaveAsFindsFullCollapsedAndShortcutReferenceImagesWithoutRewritingMarkdown() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    try FileManager.default.createDirectory(
      at: source.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    for name in ["full.png", "collapsed.png", "shortcut.png"] {
      try png.write(to: source.appendingPathComponent("Old.assets/\(name)"))
    }
    let markdown = """
      ![full alt][full-ref] ![collapsed][] ![shortcut]

      [full-ref]: Old.assets/full.png "full title"
      [collapsed]: Old.assets/collapsed.png
      [shortcut]: Old.assets/shortcut.png
      """
    let migration = LocalImageMigrationCoordinator(
      journalRoot: scratch.appendingPathComponent("Journal"))

    let plan = try migration.prepare(
      markdown: markdown,
      sourceDocumentURL: source.appendingPathComponent("Old.md"),
      targetDocumentURL: target.appendingPathComponent("New.md"),
      sourceAuthorizedDirectory: source,
      targetAuthorizedDirectory: target)
    try migration.publish(plan)

    XCTAssertEqual(plan.markdown, markdown)
    XCTAssertEqual(
      Set(plan.items.map(\.uri)),
      [
        "Old.assets/full.png", "Old.assets/collapsed.png", "Old.assets/shortcut.png",
      ])
    for name in ["full.png", "collapsed.png", "shortcut.png"] {
      XCTAssertEqual(
        try Data(contentsOf: target.appendingPathComponent("Old.assets/\(name)")), png)
    }
  }

  func testSaveAsIgnoresImageExamplesInCodeCommentsAndEscapes() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    try FileManager.default.createDirectory(
      at: source.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    try png.write(to: source.appendingPathComponent("Old.assets/real.png"))
    let markdown = #"""
      ![real](Old.assets/real.png)
      `![inline](Old.assets/missing-inline.png)`
      \![escaped](Old.assets/missing-escaped.png)
      <!-- ![comment](Old.assets/missing-comment.png) -->
      ```md
      ![fenced](Old.assets/missing-fenced.png)
      ```
      """#
    let migration = LocalImageMigrationCoordinator(
      journalRoot: scratch.appendingPathComponent("Journal"))

    let plan = try migration.prepare(
      markdown: markdown,
      sourceDocumentURL: source.appendingPathComponent("Old.md"),
      targetDocumentURL: target.appendingPathComponent("New.md"),
      sourceAuthorizedDirectory: source,
      targetAuthorizedDirectory: target)

    XCTAssertEqual(plan.items.map(\.uri), ["Old.assets/real.png"])
    XCTAssertEqual(plan.markdown, markdown)
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraMigration-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }
}
