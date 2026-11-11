import Foundation

/// Native update policy is deliberately independent of the editor and Sparkle.
enum UpdateChannel: String, CaseIterable {
  case stable, beta

  var allowedChannels: Set<String> { self == .beta ? ["beta"] : [] }
}

struct UpdateConfiguration: Equatable {
  let feedURL: URL
  let publicKey: String

  init?(info: [String: Any]) {
    guard let feed = info["SUFeedURL"] as? String,
      let url = URL(string: feed), url.scheme == "https", url.host != nil,
      url.user == nil, url.password == nil,
      let key = info["SUPublicEDKey"] as? String,
      let decoded = Data(base64Encoded: key), decoded.count == 32,
      info["SUVerifyUpdateBeforeExtraction"] as? Bool == true,
      info["SURequireSignedFeed"] as? Bool == true
    else { return nil }
    feedURL = url
    publicKey = key
  }
}

@MainActor
final class UpdatePreferences {
  private let defaults: UserDefaults
  private enum Key {
    static let checks = "InkoraUpdatesAutomaticChecks"
    static let downloads = "InkoraUpdatesAutomaticDownloads"
    static let channel = "InkoraUpdatesChannel"
    static let pendingBuild = "InkoraUpdatesPendingBuild"
  }

  init(defaults: UserDefaults) { self.defaults = defaults }

  /// A prepared SDK update may outlive sessionInProgress and process restarts.
  var pendingUpdateBuild: String? {
    get { defaults.string(forKey: Key.pendingBuild) }
    set { defaults.set(newValue, forKey: Key.pendingBuild) }
  }

  var automaticChecks: Bool {
    get { defaults.object(forKey: Key.checks) as? Bool ?? true }
    set { defaults.set(newValue, forKey: Key.checks) }
  }

  var automaticDownloads: Bool {
    get { defaults.object(forKey: Key.downloads) as? Bool ?? true }
    set { defaults.set(newValue, forKey: Key.downloads) }
  }

  var channel: UpdateChannel {
    get { UpdateChannel(rawValue: defaults.string(forKey: Key.channel) ?? "") ?? .beta }
    set { defaults.set(newValue.rawValue, forKey: Key.channel) }
  }
}

/// Tests and Debug builds must never start scheduling network operations.
struct UpdateLaunchPolicy {
  static func permitsStarting(
    isDebug: Bool, bundleIdentifier: String?, environment: [String: String]
  ) -> Bool {
    !isDebug && bundleIdentifier == "com.huruizhi.Inkora"
      && environment["XCTestConfigurationFilePath"] == nil
      && environment["XCTestBundlePath"] == nil
  }
}
