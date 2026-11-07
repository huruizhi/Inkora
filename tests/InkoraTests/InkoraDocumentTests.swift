import XCTest

final class InkoraDocumentTests: XCTestCase {
  @MainActor
  func testUnmodifiedMarkdownRoundTripsByteForByte() throws {
    for fixture in ["crlf", "no-final-newline", "unicode"] {
      let original = try fixtureData(named: fixture)
      let document = InkoraDocument()

      try document.read(from: original, ofType: "net.daringfireball.markdown")
      let saved = try document.data(ofType: "net.daringfireball.markdown")

      XCTAssertEqual(saved, original, "Fixture changed: \(fixture)")
    }
  }

  @MainActor
  func testInvalidUTF8IsRejected() {
    let document = InkoraDocument()
    let invalidUTF8 = Data([0xC3, 0x28])

    XCTAssertThrowsError(
      try document.read(from: invalidUTF8, ofType: "net.daringfireball.markdown")
    )
  }

  @MainActor
  func testFileURLLoadsMarkdownAndUsesFilenameForTheWindowTitle() throws {
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraDocumentTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appendingPathComponent("打开测试.md")
    let markdown = "# Opened from disk\n"
    try Data(markdown.utf8).write(to: url)

    let document = try InkoraDocument(
      contentsOf: url,
      ofType: "net.daringfireball.markdown"
    )
    document.makeWindowControllers()
    defer { document.close() }

    XCTAssertEqual(document.text, markdown)
    XCTAssertEqual(document.fileURL, url)
    XCTAssertEqual(document.windowControllers.first?.window?.title, "打开测试.md")
  }

  @MainActor
  func testInvalidUTF8FileDoesNotCreateAnEditableDocument() throws {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("invalid-\(UUID().uuidString).md")
    try Data([0xC3, 0x28]).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }

    XCTAssertThrowsError(
      try InkoraDocument(contentsOf: url, ofType: "net.daringfireball.markdown")
    ) { error in
      XCTAssertEqual(
        error.localizedDescription,
        InkoraDocumentError.invalidUTF8.localizedDescription
      )
    }
  }

  func testApplicationDeclaresMarkdownDocumentAssociation() throws {
    let applicationURL = Bundle(for: Self.self).bundleURL
      .deletingLastPathComponent()
      .appendingPathComponent("Inkora.app", isDirectory: true)
    let applicationBundle = try XCTUnwrap(Bundle(url: applicationURL))
    let documentTypes = try XCTUnwrap(
      applicationBundle.object(forInfoDictionaryKey: "CFBundleDocumentTypes")
        as? [[String: Any]]
    )
    let markdownType = try XCTUnwrap(
      documentTypes.first {
        ($0["LSItemContentTypes"] as? [String])?.contains("net.daringfireball.markdown")
          == true
      }
    )

    XCTAssertEqual(markdownType["CFBundleTypeRole"] as? String, "Editor")
    XCTAssertEqual(markdownType["NSDocumentClass"] as? String, "InkoraDocument")
  }

  private func fixtureData(named name: String) throws -> Data {
    let bundle = Bundle(for: Self.self)
    let url = try XCTUnwrap(
      bundle.url(forResource: name, withExtension: "md", subdirectory: "fixtures")
    )
    return try Data(contentsOf: url)
  }
}
