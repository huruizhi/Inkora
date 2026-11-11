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
  private func historicalBeta1() throws -> Data {
    let local = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .appendingPathComponent("Fixtures/beta1-public-provenance.json")
    let repository = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
      .appendingPathComponent("tests/InkoraTests/Fixtures/beta1-public-provenance.json")
    return try Data(
      contentsOf: FileManager.default.fileExists(atPath: local.path) ? local : repository)
  }

  private var historicalURLs: Set<String> {
    Set(
      ["zip", "dmg"].map {
        "https://github.com/huruizhi/Inkora/releases/download/v0.1.0-beta.1/Inkora-0.1.0-beta.1-unsigned-universal.\($0)"
      })
  }

  func testHistoricalBeta1RejectsChangedBytesChannelAndMissingAssets() throws {
    let original = try historicalBeta1()
    XCTAssertEqual(
      try ReleaseLookup.build(
        metadata: original, tag: "v0.1.0-beta.1",
        prerelease: true, assetURLs: historicalURLs), 3)
    for bytes in [original + Data(" ".utf8), Data("{}".utf8)] {
      XCTAssertThrowsError(
        try ReleaseLookup.build(
          metadata: bytes, tag: "v0.1.0-beta.1",
          prerelease: true, assetURLs: historicalURLs))
    }
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: original, tag: "v0.1.0-beta.1",
        prerelease: false, assetURLs: historicalURLs))
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: original, tag: "v0.1.0-beta.1",
        prerelease: true, assetURLs: []))
  }

  func testNewBuildThenActualHistoricalBeta1ThroughPublicLookup() async throws {
    let tag = "v0.1.0-beta.2"
    let base = "https://github.com/huruizhi/Inkora/releases/download/"
    let zip = base + tag + "/Inkora.zip"
    let manifest: [String: Any] = [
      "schema": "inkora.release.v1", "bundleIdentifier": "com.huruizhi.Inkora",
      "buildVersion": "5", "marketingVersion": "0.1.0", "channel": "beta", "tag": tag,
      "sourceCommit": String(repeating: "a", count: 40),
      "assets": [
        [
          "name": "Inkora.zip", "url": zip, "byteLength": 123,
          "sha256": String(repeating: "b", count: 64),
        ]
      ],
    ]
    let releases: [[String: Any]] = [tag, "v0.1.0-beta.1"].map { name in
      let urls = name == tag ? Set([zip]) : historicalURLs
      return [
        "tag_name": name, "draft": false, "prerelease": true,
        "html_url": "https://github.com/huruizhi/Inkora/releases/tag/" + name,
        "assets": (urls.union([base + name + "/PROVENANCE.json"])).map {
          ["name": URL(string: $0)!.lastPathComponent, "browser_download_url": $0]
        },
      ]
    }
    ReleaseURLProtocol.configure([
      ReleaseLookup.endpoint.absoluteString: try JSONSerialization.data(withJSONObject: releases),
      base + tag + "/PROVENANCE.json": try JSONSerialization.data(withJSONObject: manifest),
      base + "v0.1.0-beta.1/PROVENANCE.json": try historicalBeta1(),
    ])
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [ReleaseURLProtocol.self]
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let result = try await ReleaseLookup(session: session).latest(channel: .beta)
    XCTAssertEqual(result?.build, 5)
  }

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
  func testLegacyRejectsPresentInvalidSchema() throws {
    let legacy = try JSONSerialization.jsonObject(with: metadata()) as! [String: Any]
    for schema: Any in [42, NSNull(), false, [], [:], "", "unknown", "inkora.release.v1"] {
      var info = legacy
      info["schema"] = schema
      XCTAssertThrowsError(
        try ReleaseLookup.build(
          metadata: JSONSerialization.data(withJSONObject: info), tag: "v0.1.0-beta.1",
          prerelease: true), "Present schema must never fall back: \(schema)")
    }
  }

  func testLegacyRejectsConflictingOrMistypedSemanticAliases() throws {
    let versions = [
      "CFBundleIdentifier": "com.huruizhi.Inkora", "CFBundleVersion": "3",
      "CFBundleShortVersionString": "0.1.0",
    ]
    let legacy: [String: Any] = [
      "checks": ["export": ["versions": versions], "zip": ["versions": versions]]
    ]
    let aliases = [
      "bundleIdentifier": "com.huruizhi.Inkora", "CFBundleIdentifier": "com.huruizhi.Inkora",
      "buildVersion": "3", "build": "3", "CFBundleVersion": "3",
      "marketingVersion": "0.1.0", "version": "0.1.0", "CFBundleShortVersionString": "0.1.0",
      "tag": "v0.1.0-beta.1", "releaseTag": "v0.1.0-beta.1", "tag_name": "v0.1.0-beta.1",
      "channel": "beta",
    ]
    for (key, matching) in aliases {
      var info = legacy
      info[key] = matching
      XCTAssertEqual(
        try ReleaseLookup.build(
          metadata: JSONSerialization.data(withJSONObject: info),
          tag: "v0.1.0-beta.1", prerelease: true), 3)
      for invalid: Any in ["conflict", 42, NSNull()] {
        info[key] = invalid
        XCTAssertThrowsError(
          try ReleaseLookup.build(
            metadata: JSONSerialization.data(withJSONObject: info),
            tag: "v0.1.0-beta.1", prerelease: true), "Alias \(key) must reject \(invalid)")
      }
    }
    var contradictory = legacy
    contradictory["bundleIdentifier"] = "other.app"
    contradictory["buildVersion"] = "999"
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: JSONSerialization.data(withJSONObject: contradictory),
        tag: "v0.1.0-beta.1", prerelease: true))
    var badRelease = legacy
    badRelease["version"] = "0.1.0"
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: JSONSerialization.data(withJSONObject: badRelease),
        tag: "v9.0.0-beta.1", prerelease: true))
  }

  func testLegacyPrereleaseAliasesRequireActualMatchingBooleans() throws {
    let legacy = try JSONSerialization.jsonObject(with: metadata()) as! [String: Any]
    for key in ["prerelease", "isPrerelease"] {
      var matching = legacy
      matching[key] = true
      XCTAssertEqual(
        try ReleaseLookup.build(
          metadata: JSONSerialization.data(withJSONObject: matching),
          tag: "v0.1.0-beta.1", prerelease: true), 3)
      for invalid: Any in [false, 1, "true", NSNull()] {
        matching[key] = invalid
        XCTAssertThrowsError(
          try ReleaseLookup.build(
            metadata: JSONSerialization.data(withJSONObject: matching),
            tag: "v0.1.0-beta.1", prerelease: true))
      }
    }
    var missingMarketing = legacy
    missingMarketing["version"] = "0.1.0"
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: JSONSerialization.data(withJSONObject: missingMarketing),
        tag: "v0.1.0-beta.1", prerelease: true), "Do not invent a missing checks marketing version")
    let beta1WithoutChecks: [String: Any] = [
      "build": "3", "version": "0.1.0", "releaseTag": "v0.1.0-beta.1",
    ]
    XCTAssertThrowsError(
      try ReleaseLookup.build(
        metadata: JSONSerialization.data(withJSONObject: beta1WithoutChecks),
        tag: "v0.1.0-beta.1", prerelease: true))
  }

  func testLegacyRejectsMalformedAdditionalCheckVersions() throws {
    let versions = ["CFBundleIdentifier": "com.huruizhi.Inkora", "CFBundleVersion": "3"]
    for invalid: Any in [
      42, NSNull(), [], ["CFBundleVersion": 3],
      ["CFBundleIdentifier": "other.app", "CFBundleVersion": "3"],
    ] {
      let info: [String: Any] = [
        "checks": [
          "export": ["versions": versions],
          "zip": ["versions": versions], "archive": ["versions": invalid],
        ]
      ]
      XCTAssertThrowsError(
        try ReleaseLookup.build(
          metadata: JSONSerialization.data(withJSONObject: info),
          tag: "v0.1.0-beta.1", prerelease: true))
    }
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
