import Foundation

enum BridgeProtocolV1 {
  static let version = 1
  static let maxSafeRevision = 9_007_199_254_740_991
}

enum BridgeCommandType: String, Codable {
  case loadDocument
  case createSnapshot
  case markSaved
  case executeCommand
  case queryState
  case applyImageImport
  case setImageDescriptors
  case prepareImageSave
}

enum BridgeEventType: String, Codable {
  case ready
  case stateChanged
  case snapshotReady
  case editorError
  case imageAccessRequested
}

enum BridgeEditorCommand: String, Codable {
  case undo
  case redo
}

enum BridgeImageStatus: String, Codable {
  case ready
  case missing
  case denied
  case unsupported
  case error
  case pending
}

struct BridgeImageDescriptor: Codable, Equatable {
  let href: String
  let status: BridgeImageStatus
  let displayURL: String?
  let message: String?
}

struct BridgeImageRewrite: Codable, Equatable {
  let assetID: String
  let from: String
  let to: String
}

struct BridgeImageOwnershipProof: Codable, Equatable {
  let documentID: String
  let revision: Int
  let raw: String
  let imageURIs: [String]

  func validate(documentID: String, revision: Int, raw: String) throws {
    guard self.documentID == documentID, self.revision == revision, self.raw == raw else {
      throw BridgeProtocolValidationError.invalidImageOwnership
    }
    guard imageURIs.allSatisfy({ !$0.isEmpty }) else {
      throw BridgeProtocolValidationError.invalidImageOwnership
    }
  }
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
  let selectionAnchor: Int?
  let selectionHead: Int?

  init(
    documentID: String, revision: Int, dirty: Bool, canUndo: Bool, canRedo: Bool,
    selectionAnchor: Int? = nil, selectionHead: Int? = nil
  ) {
    self.documentID = documentID
    self.revision = revision
    self.dirty = dirty
    self.canUndo = canUndo
    self.canRedo = canRedo
    self.selectionAnchor = selectionAnchor
    self.selectionHead = selectionHead
  }
}

struct BridgeNativeCommand: Codable, Equatable {
  let protocolVersion: Int
  let type: BridgeCommandType
  let requestID: String
  let documentID: String?
  let revision: Int?
  let text: String?
  let command: BridgeEditorCommand?
  let documentEpoch: String?
  let assetID: String?
  let uri: String?
  let alt: String?
  let title: String?
  let displayURL: String?
  let selectionAnchor: Int?
  let selectionHead: Int?
  let imageOwnership: BridgeImageOwnershipProof?
  let descriptors: [BridgeImageDescriptor]?
  let rewrites: [BridgeImageRewrite]?

