import XCTest

final class UpdatePolicyTests: XCTestCase {
  func testConfigurationRequiresTrustAndHTTPS() {
    let key = Data(repeating: 1, count: 32).base64EncodedString()
    var info: [String: Any] = [
      "SUFeedURL": "https://example.invalid/appcast.xml", "SUPublicEDKey": key,
      "SUVerifyUpdateBeforeExtraction": true, "SURequireSignedFeed": true,
    ]
    XCTAssertNotNil(UpdateConfiguration(info: info))
    for name in ["SUPublicEDKey", "SURequireSignedFeed", "SUVerifyUpdateBeforeExtraction"] {
      var missing = info
      missing.removeValue(forKey: name)
      XCTAssertNil(UpdateConfiguration(info: missing))
    }
    for feed in [
      "http://example.invalid/feed", "file:///tmp/feed", "https://user:pass@example.invalid/feed",
    ] {
      info["SUFeedURL"] = feed
      XCTAssertNil(UpdateConfiguration(info: info))
    }
  }

  func testLaunchPolicyExcludesDebugAndTestHosts() {
    XCTAssertTrue(
      UpdateLaunchPolicy.permitsStarting(
        isDebug: false, bundleIdentifier: "com.huruizhi.Inkora", environment: [:]))
    XCTAssertFalse(
      UpdateLaunchPolicy.permitsStarting(
        isDebug: true, bundleIdentifier: "com.huruizhi.Inkora", environment: [:]))
    XCTAssertFalse(
      UpdateLaunchPolicy.permitsStarting(
        isDebug: false, bundleIdentifier: "com.huruizhi.Inkora.UITesting", environment: [:]))
    XCTAssertFalse(
      UpdateLaunchPolicy.permitsStarting(
        isDebug: false, bundleIdentifier: "com.huruizhi.Inkora",
        environment: ["XCTestConfigurationFilePath": "/temporary/test"]))
  }

  @MainActor
  func testPreferencesPersistExplicitOptOutAndChannel() {
    let suite = "Inkora.UpdatePolicyTests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = UpdatePreferences(defaults: defaults)
    XCTAssertTrue(preferences.automaticChecks)
    XCTAssertTrue(preferences.automaticDownloads)
    XCTAssertEqual(preferences.channel, .beta)
    preferences.automaticChecks = false
    preferences.automaticDownloads = false
    preferences.channel = .stable
    let reopened = UpdatePreferences(defaults: defaults)
    XCTAssertFalse(reopened.automaticChecks)
    XCTAssertFalse(reopened.automaticDownloads)
    XCTAssertEqual(reopened.channel.allowedChannels, [])
    reopened.channel = .beta
    XCTAssertEqual(reopened.channel.allowedChannels, ["beta"])
  }
}
