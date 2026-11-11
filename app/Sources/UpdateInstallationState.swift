import Foundation

/// Only a terminal failure attributable to this process's unprepared attempt
/// may release its channel lock. Persisted or handed-off work stays protected.
@MainActor
final class UpdateInstallationState {
  private struct Attempt {
    let id: UUID
    let build: String
    let ownsPendingRecord: Bool
    var prepared = false
  }
  private let preferences: UpdatePreferences
  private var current: Attempt?

  init(preferences: UpdatePreferences) { self.preferences = preferences }

  func downloaded(build: String) -> UUID {
    let replacesOwnUnpreparedDownload =
      current?.ownsPendingRecord == true
      && current?.prepared == false && preferences.pendingUpdateBuild == current?.build
    let attempt = Attempt(
      id: UUID(), build: build,
      ownsPendingRecord: preferences.pendingUpdateBuild == nil || replacesOwnUnpreparedDownload)
    current = attempt
    if attempt.ownsPendingRecord { preferences.pendingUpdateBuild = build }
    return attempt.id
  }

  func prepared(build: String) {
    if current?.build == build { current?.prepared = true }
    preferences.pendingUpdateBuild = build
  }

  func abort(attempt: UUID, domain: String, code: Int) {
    // These SDK errors are terminal extraction/signature/validation failures.
    // SUNoUpdateError and arbitrary network/install errors are not evidence that
    // an older resumable installer or deferred update has disappeared.
    guard domain == "SUSparkleErrorDomain", [3000, 3001, 3002].contains(code),
      let current, current.id == attempt, !current.prepared,
      current.ownsPendingRecord, preferences.pendingUpdateBuild == current.build
    else { return }
    preferences.pendingUpdateBuild = nil
    self.current = nil
  }

  func finished(attempt: UUID) {
    guard current?.id == attempt else { return }
    // A successful/dismissed cycle can leave a cached download or a manually
    // deferred installer. Without a public query, retain it as unknown work.
    current = nil
  }
}
