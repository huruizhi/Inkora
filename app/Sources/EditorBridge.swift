import Foundation
import WebKit

@MainActor
protocol EditorBridgeDelegate: AnyObject {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge)
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState)
  func editorBridge(_ bridge: EditorBridge, didReceiveRecoverableError error: Error)
  func editorBridge(_ bridge: EditorBridge, didBecomeUnavailable error: Error)
  func editorBridge(_ bridge: EditorBridge, didRequestImageAccess href: String)
}

extension EditorBridgeDelegate {
  func editorBridge(_ bridge: EditorBridge, didReceiveRecoverableError error: Error) {}
  func editorBridge(_ bridge: EditorBridge, didBecomeUnavailable error: Error) {}
  func editorBridge(_ bridge: EditorBridge, didRequestImageAccess href: String) {}
}

enum EditorBridgeError: LocalizedError {
  case editorUnavailable
  case editorNotReady
  case invalidMessage
  case javaScriptEvaluation(String)
  case protocolMismatch
  case remote(BridgeErrorCode, BridgeRecoveryAction, String)
  case requestTimedOut
  case staleRevision

  var errorDescription: String? {
    switch self {
    case .editorUnavailable:
      "The editor is unavailable, so Inkora cannot save this document."
    case .editorNotReady:
      "The editor is still loading. Try again after it becomes ready."
    case .invalidMessage:
      "The editor sent an invalid Bridge message."
    case .javaScriptEvaluation(let message):
      "The editor command failed: \(message)"
    case .protocolMismatch:
      "The editor uses an incompatible Bridge protocol version."
    case .remote(_, _, let message):
      "The editor request failed: \(message)"
    case .requestTimedOut:
      "The editor did not respond before the request timed out."
    case .staleRevision:
      "The editor returned a snapshot for an unexpected revision."
    }
  }
}

struct BridgeSnapshot: Equatable {
  let documentID: String
  let revision: Int
  let text: String
}

@MainActor
final class EditorBridge: NSObject, WKScriptMessageHandler {
  typealias JavaScriptEvaluator = (
    _ script: String,
    _ completion: @escaping (Error?) -> Void
  ) -> Void

  private enum Lifecycle: Equatable {
    case loading
    case ready
    case unavailable
  }

  private struct LoadedDocument {
    let documentID: String
    let revision: Int
    let text: String
  }

  private enum SnapshotPhase {
    case snapshot(documentID: String, minimumRevision: Int)
  }

  private struct SnapshotRequest {
    let phase: SnapshotPhase
    let attempt: Int
    let completion: (Result<BridgeSnapshot, Error>) -> Void

    var minimumRevision: Int {
      switch phase {
      case .snapshot(_, let minimumRevision):
        minimumRevision
      }
    }
  }

  private struct EditorCommandRequest {
    let payload: MutationPayload
    let binding: (documentID: String, revision: Int)?
    let attempt: Int
    let completion: (Error?) -> Void
  }

  private enum MutationPayload {
    case history(BridgeEditorCommand)
    case imageImport(
      documentEpoch: String, assetID: String, uri: String, alt: String,
      title: String?, displayURL: String, selectionAnchor: Int, selectionHead: Int)
    case imageDescriptors(documentEpoch: String, descriptors: [BridgeImageDescriptor])
    case imageSave(documentEpoch: String, rewrites: [BridgeImageRewrite])

    var requiresStrictBinding: Bool {
      switch self {
      case .imageImport, .imageSave: true
      case .history, .imageDescriptors: false
      }
    }

    func command(
      requestID: String,
      documentID: String,
      revision: Int
    ) -> BridgeNativeCommand {
      switch self {
      case .history(let command):
        .execute(
          requestID: requestID, documentID: documentID, revision: revision,
          command: command)
      case .imageImport(
        let documentEpoch, let assetID, let uri, let alt, let title, let displayURL,
        let selectionAnchor, let selectionHead):
        .applyImageImport(
          requestID: requestID, documentID: documentID, revision: revision,
          documentEpoch: documentEpoch, assetID: assetID, uri: uri, alt: alt,
          title: title, displayURL: displayURL,
          selectionAnchor: selectionAnchor, selectionHead: selectionHead)
      case .imageDescriptors(let documentEpoch, let descriptors):
        .setImageDescriptors(
          requestID: requestID, documentID: documentID, revision: revision,
          documentEpoch: documentEpoch, descriptors: descriptors)
      case .imageSave(let documentEpoch, let rewrites):
        .prepareImageSave(
          requestID: requestID, documentID: documentID, revision: revision,
          documentEpoch: documentEpoch, rewrites: rewrites)
      }
    }
  }

