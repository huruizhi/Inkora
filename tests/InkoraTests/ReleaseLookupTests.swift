import XCTest

private final class ReleaseURLProtocol: URLProtocol, @unchecked Sendable {
  private static let lock = NSLock()
  nonisolated(unsafe) private static var fixture: [String: Data] = [:]
  static func configure(_ responses: [String: Data]) {
    lock.lock()
    defer { lock.unlock() }
    fixture = responses
  }
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    Self.lock.lock()
    let data = Self.fixture[request.url!.absoluteString]
    Self.lock.unlock()
    guard let data else {
      client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
      return
    }
    client?.urlProtocol(
      self,
      didReceive: HTTPURLResponse(
        url: request.url!, statusCode: 200,
        httpVersion: nil, headerFields: ["Content-Type": "application/json"])!,
      cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: data)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

final class ReleaseLookupTests: XCTestCase {
  private func metadata(build: String = "3") throws -> Data {
    let versions = ["CFBundleIdentifier": "com.huruizhi.Inkora", "CFBundleVersion": build]
    return try JSONSerialization.data(withJSONObject: [
      "checks": ["export": ["versions": versions], "zip": ["versions": versions]]
    ])
  }
  func testLegacyRequiresMatchingPositiveNumericBuild() throws {
    XCTAssertEqual(
      try ReleaseLookup.build(metadata: metadata(), tag: "v0.1.0-beta.1", prerelease: true), 3)
    for invalid in ["0", "-1", "4.0", " 4", "9223372036854775808", "latest"] {
      XCTAssertThrowsError(
        try ReleaseLookup.build(metadata: metadata(build: invalid), tag: "v1", prerelease: true))
    }
    XCTAssertThrowsError(
      try ReleaseLookup.build(metadata: Data("{}".utf8), tag: "v1", prerelease: true))
  }
  func testPublicManifestBindsReleaseAssetAndRejectsConflict() throws {
    let tag = "v0.1.0-beta.3"
    let url = "https://github.com/huruizhi/Inkora/releases/download/\(tag)/Inkora.zip"
    var info: [String: Any] = [
      "schema": "inkora.release.v1", "bundleIdentifier": "com.huruizhi.Inkora",
      "buildVersion": "10", "marketingVersion": "0.1.0", "channel": "beta", "tag": tag,
      "sourceCommit": String(repeating: "a", count: 40),
      "assets": [
        [
          "name": "Inkora.zip", "url": url, "byteLength": 123,
          "sha256": String(repeating: "b", count: 64),
        ]
      ],
    ]
    let valid = try JSONSerialization.data(withJSONObject: info)
    XCTAssertEqual(
      try ReleaseLookup.build(metadata: valid, tag: tag, prerelease: true, assetURLs: [url]), 10)
    XCTAssertThrowsError(
      try ReleaseLookup.build(metadata: valid, tag: tag, prerelease: true, assetURLs: []))
    info["channel"] = "stable"
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: JSONSerialization.data(withJSONObject: info), tag: tag, prerelease: true,
        assetURLs: [url]))
    let duplicate = Data("{\"schema\":\"inkora.release.v1\",\"schema\":\"other\"}".utf8)
    XCTAssertThrowsError(try ReleaseLookup.build(metadata: duplicate, tag: tag, prerelease: true))
  }

  func testReadOnlyLookupUsesProvenanceInsteadOfTagVersion() async throws {
    let page = "https://github.com/huruizhi/Inkora/releases/tag/v999.0.0-beta.1"
    let asset =
      "https://github.com/huruizhi/Inkora/releases/download/v999.0.0-beta.1/PROVENANCE.json"
    let releases: [[String: Any]] = [
      [
        "tag_name": "v999.0.0-beta.1", "draft": false,
        "prerelease": true, "html_url": page,
        "assets": [["name": "PROVENANCE.json", "browser_download_url": asset]],
      ]
    ]
    ReleaseURLProtocol.configure([
      ReleaseLookup.endpoint.absoluteString: try JSONSerialization.data(withJSONObject: releases),
      asset: try metadata(),
    ])
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [ReleaseURLProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let lookup = ReleaseLookup(session: session)
    let beta = try await lookup.latest(channel: .beta)
    XCTAssertEqual(beta?.build, 3)  // Current build 4 must not see this old release as newer.
    let stable = try await lookup.latest(channel: .stable)
    XCTAssertNil(stable)
    ReleaseURLProtocol.configure([:])
    do {
      _ = try await lookup.latest(channel: .beta)
      XCTFail("offline must throw")
    } catch {}
  }
}
