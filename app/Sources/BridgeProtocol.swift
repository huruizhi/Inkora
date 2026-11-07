import Foundation

enum BridgeProtocolV1 {
  static let version = 1
  static let maxSafeRevision = 9_007_199_254_740_991
}

enum BridgeCommandType: String, Codable {
  case loadDocument
  case createSnapshot
  case executeCommand
  case queryState
}

enum BridgeEventType: String, Codable {
  case ready
  case stateChanged
  case snapshotReady
  case editorError
}

enum BridgeEditorCommand: String, Codable {
  case undo
  case redo
}

enum BridgeErrorCode: String, Codable, CaseIterable {
  case invalidMessage = "invalid_message"
  case unsupportedVersion = "unsupported_version"
  case editorNotReady = "editor_not_ready"
  case staleRevision = "stale_revision"
  case requestConflict = "request_conflict"
  case commandRejected = "command_rejected"
  case internalError = "internal_error"

  var recoveryAction: BridgeRecoveryAction {
    switch self {
    case .editorNotReady, .staleRevision, .requestConflict:
      .retry
    case .commandRejected:
      .notify
    case .invalidMessage, .unsupportedVersion, .internalError:
      .stopSaving
    }
  }
}

enum BridgeRecoveryAction: String, Codable {
  case retry
  case notify
  case stopSaving = "stop_saving"
}

struct BridgeEditorState: Codable, Equatable {
  let documentID: String
  let revision: Int
  let dirty: Bool
  let canUndo: Bool
  let canRedo: Bool
}

struct BridgeNativeCommand: Codable, Equatable {
  let protocolVersion: Int
  let type: BridgeCommandType
  let requestID: String
  let documentID: String?
  let revision: Int?
  let text: String?
  let command: BridgeEditorCommand?

  static func loadDocument(
    requestID: String,
    documentID: String,
    revision: Int,
    text: String
  ) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .loadDocument,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: text,
      command: nil
    )
  }

  static func createSnapshot(requestID: String, documentID: String, revision: Int) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .createSnapshot,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: nil,
      command: nil
    )
  }

  func validate() throws {
    guard protocolVersion == BridgeProtocolV1.version else {
      throw BridgeProtocolValidationError.unsupportedVersion
    }
    guard !requestID.isEmpty else {
      throw BridgeProtocolValidationError.missingField("requestID")
    }

    switch type {
    case .loadDocument:
      try validateDocumentRevision()
      guard text != nil else { throw BridgeProtocolValidationError.missingField("text") }
    case .createSnapshot:
      try validateDocumentRevision()
    case .executeCommand:
      try validateDocumentRevision()
      guard command != nil else { throw BridgeProtocolValidationError.missingField("command") }
    case .queryState:
      break
    }
  }

  private func validateDocumentRevision() throws {
    guard let documentID, !documentID.isEmpty else {
      throw BridgeProtocolValidationError.missingField("documentID")
    }
    guard
      let revision,
      revision >= 0,
      revision <= BridgeProtocolV1.maxSafeRevision
    else {
      throw BridgeProtocolValidationError.invalidRevision
    }
  }
}

struct BridgeEditorEvent: Codable, Equatable {
  let protocolVersion: Int
  let type: BridgeEventType
  let requestID: String?
  let documentID: String?
  let revision: Int?
  let state: BridgeEditorState?
  let text: String?
  let code: BridgeErrorCode?
  let action: BridgeRecoveryAction?
  let message: String?

  func validate() throws {
    guard protocolVersion == BridgeProtocolV1.version else {
      throw BridgeProtocolValidationError.unsupportedVersion
    }

    switch type {
    case .ready:
      break
    case .stateChanged:
      guard let state else { throw BridgeProtocolValidationError.missingField("state") }
      guard !state.documentID.isEmpty else {
        throw BridgeProtocolValidationError.missingField("state.documentID")
      }
      try Self.validateRevision(state.revision)
    case .snapshotReady:
      guard let requestID, !requestID.isEmpty else {
        throw BridgeProtocolValidationError.missingField("requestID")
      }
      guard let documentID, !documentID.isEmpty else {
        throw BridgeProtocolValidationError.missingField("documentID")
      }
      guard let revision else { throw BridgeProtocolValidationError.missingField("revision") }
      try Self.validateRevision(revision)
      guard text != nil else { throw BridgeProtocolValidationError.missingField("text") }
    case .editorError:
      guard let code else { throw BridgeProtocolValidationError.missingField("code") }
      guard action == code.recoveryAction else {
        throw BridgeProtocolValidationError.invalidErrorAction
      }
      guard let message, !message.isEmpty else {
        throw BridgeProtocolValidationError.missingField("message")
      }
    }
  }

  private static func validateRevision(_ revision: Int) throws {
    guard revision >= 0, revision <= BridgeProtocolV1.maxSafeRevision else {
      throw BridgeProtocolValidationError.invalidRevision
    }
  }
}

enum BridgeProtocolValidationError: Error, Equatable {
  case unsupportedVersion
  case missingField(String)
  case invalidRevision
  case invalidErrorAction
}

struct BridgeRevisionTracker {
  private(set) var documentID: String?
  private(set) var latestRevision: Int?

  mutating func beginDocument(documentID: String, revision: Int) {
    self.documentID = documentID
    latestRevision = revision
  }

  mutating func accept(_ state: BridgeEditorState) -> Bool {
    guard state.documentID == documentID else { return false }
    guard state.revision >= (latestRevision ?? -1) else { return false }
    latestRevision = state.revision
    return true
  }
}