  private struct ActiveEditorCommand {
    let requestID: String
    let request: EditorCommandRequest
  }

  weak var delegate: EditorBridgeDelegate?
  private let requestTimeout: Duration
  private let evaluator: JavaScriptEvaluator?
  private let diagnostics: BridgeDiagnostics
  private weak var webView: WKWebView?
  private var lifecycle = Lifecycle.loading
  private var currentDocument: LoadedDocument?
  private var revisionTracker = BridgeRevisionTracker()
  private var snapshotRequests: [String: SnapshotRequest] = [:]
  private var stateRequests: [String: (Result<BridgeEditorState, Error>) -> Void] = [:]
  private var editorCommandQueue: [EditorCommandRequest] = []
  private var activeEditorCommand: ActiveEditorCommand?
  private let maximumSnapshotAttempts = 3
  private let maximumEditorCommandAttempts = 3

  init(
    delegate: EditorBridgeDelegate,
    requestTimeout: Duration = .seconds(5),
    evaluator: JavaScriptEvaluator? = nil,
    diagnostics: BridgeDiagnostics = BridgeDiagnostics()
  ) {
    self.delegate = delegate
    self.requestTimeout = requestTimeout
    self.evaluator = evaluator
    self.diagnostics = diagnostics
  }

  func attach(webView: WKWebView) {
    self.webView = webView
    lifecycle = .loading
  }

  func prepareForNavigation() {
    lifecycle = .loading
    failPendingRequests(EditorBridgeError.editorNotReady)
  }

  func prepareForRecovery() {
    lifecycle = .loading
    failPendingRequests(EditorBridgeError.editorUnavailable)
    diagnostics.record(
      BridgeDiagnosticEvent(
        name: .recoveryAttempted,
        requestID: nil,
        revision: currentDocument?.revision,
        category: "lifecycle"
      )
    )
  }

  func webContentProcessDidTerminate() {
    diagnostics.record(
      BridgeDiagnosticEvent(
        name: .processTerminated,
        requestID: nil,
        revision: currentDocument?.revision,
        category: "web_process"
      )
    )
    becomeUnavailable(EditorBridgeError.editorUnavailable, recordsDiagnostic: false)
  }

  func loadDocument(documentID: String, revision: Int, text: String) {
    revisionTracker.beginDocument(documentID: documentID, revision: revision)
    currentDocument = LoadedDocument(documentID: documentID, revision: revision, text: text)
    if lifecycle == .ready {
      sendCurrentDocument { [weak self] error in
        guard let self, let error else { return }
        self.becomeUnavailable(error)
      }
    }
  }

  func requestSnapshot(completion: @escaping (Result<String, Error>) -> Void) {
    requestVersionedSnapshot { result in
      completion(result.map(\.text))
    }
  }

  func requestVersionedSnapshot(
    completion: @escaping (Result<BridgeSnapshot, Error>) -> Void
  ) {
    guard lifecycle == .ready else {
      completion(
        .failure(
          lifecycle == .loading
            ? EditorBridgeError.editorNotReady : EditorBridgeError.editorUnavailable
        )
      )
      return
    }
    guard revisionTracker.documentID != nil else {
      completion(.failure(EditorBridgeError.editorUnavailable))
      return
    }
    beginSnapshotBarrier(completion: completion, attempt: 1)
  }

  func confirmSaved(_ snapshot: BridgeSnapshot) {
    sendImmediately(
      .markSaved(
        requestID: UUID().uuidString,
        documentID: snapshot.documentID,
        revision: snapshot.revision,
        text: snapshot.text
      )
    ) { [weak self] error in
      guard let self, let error else { return }
      self.becomeUnavailable(error)
    }
  }

