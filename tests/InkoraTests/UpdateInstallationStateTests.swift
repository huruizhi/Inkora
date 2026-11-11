import XCTest

final class UpdateInstallationStateTests: XCTestCase {
  @MainActor
  func testPreinstallationSignatureFailureUnlocksChannel() {
    let suite = "Inkora.InstallationStateTests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = UpdatePreferences(defaults: defaults)
    let state = UpdateInstallationState(preferences: preferences)
    let attempt = state.downloaded(build: "5")
    XCTAssertEqual(preferences.pendingUpdateBuild, "5")
    state.abort(attempt: attempt, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertNil(preferences.pendingUpdateBuild)
  }
  @MainActor
  func testTerminalUnpreparedFailuresRecoverButPreparedAndOldWorkRemain() {
    let suite = "Inkora.InstallationStateTests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let preferences = UpdatePreferences(defaults: defaults)
    let state = UpdateInstallationState(preferences: preferences)
    for code in [3000, 3001, 3002] {
      let attempt = state.downloaded(build: "5")
      state.abort(attempt: attempt, domain: "SUSparkleErrorDomain", code: code)
      XCTAssertNil(preferences.pendingUpdateBuild)
    }
    let delta = state.downloaded(build: "5")
    let fullArchive = state.downloaded(build: "5")
    state.abort(attempt: delta, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertEqual(preferences.pendingUpdateBuild, "5")
    state.abort(attempt: fullArchive, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertNil(preferences.pendingUpdateBuild, "Fallback archive retains this cycle's ownership")
    let prepared = state.downloaded(build: "5")
    state.prepared(build: "5")
    state.abort(attempt: prepared, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertEqual(preferences.pendingUpdateBuild, "5", "Prepared installer must not be cleared")
    state.finished(attempt: prepared)
    let newer = state.downloaded(build: "6")
    state.abort(attempt: newer, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertEqual(
      preferences.pendingUpdateBuild, "5", "This failure cannot clear older deferred work")
    preferences.pendingUpdateBuild = nil
    let old = state.downloaded(build: "6")
    state.abort(attempt: old, domain: "SUSparkleErrorDomain", code: 3000)
    let current = state.downloaded(build: "7")
    state.abort(attempt: old, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertEqual(
      preferences.pendingUpdateBuild, "7", "Late old failure must not clear new attempt")
    state.abort(attempt: current, domain: "OtherDomain", code: 3001)
    state.abort(attempt: current, domain: "SUSparkleErrorDomain", code: 1001)
    XCTAssertEqual(preferences.pendingUpdateBuild, "7")
    state.finished(attempt: current)
    state.abort(attempt: current, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertEqual(
      preferences.pendingUpdateBuild, "7",
      "Finished/deferred work is no longer this process's unprepared attempt")
    let restored = UpdateInstallationState(preferences: preferences)
    restored.abort(attempt: current, domain: "SUSparkleErrorDomain", code: 3001)
    XCTAssertEqual(
      preferences.pendingUpdateBuild, "7", "Cross-process unknown work must remain locked")
  }

}
