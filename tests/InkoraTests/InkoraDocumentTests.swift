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

  private func fixtureData(named name: String) throws -> Data {
    let bundle = Bundle(for: Self.self)
    let url = try XCTUnwrap(
      bundle.url(forResource: name, withExtension: "md", subdirectory: "fixtures")
    )
    return try Data(contentsOf: url)
  }
}