  func requestState(
    completion: @escaping (Result<BridgeEditorState, Error>) -> Void
  ) {
    guard lifecycle == .ready else {
      completion(.failure(EditorBridgeError.editorNotReady))
      return
    }
    let requestID = UUID().uuidString
    stateRequests[requestID] = completion
    sendImmediately(.queryState(requestID: requestID)) { [weak self] error in
      guard let self, let error, let callback = self.stateRequests.removeValue(forKey: requestID)
      else { return }
      callback(.failure(error))
    }
    Task { @MainActor [weak self] in
      try? await Task.sleep(for: self?.requestTimeout ?? .seconds(2))
      guard let callback = self?.stateRequests.removeValue(forKey: requestID) else { return }
      callback(.failure(EditorBridgeError.requestTimedOut))
    }
  }

  func executeEditorCommand(
    _ command: BridgeEditorCommand,
    completion: @escaping (Error?) -> Void = { _ in }
  ) {
    enqueueMutation(.history(command), completion: completion)
  }

  func applyImageImport(
    documentEpoch: UUID,
    assetID: UUID,
    uri: String,
    alt: String,
    title: String?,
    displayURL: URL,
    selectionAnchor: Int,
    selectionHead: Int,
    completion: @escaping (Error?) -> Void
  ) {
    enqueueMutation(
      .imageImport(
        documentEpoch: documentEpoch.uuidString.lowercased(),
        assetID: assetID.uuidString.lowercased(), uri: uri, alt: alt,
        title: title, displayURL: displayURL.absoluteString,
        selectionAnchor: selectionAnchor, selectionHead: selectionHead),
      completion: completion)
  }

  func setImageDescriptors(
    documentEpoch: UUID,
    descriptors: [BridgeImageDescriptor],
    completion: @escaping (Error?) -> Void = { _ in }
  ) {
    enqueueMutation(
      .imageDescriptors(
        documentEpoch: documentEpoch.uuidString.lowercased(), descriptors: descriptors),
      completion: completion)
  }

  func prepareImageSave(
    documentEpoch: UUID,
    rewrites: [BridgeImageRewrite],
    completion: @escaping (Error?) -> Void
  ) {
    enqueueMutation(
      .imageSave(documentEpoch: documentEpoch.uuidString.lowercased(), rewrites: rewrites),
      completion: completion)
  }

  private func enqueueMutation(
    _ payload: MutationPayload,
    completion: @escaping (Error?) -> Void
  ) {
    guard lifecycle == .ready else {
      completion(
        lifecycle == .loading
          ? EditorBridgeError.editorNotReady : EditorBridgeError.editorUnavailable
      )
      return
    }
    guard let documentID = revisionTracker.documentID,
      let revision = revisionTracker.latestRevision
    else {
      completion(EditorBridgeError.editorUnavailable)
      return
    }
    editorCommandQueue.append(
      EditorCommandRequest(
        payload: payload,
        binding: payload.requiresStrictBinding ? (documentID, revision) : nil,
        attempt: 1,
        completion: completion)
    )
    processNextEditorCommand()
  }

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard message.name == "inkora" else { return }
    guard
      message.frameInfo.isMainFrame,
      message.frameInfo.securityOrigin.protocol == EditorResourceSchemeHandler.scheme,
      message.frameInfo.securityOrigin.host == "app"
    else {
      becomeUnavailable(EditorBridgeError.invalidMessage)
      return
    }
    guard
      let serialized = message.body as? String,
      let data = serialized.data(using: .utf8),
      let editorEvent = try? JSONDecoder().decode(BridgeEditorEvent.self, from: data)
    else {
      invalidateBridge(EditorBridgeError.invalidMessage, category: "invalid_message")
      return
    }

    do {
      try editorEvent.validate()
    } catch BridgeProtocolValidationError.unsupportedVersion {
      invalidateBridge(EditorBridgeError.protocolMismatch, category: "protocol_mismatch")
      return
    } catch {
      invalidateBridge(EditorBridgeError.invalidMessage, category: "invalid_message")
      return
    }

