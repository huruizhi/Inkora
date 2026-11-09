import Foundation
import ImageIO
import XCTest

final class LocalImageStoreTests: XCTestCase {
  private let png = Data(
    base64Encoded:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  )!

  func testUntitledImportPersistsExactBytesSHAAndEncodedDraftIdentity() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("架构 图%.png")
    try png.write(to: source)
    let root = scratch.appendingPathComponent("Recovery", isDirectory: true)
    let store = LocalImageStore(root: root)
    let sessionID = UUID()
    let session = try store.begin(documentID: "doc-1", sessionID: sessionID)

    let asset = try session.importFile(from: source, documentURL: nil, authorizedDirectory: nil)

    XCTAssertEqual(asset.sha256, RecoveryFingerprint.hash(png))
    XCTAssertEqual(asset.byteCount, png.count)
    XCTAssertEqual(asset.mimeType, "image/png")
    XCTAssertEqual(asset.markdownURI, "inkora-draft://asset/\(asset.id.uuidString.lowercased())")
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
    XCTAssertTrue(asset.storageURL.path.hasPrefix(root.path + "/"))

    let restored = try store.begin(documentID: "doc-1", sessionID: sessionID)
    XCTAssertEqual(restored.assets, [asset])
  }

  func testNamedImportPublishesBeforeReturningRelativeURIAndAllocatesUniqueName() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let sourceA = scratch.appendingPathComponent("outside-a.png")
    let sourceB = scratch.appendingPathComponent("outside-b.png")
    try png.write(to: sourceA)
    var different = png
    different.append(0)
    try different.write(to: sourceB)
    let documentDirectory = scratch.appendingPathComponent("授权目录", isDirectory: true)
    try FileManager.default.createDirectory(
      at: documentDirectory, withIntermediateDirectories: true)
    let documentURL = documentDirectory.appendingPathComponent("中文 文档.md")
    let store = LocalImageStore(root: scratch.appendingPathComponent("Recovery"))
    let session = try store.begin(documentID: "doc-1", sessionID: UUID())

    let first = try session.importFile(
      from: sourceA,
      preferredName: "架构 图%.png",
      documentURL: documentURL,
      authorizedDirectory: documentDirectory)
    let second = try session.importFile(
      from: sourceB,
      preferredName: "架构 图%.png",
      documentURL: documentURL,
      authorizedDirectory: documentDirectory)

    XCTAssertEqual(
      first.markdownURI,
      "%E4%B8%AD%E6%96%87%20%E6%96%87%E6%A1%A3.assets/%E6%9E%B6%E6%9E%84%20%E5%9B%BE%25.png")
    XCTAssertEqual(
      second.markdownURI,
      "%E4%B8%AD%E6%96%87%20%E6%96%87%E6%A1%A3.assets/%E6%9E%B6%E6%9E%84%20%E5%9B%BE%25-2.png")
    XCTAssertEqual(try Data(contentsOf: first.storageURL), png)
    XCTAssertEqual(try Data(contentsOf: second.storageURL), different)
    XCTAssertFalse(first.storageURL.isSymbolicLink)
  }

  func testNamedImportManifestReopensBeforeMarkdownSaveWithoutOwningExternalFile() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("source.png")
    try png.write(to: source)
    let documentDirectory = scratch.appendingPathComponent("Document", isDirectory: true)
    try FileManager.default.createDirectory(
      at: documentDirectory, withIntermediateDirectories: true)
    let documentURL = documentDirectory.appendingPathComponent("Note.md")
    let root = scratch.appendingPathComponent("Recovery")
    let store = LocalImageStore(root: root)
    let sessionID = UUID()
    let session = try store.begin(documentID: "doc-1", sessionID: sessionID)
    let asset = try session.importFile(
      from: source, documentURL: documentURL, authorizedDirectory: documentDirectory)

    let restored = try store.begin(documentID: "doc-1", sessionID: sessionID)
    XCTAssertEqual(restored.assets, [asset])
    XCTAssertEqual(restored.assets.first?.ownership, .operation)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
  }

  func testRejectsUnsupportedOrMismatchedBytesWithoutCreatingAnAsset() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("fake.png")
    try Data("not an image".utf8).write(to: source)
    let session = try LocalImageStore(root: scratch.appendingPathComponent("Recovery"))
      .begin(documentID: "doc-1", sessionID: UUID())

    XCTAssertThrowsError(
      try session.importFile(from: source, documentURL: nil, authorizedDirectory: nil))
    XCTAssertTrue(session.assets.isEmpty)
  }

  func testFirstSavePlanKeepsDraftOwnedUntilAllPublishedAndSurvivesFailure() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("a.png")
    try png.write(to: source)
    let root = scratch.appendingPathComponent("Recovery")
    let store = LocalImageStore(root: root)
    let sessionID = UUID()
    let session = try store.begin(documentID: "doc-1", sessionID: sessionID)
    let asset = try session.importFile(from: source, documentURL: nil, authorizedDirectory: nil)
    try session.markInsertionAccepted(assetID: asset.id)
    let targetDirectory = scratch.appendingPathComponent("Target", isDirectory: true)
    try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: true)
    let documentURL = targetDirectory.appendingPathComponent("Note.md")

    let plan = try session.prepareFirstSave(
      documentURL: documentURL, authorizedDirectory: targetDirectory)
    XCTAssertEqual(plan.rewrites, [asset.markdownURI: "Note.assets/a.png"])
    XCTAssertFalse(
      FileManager.default.fileExists(
        atPath: targetDirectory.appendingPathComponent("Note.assets/a.png").path))
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)

    try session.publish(plan)
    XCTAssertEqual(
      try Data(contentsOf: targetDirectory.appendingPathComponent("Note.assets/a.png")), png)
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)

    let restored = try store.begin(documentID: "doc-1", sessionID: sessionID)
    XCTAssertEqual(restored.assets.first?.sha256, asset.sha256)
  }

  func testPastedBitmapImportsInjectedPNGWithoutReadingPasteboard() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let session = try LocalImageStore(root: scratch.appendingPathComponent("Recovery"))
      .begin(documentID: "doc-1", sessionID: UUID())

    let asset = try session.importBitmapPNG(
      png, preferredName: "粘贴 图.png", documentURL: nil, authorizedDirectory: nil)

    XCTAssertEqual(asset.mimeType, "image/png")
    XCTAssertEqual(asset.originalName, "粘贴 图.png")
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
    XCTAssertEqual(session.assets, [asset])
  }

  func testImageIOActuallyDecodesJPEGGIFAndWebPWithoutReencodingSourceBytes() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let gif = Data(base64Encoded: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")!
    let webp = Data(
      base64Encoded:
        "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygA")!
    let jpeg = try encodeJPEG(png)
    let session = try LocalImageStore(root: scratch.appendingPathComponent("Recovery"))
      .begin(documentID: "doc-1", sessionID: UUID())

    for (name, bytes, mime) in [
      ("a.jpg", jpeg, "image/jpeg"), ("a.gif", gif, "image/gif"),
      ("a.webp", webp, "image/webp"),
    ] {
      let source = scratch.appendingPathComponent(name)
      try bytes.write(to: source)
      let asset = try session.importFile(
        from: source, documentURL: nil, authorizedDirectory: nil)
      XCTAssertEqual(asset.mimeType, mime)
      XCTAssertEqual(try Data(contentsOf: asset.storageURL), bytes)
    }
  }

  func testIndependentProcessSIGKILLLeavesRecoverableProductionManifestAndBytes() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let source = scratch.appendingPathComponent("source.png")
    try png.write(to: source)
    let root = scratch.appendingPathComponent("Recovery")
    let sessionID = UUID()
    let helperSource = scratch.appendingPathComponent("main.swift")
    let helper = scratch.appendingPathComponent("image-helper")
    let program = """
      import Darwin
      import Foundation
      let root = URL(fileURLWithPath: CommandLine.arguments[1])
      let sessionID = UUID(uuidString: CommandLine.arguments[2])!
      let source = URL(fileURLWithPath: CommandLine.arguments[3])
      let session = try LocalImageStore(root: root).begin(
        documentID: "doc-child", sessionID: sessionID)
      _ = try session.importFile(from: source, documentURL: nil, authorizedDirectory: nil)
      kill(getpid(), SIGKILL)
      """
    try Data(program.utf8).write(to: helperSource, options: .atomic)
    let repository = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let compiler = Process()
    compiler.executableURL = URL(fileURLWithPath: "/usr/bin/xcrun")
    compiler.arguments = [
      "swiftc", repository.appendingPathComponent("app/Sources/LocalImageStore.swift").path,
      helperSource.path, "-o", helper.path,
    ]
    let compilerOutput = Pipe()
    compiler.standardError = compilerOutput
    try compiler.run()
    compiler.waitUntilExit()
    XCTAssertEqual(
      compiler.terminationStatus, 0,
      String(decoding: compilerOutput.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self))

    let child = Process()
    child.executableURL = helper
    child.arguments = [root.path, sessionID.uuidString, source.path]
    try child.run()
    child.waitUntilExit()
    XCTAssertEqual(child.terminationReason, .uncaughtSignal)
    XCTAssertEqual(child.terminationStatus, SIGKILL)

    let recovered = try LocalImageStore(root: root).begin(
      documentID: "doc-child", sessionID: sessionID)
    XCTAssertEqual(recovered.assets.count, 1)
    XCTAssertEqual(try Data(contentsOf: try XCTUnwrap(recovered.assets.first?.storageURL)), png)
    XCTAssertEqual(recovered.assets.first?.sha256, RecoveryFingerprint.hash(png))
  }

  func testTruncatedManifestFailsClosedWithoutDeletingEvidence() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let root = scratch.appendingPathComponent("Recovery")
    let sessionID = UUID()
    let session = try LocalImageStore(root: root).begin(
      documentID: "doc-1", sessionID: sessionID)
    let source = scratch.appendingPathComponent("source.png")
    try png.write(to: source)
    let asset = try session.importFile(
      from: source, documentURL: nil, authorizedDirectory: nil)
    let manifest = root.appendingPathComponent(
      "\(sessionID.uuidString.lowercased())/manifest.json")
    try Data("{".utf8).write(to: manifest, options: .atomic)

    XCTAssertThrowsError(
      try LocalImageStore(root: root).begin(
        documentID: "doc-1", sessionID: sessionID)
    ) {
      XCTAssertEqual($0 as? LocalImageError, .corruptManifest)
    }
    XCTAssertEqual(try Data(contentsOf: asset.storageURL), png)
    XCTAssertEqual(try Data(contentsOf: manifest), Data("{".utf8))
  }

  func testUnknownSchemaInOneSessionDoesNotAffectAnotherSession() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let root = scratch.appendingPathComponent("Recovery")
    let source = scratch.appendingPathComponent("source.png")
    try png.write(to: source)
    let firstID = UUID()
    let secondID = UUID()
    let first = try LocalImageStore(root: root).begin(documentID: "first", sessionID: firstID)
    let second = try LocalImageStore(root: root).begin(documentID: "second", sessionID: secondID)
    let firstAsset = try first.importFile(
      from: source, documentURL: nil, authorizedDirectory: nil)
    let secondAsset = try second.importFile(
      from: source, documentURL: nil, authorizedDirectory: nil)
    let manifest = root.appendingPathComponent(
      "\(firstID.uuidString.lowercased())/manifest.json")
    var object = try XCTUnwrap(
      JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any])
    object["schema"] = 99
    try JSONSerialization.data(withJSONObject: object).write(to: manifest, options: .atomic)

    XCTAssertThrowsError(
      try LocalImageStore(root: root).begin(documentID: "first", sessionID: firstID)
    ) { XCTAssertEqual($0 as? LocalImageError, .corruptManifest) }
    let restoredSecond = try LocalImageStore(root: root).begin(
      documentID: "second", sessionID: secondID)
    XCTAssertEqual(restoredSecond.assets, [secondAsset])
    XCTAssertEqual(try Data(contentsOf: firstAsset.storageURL), png)
  }

  func testSymlinkedOrExternallyModifiedDraftFailsClosedWithoutDeletingTarget() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let root = scratch.appendingPathComponent("Recovery")
    let source = scratch.appendingPathComponent("source.png")
    let outside = scratch.appendingPathComponent("outside.png")
    try png.write(to: source)
    try png.write(to: outside)
    let symlinkID = UUID()
    let symlinkSession = try LocalImageStore(root: root).begin(
      documentID: "symlink", sessionID: symlinkID)
    let symlinkAsset = try symlinkSession.importFile(
      from: source, documentURL: nil, authorizedDirectory: nil)
    try FileManager.default.removeItem(at: symlinkAsset.storageURL)
    try FileManager.default.createSymbolicLink(
      at: symlinkAsset.storageURL, withDestinationURL: outside)

    XCTAssertThrowsError(
      try LocalImageStore(root: root).begin(documentID: "symlink", sessionID: symlinkID)
    ) { XCTAssertEqual($0 as? LocalImageError, .corruptManifest) }
    XCTAssertEqual(try Data(contentsOf: outside), png)

    let modifiedID = UUID()
    let modifiedSession = try LocalImageStore(root: root).begin(
      documentID: "modified", sessionID: modifiedID)
    let modifiedAsset = try modifiedSession.importFile(
      from: source, documentURL: nil, authorizedDirectory: nil)
    try Data("external modification".utf8).write(to: modifiedAsset.storageURL, options: .atomic)
    XCTAssertThrowsError(
      try LocalImageStore(root: root).begin(documentID: "modified", sessionID: modifiedID)
    ) { XCTAssertEqual($0 as? LocalImageError, .corruptManifest) }
    XCTAssertEqual(
      try Data(contentsOf: modifiedAsset.storageURL), Data("external modification".utf8))
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraImages-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func encodeJPEG(_ png: Data) throws -> Data {
    let source = try XCTUnwrap(CGImageSourceCreateWithData(png as CFData, nil))
    let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
    let output = NSMutableData()
    let destination = try XCTUnwrap(
      CGImageDestinationCreateWithData(output, "public.jpeg" as CFString, 1, nil))
    CGImageDestinationAddImage(destination, image, nil)
    XCTAssertTrue(CGImageDestinationFinalize(destination))
    return output as Data
  }
}

extension URL {
  fileprivate var isSymbolicLink: Bool {
    (try? resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true
  }
}
