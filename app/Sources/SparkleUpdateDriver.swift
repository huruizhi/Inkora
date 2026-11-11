#if INKORA_SPARKLE
  import AppKit
  import Sparkle

  /// Compiled only into a distribution that can load the signed SDK safely.
  @MainActor
  final class SparkleUpdateDriver: NSObject, NativeUpdateDriver, SPUUpdaterDelegate {
    private let preferences: UpdatePreferences
    private var controller: SPUStandardUpdaterController!

    init(preferences: UpdatePreferences) throws {
      self.preferences = preferences
      super.init()
      if let pending = preferences.pendingUpdateBuild, let pendingBuild = UInt64(pending),
        let current = UInt64(
          Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""),
        current >= pendingBuild
      {
        preferences.pendingUpdateBuild = nil
      }
      controller = SPUStandardUpdaterController(
        startingUpdater: false, updaterDelegate: self, userDriverDelegate: nil)
      controller.updater.automaticallyChecksForUpdates = preferences.automaticChecks
      controller.updater.automaticallyDownloadsUpdates =
        preferences.automaticChecks && preferences.automaticDownloads
      controller.updater.sendsSystemProfile = false
      controller.updater.updateCheckInterval = 86400
      try controller.updater.start()
    }

    var sessionInProgress: Bool { controller.updater.sessionInProgress }
    var canCheckForUpdates: Bool { controller.updater.canCheckForUpdates }
    func checkForUpdates() { controller.checkForUpdates(nil) }
    func apply(automaticChecks: Bool, automaticDownloads: Bool) {
      controller.updater.automaticallyChecksForUpdates = automaticChecks
      controller.updater.automaticallyDownloadsUpdates = automaticDownloads
    }
    func resetUpdateCycle() { controller.updater.resetUpdateCycle() }
    func updater(_ updater: SPUUpdater, didDownloadUpdate item: SUAppcastItem) {
      preferences.pendingUpdateBuild = item.versionString
    }

    func allowedChannels(for updater: SPUUpdater) -> Set<String> {
      preferences.channel.allowedChannels
    }
  }
#endif
