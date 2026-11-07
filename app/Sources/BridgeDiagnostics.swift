import Foundation
import OSLog

struct BridgeDiagnosticEvent: Equatable {
  enum Name: String {
    case bridgeUnavailable = "bridge_unavailable"
    case invalidMessage = "invalid_message"
    case processTerminated = "process_terminated"
    case recoveryAttempted = "recovery_attempted"
    case recoveryCompleted = "recovery_completed"
    case remoteError = "remote_error"
    case snapshotFailed = "snapshot_failed"
    case snapshotRequested = "snapshot_requested"
    case snapshotSucceeded = "snapshot_succeeded"
  }

  let name: Name
  let requestID: String?
  let revision: Int?
  let category: String
}

@MainActor
final class BridgeDiagnostics {
  typealias Sink = (BridgeDiagnosticEvent) -> Void

  private let logger: Logger
  private let sink: Sink?

  init(
    subsystem: String = "com.huruizhi.Inkora",
    sink: Sink? = nil
  ) {
    logger = Logger(subsystem: subsystem, category: "EditorBridge")
    self.sink = sink
  }

  func record(_ event: BridgeDiagnosticEvent) {
    let name = event.name.rawValue
    let requestID = event.requestID ?? "-"
    let revision = event.revision.map(String.init) ?? "-"
    let category = event.category

    logger.log(
      "event=\(name, privacy: .public) request_id=\(requestID, privacy: .public) revision=\(revision, privacy: .public) category=\(category, privacy: .public)"
    )
    sink?(event)
  }
}