  init(
    protocolVersion: Int,
    type: BridgeCommandType,
    requestID: String,
    documentID: String?,
    revision: Int?,
    text: String?,
    command: BridgeEditorCommand?,
    documentEpoch: String? = nil,
    assetID: String? = nil,
    uri: String? = nil,
    alt: String? = nil,
    title: String? = nil,
    displayURL: String? = nil,
    selectionAnchor: Int? = nil,
    selectionHead: Int? = nil,
    imageOwnership: BridgeImageOwnershipProof? = nil,
    descriptors: [BridgeImageDescriptor]? = nil,
    rewrites: [BridgeImageRewrite]? = nil
  ) {
    self.protocolVersion = protocolVersion
    self.type = type
    self.requestID = requestID
    self.documentID = documentID
    self.revision = revision
    self.text = text
    self.command = command
    self.documentEpoch = documentEpoch
    self.assetID = assetID
    self.uri = uri
    self.alt = alt
    self.title = title
    self.displayURL = displayURL
    self.selectionAnchor = selectionAnchor
    self.selectionHead = selectionHead
    self.imageOwnership = imageOwnership
    self.descriptors = descriptors
    self.rewrites = rewrites
  }

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
      command: nil,
      documentEpoch: nil,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      descriptors: nil,
      rewrites: nil
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
      command: nil,
      documentEpoch: nil,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      descriptors: nil,
      rewrites: nil
    )
  }

  static func markSaved(
    requestID: String,
    documentID: String,
    revision: Int,
    text: String
  ) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .markSaved,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: text,
      command: nil,
      documentEpoch: nil,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      descriptors: nil,
      rewrites: nil
    )
  }

  static func execute(
    requestID: String,
    documentID: String,
    revision: Int,
    command: BridgeEditorCommand
  ) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .executeCommand,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: nil,
      command: command,
      documentEpoch: nil,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      descriptors: nil,
      rewrites: nil
    )
  }

  static func queryState(requestID: String) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .queryState,
      requestID: requestID,
      documentID: nil,
      revision: nil,
      text: nil,
      command: nil,
      documentEpoch: nil,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      descriptors: nil,
      rewrites: nil
    )
  }

  static func applyImageImport(
    requestID: String,
    documentID: String,
    revision: Int,
    documentEpoch: String,
    assetID: String,
    uri: String,
    alt: String,
    title: String?,
    displayURL: String,
    selectionAnchor: Int,
    selectionHead: Int
  ) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .applyImageImport,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: nil,
      command: nil,
      documentEpoch: documentEpoch,
      assetID: assetID,
      uri: uri,
      alt: alt,
      title: title,
      displayURL: displayURL,
      selectionAnchor: selectionAnchor,
      selectionHead: selectionHead,
      descriptors: nil,
      rewrites: nil
    )
  }

  static func setImageDescriptors(
    requestID: String,
    documentID: String,
    revision: Int,
    documentEpoch: String,
    ownership: BridgeImageOwnershipProof,
    descriptors: [BridgeImageDescriptor]
  ) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .setImageDescriptors,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: nil,
      command: nil,
      documentEpoch: documentEpoch,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      imageOwnership: ownership,
      descriptors: descriptors,
      rewrites: nil
    )
  }

  static func prepareImageSave(
    requestID: String,
    documentID: String,
    revision: Int,
    documentEpoch: String,
    ownership: BridgeImageOwnershipProof,
    rewrites: [BridgeImageRewrite]
  ) -> Self {
    Self(
      protocolVersion: BridgeProtocolV1.version,
      type: .prepareImageSave,
      requestID: requestID,
      documentID: documentID,
      revision: revision,
      text: nil,
      command: nil,
      documentEpoch: documentEpoch,
      assetID: nil,
      uri: nil,
      alt: nil,
      title: nil,
      displayURL: nil,
      imageOwnership: ownership,
      descriptors: nil,
      rewrites: rewrites
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
    case .markSaved:
      try validateDocumentRevision()
      guard text != nil else { throw BridgeProtocolValidationError.missingField("text") }
    case .executeCommand:
      try validateDocumentRevision()
      guard command != nil else { throw BridgeProtocolValidationError.missingField("command") }
    case .queryState:
      break
    case .applyImageImport:
      try validateDocumentRevision()
      try validateDocumentEpoch()
      guard let assetID, !assetID.isEmpty else {
        throw BridgeProtocolValidationError.missingField("assetID")
      }
      guard let uri, !uri.isEmpty else {
        throw BridgeProtocolValidationError.missingField("uri")
      }
      guard alt != nil else { throw BridgeProtocolValidationError.missingField("alt") }
      guard let selectionAnchor, let selectionHead else {
        throw BridgeProtocolValidationError.missingField("selection")
      }
      guard selectionAnchor >= 0, selectionAnchor <= BridgeProtocolV1.maxSafeRevision,
        selectionHead >= 0, selectionHead <= BridgeProtocolV1.maxSafeRevision
      else { throw BridgeProtocolValidationError.invalidRevision }
      guard let displayURL, Self.isCapabilityURL(displayURL) else {
        throw BridgeProtocolValidationError.invalidCapabilityURL
      }
    case .setImageDescriptors:
      try validateDocumentRevision()
      try validateDocumentEpoch()
      guard let imageOwnership, let documentID, let revision else {
        throw BridgeProtocolValidationError.missingField("imageOwnership")
      }
      try imageOwnership.validate(
        documentID: documentID, revision: revision, raw: imageOwnership.raw)
      guard let descriptors else {
        throw BridgeProtocolValidationError.missingField("descriptors")
      }
      for descriptor in descriptors {
        guard !descriptor.href.isEmpty else {
          throw BridgeProtocolValidationError.missingField("descriptors.href")
        }
        guard imageOwnership.imageURIs.contains(descriptor.href) else {
          throw BridgeProtocolValidationError.invalidImageOwnership
        }
        if descriptor.status == .ready {
          guard let displayURL = descriptor.displayURL, Self.isCapabilityURL(displayURL) else {
            throw BridgeProtocolValidationError.invalidCapabilityURL
          }
        } else if descriptor.displayURL != nil {
          throw BridgeProtocolValidationError.invalidCapabilityURL
        }
      }
    case .prepareImageSave:
      try validateDocumentRevision()
      try validateDocumentEpoch()
      guard let imageOwnership, let documentID, let revision else {
        throw BridgeProtocolValidationError.missingField("imageOwnership")
      }
      try imageOwnership.validate(
        documentID: documentID, revision: revision, raw: imageOwnership.raw)
      guard let rewrites, !rewrites.isEmpty else {
        throw BridgeProtocolValidationError.missingField("rewrites")
      }
      for rewrite in rewrites
      where
        rewrite.assetID.isEmpty || rewrite.from.isEmpty || rewrite.to.isEmpty
      {
        throw BridgeProtocolValidationError.invalidImageRewrite
      }
    }
  }

  private func validateDocumentEpoch() throws {
    guard let documentEpoch, !documentEpoch.isEmpty else {
      throw BridgeProtocolValidationError.missingField("documentEpoch")
    }
  }

  private static func isCapabilityURL(_ string: String) -> Bool {
    guard
      let components = URLComponents(string: string),
      components.scheme == "inkora-asset",
      components.host == "resource",
      components.user == nil,
      components.password == nil,
      components.port == nil,
      components.query == nil,
      components.fragment == nil
    else { return false }
    let path = components.percentEncodedPath
    guard path.first == "/", !path.dropFirst().contains("/") else { return false }
    return UUID(uuidString: String(path.dropFirst())) != nil
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
  let href: String?
  let imageOwnership: BridgeImageOwnershipProof?

  init(
    protocolVersion: Int,
    type: BridgeEventType,
    requestID: String?,
    documentID: String?,
    revision: Int?,
    state: BridgeEditorState?,
    text: String?,
    code: BridgeErrorCode?,
    action: BridgeRecoveryAction?,
    message: String?,
    href: String? = nil,
    imageOwnership: BridgeImageOwnershipProof? = nil
  ) {
    self.protocolVersion = protocolVersion
    self.type = type
    self.requestID = requestID
    self.documentID = documentID
    self.revision = revision
    self.state = state
    self.text = text
    self.code = code
    self.action = action
    self.message = message
    self.href = href
    self.imageOwnership = imageOwnership
  }

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
      if let anchor = state.selectionAnchor, let head = state.selectionHead {
        try Self.validateRevision(anchor)
        try Self.validateRevision(head)
      } else if state.selectionAnchor != nil || state.selectionHead != nil {
        throw BridgeProtocolValidationError.missingField("state.selection")
      }
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
      if let imageOwnership {
        try imageOwnership.validate(documentID: documentID, revision: revision, raw: text!)
      }
    case .editorError:
      guard let code else { throw BridgeProtocolValidationError.missingField("code") }
      guard action == code.recoveryAction else {
        throw BridgeProtocolValidationError.invalidErrorAction
      }
      guard let message, !message.isEmpty else {
        throw BridgeProtocolValidationError.missingField("message")
      }
    case .imageAccessRequested:
      guard let documentID, !documentID.isEmpty else {
        throw BridgeProtocolValidationError.missingField("documentID")
      }
      guard let revision else { throw BridgeProtocolValidationError.missingField("revision") }
      try Self.validateRevision(revision)
      guard let href, !href.isEmpty else {
        throw BridgeProtocolValidationError.missingField("href")
      }
      if let imageOwnership {
        try imageOwnership.validate(
          documentID: documentID, revision: revision, raw: imageOwnership.raw)
        guard imageOwnership.imageURIs.contains(href) else {
          throw BridgeProtocolValidationError.invalidImageOwnership
        }
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
  case invalidCapabilityURL
  case invalidImageRewrite
  case invalidImageOwnership
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

  mutating func observeSnapshot(documentID: String, revision: Int) {
    guard documentID == self.documentID else { return }
    latestRevision = max(latestRevision ?? revision, revision)
  }
}