    receiveEditorEvent(editorEvent)
  }

  func receiveEditorEvent(_ editorEvent: BridgeEditorEvent) {
    switch editorEvent.type {
    case .ready:
      completeReadyHandshake()
    case .stateChanged:
      handleStateChanged(editorEvent)
    case .snapshotReady:
      handleSnapshotReady(editorEvent)
    case .editorError:
      handleEditorError(editorEvent)
    case .imageAccessRequested:
      guard editorEvent.documentID == revisionTracker.documentID,
        let revision = editorEvent.revision,
        revision == revisionTracker.latestRevision,
        let href = editorEvent.href
      else { return }
      delegate?.editorBridge(self, didRequestImageAccess: href)
    }
  }

  func failPendingRequests(_ error: Error) {
    let requests = Array(snapshotRequests.values)
    snapshotRequests.removeAll()
    for request in requests {
      request.completion(.failure(error))
    }
    let stateCallbacks = Array(stateRequests.values)
    stateRequests.removeAll()
    for callback in stateCallbacks { callback(.failure(error)) }
    failEditorCommands(error)
  }

  func becomeUnavailable(_ error: Error, recordsDiagnostic: Bool = true) {
    lifecycle = .unavailable
    failPendingRequests(error)
    if recordsDiagnostic {
      diagnostics.record(
        BridgeDiagnosticEvent(
          name: .bridgeUnavailable,
          requestID: nil,
          revision: currentDocument?.revision,
          category: diagnosticCategory(for: error)
        )
      )
    }
    delegate?.editorBridge(self, didBecomeUnavailable: error)
  }

  private func handleStateChanged(_ event: BridgeEditorEvent) {
    guard let state = event.state else { return }
    if revisionTracker.accept(state) {
      delegate?.editorBridge(self, didChangeState: state)
    }
    guard let requestID = event.requestID else { return }
    if let callback = stateRequests.removeValue(forKey: requestID) {
      callback(.success(state))
      return
    }
    guard
      let activeEditorCommand,
      activeEditorCommand.requestID == requestID
    else { return }
    self.activeEditorCommand = nil
    activeEditorCommand.request.completion(nil)
    processNextEditorCommand()
  }

  private func handleSnapshotReady(_ event: BridgeEditorEvent) {
    guard let requestID = event.requestID else {
      invalidateBridge(EditorBridgeError.invalidMessage, category: "invalid_message")
      return
    }
    guard
      let request = snapshotRequests.removeValue(forKey: requestID),
      case .snapshot(let documentID, let minimumRevision) = request.phase
    else {
      return
    }
    guard
      event.documentID == documentID,
      let revision = event.revision,
      revision >= minimumRevision,
      let text = event.text
    else {
      diagnostics.record(
        BridgeDiagnosticEvent(
          name: .snapshotFailed,
          requestID: requestID,
          revision: event.revision,
          category: "stale_revision"
        )
      )
      request.completion(.failure(EditorBridgeError.staleRevision))
      return
    }
    revisionTracker.observeSnapshot(documentID: documentID, revision: revision)
    currentDocument = LoadedDocument(documentID: documentID, revision: revision, text: text)
    diagnostics.record(
      BridgeDiagnosticEvent(
        name: .snapshotSucceeded,
        requestID: requestID,
        revision: revision,
        category: "snapshot"
      )
    )
    request.completion(
      .success(BridgeSnapshot(documentID: documentID, revision: revision, text: text))
    )
  }

  private func handleEditorError(_ event: BridgeEditorEvent) {
    guard let code = event.code, let action = event.action, let message = event.message else {
      invalidateBridge(EditorBridgeError.invalidMessage, category: "invalid_message")
      return
    }
    let error = EditorBridgeError.remote(code, action, message)
    let requestRevision = event.requestID.flatMap { snapshotRequests[$0]?.minimumRevision }
    diagnostics.record(
      BridgeDiagnosticEvent(
        name: .remoteError,
        requestID: event.requestID,
        revision: requestRevision ?? revisionTracker.latestRevision,
        category: code.rawValue
      )
    )

    if action == .stopSaving {
      becomeUnavailable(error, recordsDiagnostic: false)
      return
    }

    if let requestID = event.requestID,
      let activeEditorCommand,
      activeEditorCommand.requestID == requestID
    {
      self.activeEditorCommand = nil
      if action == .retry, activeEditorCommand.request.binding == nil,
        activeEditorCommand.request.attempt < maximumEditorCommandAttempts
      {
        if let documentID = event.documentID, let revision = event.revision {
          revisionTracker.observeSnapshot(documentID: documentID, revision: revision)
        }
        editorCommandQueue.insert(
          EditorCommandRequest(
            payload: activeEditorCommand.request.payload,
            binding: activeEditorCommand.request.binding,
            attempt: activeEditorCommand.request.attempt + 1,
            completion: activeEditorCommand.request.completion
          ),
          at: 0
        )
      } else {
        activeEditorCommand.request.completion(error)
        delegate?.editorBridge(self, didReceiveRecoverableError: error)
      }
      processNextEditorCommand()
      return
    }

    if let requestID = event.requestID {
      guard let request = snapshotRequests.removeValue(forKey: requestID) else { return }
      if action == .retry && request.attempt < maximumSnapshotAttempts {
        beginSnapshotBarrier(completion: request.completion, attempt: request.attempt + 1)
      } else {
        request.completion(.failure(error))
        if action == .notify {
          delegate?.editorBridge(self, didReceiveRecoverableError: error)
        }
      }
    } else {
      failPendingRequests(error)
      if action == .notify {
        delegate?.editorBridge(self, didReceiveRecoverableError: error)
      }
    }
  }

  private func scheduleTimeout(for requestID: String) {
    let requestTimeout = self.requestTimeout
    Task { @MainActor [weak self] in
      do {
        try await Task.sleep(for: requestTimeout)
      } catch {
        return
      }
      guard let request = self?.snapshotRequests.removeValue(forKey: requestID) else { return }
      self?.diagnostics.record(
        BridgeDiagnosticEvent(
          name: .snapshotFailed,
          requestID: requestID,
          revision: request.minimumRevision,
          category: "timeout"
        )
      )
      request.completion(.failure(EditorBridgeError.requestTimedOut))
    }
  }

  private func processNextEditorCommand() {
    guard activeEditorCommand == nil, !editorCommandQueue.isEmpty else { return }
    guard
      lifecycle == .ready,
      let documentID = revisionTracker.documentID,
      let revision = revisionTracker.latestRevision
    else {
      failEditorCommands(EditorBridgeError.editorUnavailable)
      return
    }

    let request = editorCommandQueue.removeFirst()
    let commandDocumentID = request.binding?.documentID ?? documentID
    let commandRevision = request.binding?.revision ?? revision
    let requestID = UUID().uuidString
    activeEditorCommand = ActiveEditorCommand(requestID: requestID, request: request)
    scheduleEditorCommandTimeout(for: requestID)
    sendImmediately(
      request.payload.command(
        requestID: requestID, documentID: commandDocumentID, revision: commandRevision)
    ) { [weak self] error in
      guard let self, let error else { return }
      guard self.activeEditorCommand?.requestID == requestID else { return }
      self.activeEditorCommand = nil
      request.completion(error)
      self.delegate?.editorBridge(self, didReceiveRecoverableError: error)
      self.processNextEditorCommand()
    }
  }

  private func scheduleEditorCommandTimeout(for requestID: String) {
    let requestTimeout = self.requestTimeout
    Task { @MainActor [weak self] in
      do {
        try await Task.sleep(for: requestTimeout)
      } catch {
        return
      }
      guard let self, self.activeEditorCommand?.requestID == requestID else { return }
      let request = self.activeEditorCommand?.request
      self.activeEditorCommand = nil
      request?.completion(EditorBridgeError.requestTimedOut)
      self.delegate?.editorBridge(
        self,
        didReceiveRecoverableError: EditorBridgeError.requestTimedOut
      )
      self.processNextEditorCommand()
    }
  }

  private func failEditorCommands(_ error: Error) {
    let queued = editorCommandQueue
    editorCommandQueue.removeAll()
    let active = activeEditorCommand
    activeEditorCommand = nil
    active?.request.completion(error)
    for request in queued {
      request.completion(error)
    }
  }

  private func beginSnapshotBarrier(
    completion: @escaping (Result<BridgeSnapshot, Error>) -> Void,
    attempt: Int
  ) {
    guard
      let documentID = revisionTracker.documentID,
      let revision = revisionTracker.latestRevision
    else {
      completion(.failure(EditorBridgeError.editorUnavailable))
      return
    }
    let requestID = UUID().uuidString
    snapshotRequests[requestID] = SnapshotRequest(
      phase: .snapshot(documentID: documentID, minimumRevision: revision),
      attempt: attempt,
      completion: completion
    )
    diagnostics.record(
      BridgeDiagnosticEvent(
        name: .snapshotRequested,
        requestID: requestID,
        revision: revision,
        category: "snapshot"
      )
    )
    scheduleTimeout(for: requestID)
    sendImmediately(
      .createSnapshot(
        requestID: requestID,
        documentID: documentID,
        revision: revision
      )
    ) { [weak self] error in
      guard let self, let error else { return }
      guard let request = self.snapshotRequests.removeValue(forKey: requestID) else { return }
      self.diagnostics.record(
        BridgeDiagnosticEvent(
          name: .snapshotFailed,
          requestID: requestID,
          revision: request.minimumRevision,
          category: self.diagnosticCategory(for: error)
        )
      )
      request.completion(.failure(error))
    }
  }

  private func sendCurrentDocument(completion: ((Error?) -> Void)? = nil) {
    guard let currentDocument else {
      completion?(nil)
      return
    }
    revisionTracker.beginDocument(
      documentID: currentDocument.documentID,
      revision: currentDocument.revision
    )
    sendImmediately(
      .loadDocument(
        requestID: UUID().uuidString,
        documentID: currentDocument.documentID,
        revision: currentDocument.revision,
        text: currentDocument.text
      )
    ) { error in
      completion?(error)
    }
  }

  private func completeReadyHandshake() {
    sendCurrentDocument { [weak self] error in
      guard let self else { return }
      if let error {
        self.becomeUnavailable(error)
        return
      }
      self.lifecycle = .ready
      self.diagnostics.record(
        BridgeDiagnosticEvent(
          name: .recoveryCompleted,
          requestID: nil,
          revision: self.currentDocument?.revision,
          category: "lifecycle"
        )
      )
      self.delegate?.editorBridgeDidBecomeReady(self)
    }
  }

  private func invalidateBridge(_ error: Error, category: String) {
    diagnostics.record(
      BridgeDiagnosticEvent(
        name: .invalidMessage,
        requestID: nil,
        revision: revisionTracker.latestRevision,
        category: category
      )
    )
    becomeUnavailable(error, recordsDiagnostic: false)
  }

  private func diagnosticCategory(for error: Error) -> String {
    guard let bridgeError = error as? EditorBridgeError else { return "navigation" }
    switch bridgeError {
    case .editorUnavailable:
      return "editor_unavailable"
    case .editorNotReady:
      return "editor_not_ready"
    case .invalidMessage:
      return "invalid_message"
    case .javaScriptEvaluation:
      return "javascript_evaluation"
    case .protocolMismatch:
      return "protocol_mismatch"
    case .remote(let code, _, _):
      return code.rawValue
    case .requestTimedOut:
      return "timeout"
    case .staleRevision:
      return "stale_revision"
    }
  }

  private func sendImmediately(
    _ command: BridgeNativeCommand,
    completion: ((Error?) -> Void)? = nil
  ) {
    do {
      try command.validate()
      let data = try JSONEncoder().encode(command)
      guard let serialized = String(data: data, encoding: .utf8) else {
        throw EditorBridgeError.invalidMessage
      }
      let literalData = try JSONEncoder().encode(serialized)
      guard let literal = String(data: literalData, encoding: .utf8) else {
        throw EditorBridgeError.invalidMessage
      }

      let script = "window.inkora.receive(\(literal))"
      if let evaluator {
        evaluator(script) { error in
          if let error {
            completion?(EditorBridgeError.javaScriptEvaluation(error.localizedDescription))
          } else {
            completion?(nil)
          }
        }
      } else if let webView {
        webView.evaluateJavaScript(script) { _, error in
          if let error {
            completion?(EditorBridgeError.javaScriptEvaluation(error.localizedDescription))
          } else {
            completion?(nil)
          }
        }
      } else {
        completion?(EditorBridgeError.javaScriptEvaluation("Web view is unavailable"))
      }
    } catch {
      completion?(error)
    }
  }
}
