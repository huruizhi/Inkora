import Foundation

/// Sparkle stays behind this boundary; the editor never receives update traffic.
@MainActor
protocol NativeUpdateDriver: AnyObject {
  var sessionInProgress: Bool { get }
  var canCheckForUpdates: Bool { get }
  func checkForUpdates()
  func apply(automaticChecks: Bool, automaticDownloads: Bool)
  func resetUpdateCycle()
}

@MainActor
final class UpdateService {
  let preferences: UpdatePreferences
  private let driver: (any NativeUpdateDriver)?
  let unavailableReason: String?

  init(
    preferences: UpdatePreferences, driver: (any NativeUpdateDriver)?,
    unavailableReason: String? = nil
  ) {
    self.preferences = preferences
    self.driver = driver
    self.unavailableReason = unavailableReason
    applyPreferences()
  }

  var canCheck: Bool { driver?.canCheckForUpdates == true }
  var canChangeChannel: Bool {
    driver?.sessionInProgress != true && preferences.pendingUpdateBuild == nil
  }

  @discardableResult
  func checkForUpdates() -> Bool {
    guard let driver, driver.canCheckForUpdates else { return false }
    driver.checkForUpdates()
    return true
  }

  /// A downloaded or installing update belongs to its original channel. Keep the
  /// channel fixed for the complete SDK session, including deferred installation.
  @discardableResult
  func selectChannel(_ channel: UpdateChannel) -> Bool {
    guard canChangeChannel else { return false }
    guard preferences.channel != channel else { return true }
    preferences.channel = channel
    driver?.resetUpdateCycle()
    return true
  }

  func setAutomaticChecks(_ enabled: Bool) {
    preferences.automaticChecks = enabled
    applyPreferences()
  }

  func setAutomaticDownloads(_ enabled: Bool) {
    preferences.automaticDownloads = enabled
    applyPreferences()
  }

  private func applyPreferences() {
    driver?.apply(
      automaticChecks: preferences.automaticChecks,
      automaticDownloads: preferences.automaticChecks && preferences.automaticDownloads)
  }
}
