import XCTest

@MainActor
private final class UpdateDriverFixture: NativeUpdateDriver {
  var sessionInProgress = false
  var canCheckForUpdates = true
  var checks = 0
  var resets = 0
  var settings: (Bool, Bool)?
  func checkForUpdates() {
    checks += 1
    canCheckForUpdates = false
    sessionInProgress = true
  }
  func apply(automaticChecks: Bool, automaticDownloads: Bool) {
    settings = (automaticChecks, automaticDownloads)
  }
  func resetUpdateCycle() { resets += 1 }
}

final class UpdateServiceTests: XCTestCase {
  @MainActor
  func testSDKSessionLocksChannelAndPreventsDuplicateCheck() {
    let suite = "Inkora.UpdateServiceTests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let driver = UpdateDriverFixture()
    let service = UpdateService(preferences: UpdatePreferences(defaults: defaults), driver: driver)
    XCTAssertTrue(service.checkForUpdates())
    XCTAssertFalse(service.checkForUpdates())
    XCTAssertEqual(driver.checks, 1)
    XCTAssertFalse(service.selectChannel(.stable))
    XCTAssertEqual(service.preferences.channel, .beta)
    driver.sessionInProgress = false
    XCTAssertTrue(service.selectChannel(.stable))
    XCTAssertEqual(driver.resets, 1)
    service.preferences.pendingUpdateBuild = "5"
    XCTAssertFalse(service.selectChannel(.beta), "Deferred installation survives the SDK session")
    service.setAutomaticChecks(false)
    XCTAssertEqual(driver.settings?.0, false)
    XCTAssertEqual(driver.settings?.1, false)
    XCTAssertTrue(service.preferences.automaticDownloads)
    service.setAutomaticDownloads(false)
    service.setAutomaticChecks(true)
    XCTAssertEqual(driver.settings?.1, false)
  }
}
