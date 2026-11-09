import Darwin
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

  func testSaveAsNormalizesCommonMarkReferenceLabelsWithoutChangingMarkdown() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    try FileManager.default.createDirectory(
      at: source.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    try png.write(to: source.appendingPathComponent("Old.assets/中 文%.png"))
    let markdown = "![x][A   B]\n\n[a b]: Old.assets/%E4%B8%AD%20%E6%96%87%25.png\n"
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
    XCTAssertEqual(plan.items.map(\.uri), ["Old.assets/%E4%B8%AD%20%E6%96%87%25.png"])
    XCTAssertEqual(
      try Data(contentsOf: target.appendingPathComponent("Old.assets/中 文%.png")), png)
  }

  func testReferenceOwnershipUsesEscapesEntitiesAndIgnoresLinksAndUnusedDefinitions() {
    let markdown = #"""
      ![x][A\&amp;   B]
      ![entity][&#169;]
      [ordinary][a& b]

      [a&amp; b]: Old.assets/owned.png
      [&copy;]: Old.assets/entity.png
      [unused]: Old.assets/unused.png
      """#
    XCTAssertEqual(
      LocalImageMigrationCoordinator.localImageURIs(in: markdown),
      ["Old.assets/owned.png", "Old.assets/entity.png"])
  }

  func testReferenceOwnershipAcceptsCanonicalLineBreakAndEscapedBracketLabels() {
    let markdown = #"""
      ![x][A\]
        B]

      [a\] b]: Old.assets/owned.png
      """#
    XCTAssertEqual(
      LocalImageMigrationCoordinator.localImageURIs(in: markdown),
      ["Old.assets/owned.png"])
  }

  func testDraftURIOwnershipRejectsCodeAndPlainTextSubstringMatches() {
    let uri = "inkora-draft://asset/11111111-1111-4111-8111-111111111111"
    let markdown = "plain \(uri)\n`![code](\(uri))`\n![owned](\(uri))\n"
    XCTAssertEqual(LocalImageMigrationCoordinator.imageURIs(in: markdown), [uri])
  }

  func testInlineImageScannerKeepsBalancedAngleTitleAndEscapedDestinations() {
    let markdown = #"""
      ![balanced](Old.assets/a(b).png)
      ![angle](<Old.assets/angle image.png> "title")
      ![escaped](Old.assets/a\(b\).png 'title')
      [ordinary](Old.assets/not-image.png)
      `![code](Old.assets/not-code.png)`
      """#
    XCTAssertEqual(
      LocalImageMigrationCoordinator.imageURIs(in: markdown),
      ["Old.assets/a(b).png", "Old.assets/angle image.png"])
  }

  func testInlineImageScannerRejectsUnclosedOwnersAndPlainLinks() {
    let markdown = #"""
      ![unclosed](Old.assets/a(b.png)
      [plain](Old.assets/real.png)
      ![valid](Old.assets/real.png)
      """#
    XCTAssertEqual(
      LocalImageMigrationCoordinator.imageURIs(in: markdown), ["Old.assets/real.png"])
  }

  func testSaveAsMigratesBalancedParenthesisWithoutChangingMarkdown() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    try FileManager.default.createDirectory(
      at: source.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    for name in ["a(b).png", "angle image.png", "escaped(a).png"] {
      try png.write(to: source.appendingPathComponent("Old.assets/\(name)"))
    }
    let markdown = #"""
      ![balanced](Old.assets/a(b).png)
      ![angle](<Old.assets/angle image.png> "title")
      ![escaped](Old.assets/escaped\(a\).png 'title')

      """#
    let migration = LocalImageMigrationCoordinator(
      journalRoot: scratch.appendingPathComponent("Journal"))

    let plan = try migration.prepare(
      markdown: markdown,
      sourceDocumentURL: source.appendingPathComponent("Old.md"),
      targetDocumentURL: target.appendingPathComponent("New.md"),
      sourceAuthorizedDirectory: source,
      targetAuthorizedDirectory: target)
    XCTAssertEqual(plan.markdown, markdown)
    XCTAssertEqual(
      plan.items.map(\.uri),
      ["Old.assets/a(b).png", "Old.assets/angle image.png", "Old.assets/escaped(a).png"])
    try migration.publish(plan)
    for name in ["a(b).png", "angle image.png", "escaped(a).png"] {
      XCTAssertEqual(try Data(contentsOf: target.appendingPathComponent("Old.assets/\(name)")), png)
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

  func testRestartDiscoverySeparatesPublishedHistoryFromCurrentMarkdownIntegrity() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    let journal = scratch.appendingPathComponent("Journal")
    try FileManager.default.createDirectory(
      at: source.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    try png.write(to: source.appendingPathComponent("Old.assets/a.png"))
    let markdown = "![x](Old.assets/a.png)\n"
    let coordinator = LocalImageMigrationCoordinator(journalRoot: journal)
    let plan = try coordinator.prepare(
      markdown: markdown,
      sourceDocumentURL: source.appendingPathComponent("Old.md"),
      targetDocumentURL: target.appendingPathComponent("New.md"),
      sourceAuthorizedDirectory: source,
      targetAuthorizedDirectory: target)
    try coordinator.publish(plan)

    let afterKill = LocalImageMigrationCoordinator(journalRoot: journal).discoverRecovery()
    XCTAssertEqual(afterKill.rejected, [])
    XCTAssertEqual(afterKill.records.first?.journalState, "published-awaiting-markdown")
    XCTAssertEqual(afterKill.records.first?.currentState, .awaitingMarkdown)
    XCTAssertEqual(try Data(contentsOf: target.appendingPathComponent("Old.assets/a.png")), png)

    try Data(markdown.utf8).write(to: target.appendingPathComponent("New.md"), options: .atomic)
    let afterMarkdown = LocalImageMigrationCoordinator(journalRoot: journal).discoverRecovery()
    XCTAssertEqual(afterMarkdown.records.first?.journalState, "published-awaiting-markdown")
    XCTAssertEqual(afterMarkdown.records.first?.currentState, .markdownMatches)

    try Data("externally changed".utf8).write(
      to: target.appendingPathComponent("New.md"), options: .atomic)
    let afterExternalChange = LocalImageMigrationCoordinator(journalRoot: journal)
      .discoverRecovery()
    XCTAssertEqual(afterExternalChange.records.first?.currentState, .awaitingMarkdown)
    XCTAssertTrue(FileManager.default.fileExists(atPath: journal.path))
  }

  func testRestartDiscoveryRejectsUnknownSchemaAndSymlinkWithoutDeletingEvidence() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let journal = scratch.appendingPathComponent("Journal")
    try FileManager.default.createDirectory(at: journal, withIntermediateDirectories: true)
    let invalid = journal.appendingPathComponent("00000000-0000-4000-8000-000000000000.json")
    try Data(#"{"schema":99}"#.utf8).write(to: invalid, options: .atomic)
    let outside = scratch.appendingPathComponent("outside.json")
    try Data(#"{"schema":2}"#.utf8).write(to: outside, options: .atomic)
    let symlink = journal.appendingPathComponent("11111111-1111-4111-8111-111111111111.json")
    try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: outside)

    let discovery = LocalImageMigrationCoordinator(journalRoot: journal).discoverRecovery()

    XCTAssertTrue(discovery.records.isEmpty)
    XCTAssertEqual(
      Set(discovery.rejected.map(\.lastPathComponent)),
      Set([invalid.lastPathComponent, symlink.lastPathComponent]))
    XCTAssertEqual(try Data(contentsOf: invalid), Data(#"{"schema":99}"#.utf8))
    XCTAssertEqual(try Data(contentsOf: outside), Data(#"{"schema":2}"#.utf8))
  }

  func testSIGKILLAfterPublicationIsDiscoveredByIndependentProcessState() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("Source")
    let target = scratch.appendingPathComponent("Target")
    let journal = scratch.appendingPathComponent("Journal")
    try FileManager.default.createDirectory(
      at: source.appendingPathComponent("Old.assets"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    try png.write(to: source.appendingPathComponent("Old.assets/a.png"))
    let helperSource = scratch.appendingPathComponent("main.swift")
    let helper = scratch.appendingPathComponent("migration-helper")
    let program = #"""
      import Darwin
      import Foundation
      let source = URL(fileURLWithPath: CommandLine.arguments[1])
      let target = URL(fileURLWithPath: CommandLine.arguments[2])
      let journal = URL(fileURLWithPath: CommandLine.arguments[3])
      let coordinator = LocalImageMigrationCoordinator(journalRoot: journal)
      let plan = try coordinator.prepare(
        markdown: "![x](Old.assets/a.png)\n",
        sourceDocumentURL: source.appendingPathComponent("Old.md"),
        targetDocumentURL: target.appendingPathComponent("New.md"),
        sourceAuthorizedDirectory: source,
        targetAuthorizedDirectory: target)
      try coordinator.publish(plan)
      kill(getpid(), SIGKILL)
      """#
    try Data(program.utf8).write(to: helperSource, options: .atomic)
    let repository = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let compiler = Process()
    compiler.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
    compiler.arguments = [
      "swiftc", repository.appendingPathComponent("app/Sources/LocalImageStore.swift").path,
      repository.appendingPathComponent("app/Sources/LocalImageMigration.swift").path,
      helperSource.path, "-o", helper.path,
    ]
    let output = Pipe()
    compiler.standardError = output
    try compiler.run()
    compiler.waitUntilExit()
    XCTAssertEqual(
      compiler.terminationStatus, 0,
      String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self))

    let child = Process()
    child.executableURL = helper
    child.arguments = [source.path, target.path, journal.path]
    try child.run()
    child.waitUntilExit()
    XCTAssertEqual(child.terminationReason, .uncaughtSignal)
    XCTAssertEqual(child.terminationStatus, SIGKILL)

    let discovery = LocalImageMigrationCoordinator(journalRoot: journal).discoverRecovery()
    XCTAssertEqual(discovery.records.first?.journalState, "published-awaiting-markdown")
    XCTAssertEqual(discovery.records.first?.currentState, .awaitingMarkdown)
    XCTAssertEqual(try Data(contentsOf: target.appendingPathComponent("Old.assets/a.png")), png)
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraMigration-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }
}
