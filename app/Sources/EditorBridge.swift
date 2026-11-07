import Foundation
import WebKit

@MainActor
protocol EditorBridgeDelegate: AnyObject {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge)
  func editorBridge(_ bridge: EditorBridge, didChangeState state: BridgeEditorState)
  func editorBridge(_ bridge: EditorBridge, didBecomeUnavailable error: Error)
}

extension EditorBridgeDelegate {
  func editorBridge(_ bridge: EditorBridge, didBecomeUnavailable error: Error) {}
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
    let completion: (Result<String, Error>) -> Void
  }

  weak var delegate: EditorBridgeDelegate?
  private let requestTimeout: Duration
  private let evaluator: JavaScriptEvaluator?
  private weak var webView: WKWebView?
  private var lifecycle = Lifecycle.loading
  private var currentDocument: LoadedDocument?
  private var revisionTracker = BridgeRevisionTracker()
  private var snapshotRequests: [String: SnapshotRequest] = [:]
  private let maximumSnapshotAttempts = 3

  init(
    delegate: EditorBridgeDelegate,
    requestTimeout: Duration = .seconds(5),
    evaluator: JavaScriptEvaluator? = nil
  ) {
    self.delegate = delegate
    self.requestTimeout = requestTimeout
    self.evaluator = evaluator
  }

  func attach(webView: WKWebView) {
    self.webView = webView
    lifecycle = .loading
  }

  func prepareForNavigation() {
    lifecycle = .loading
    failPendingRequests(EditorBridgeError.editorNotReady)
  }

  func loadDocument(documentID: String, revision: Int, text: String) {
    revisionTracker.beginDocument(documentID: documentID, revision: revision)
    currentDocument = LoadedDocument(documentID: documentID, revision: revision, text: text)
    if lifecycle == .ready {
      sendCurrentDocument()
    }
  }

  func requestSnapshot(completion: @escaping (Result<String, Error>) -> Void) {
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
      failPendingRequests(EditorBridgeError.invalidMessage)
      return
    }

    do {
      try editorEvent.validate()
    } catch BridgeProtocolValidationError.unsupportedVersion {
      failPendingRequests(EditorBridgeError.protocolMismatch)
      return
    } catch {
      failPendingRequests(EditorBridgeError.invalidMessage)
      return
    }

    receiveEditorEvent(editorEvent)
  }

  func receiveEditorEvent(_ editorEvent: BridgeEditorEvent) {
    switch editorEvent.type {
    case .ready:
      lifecycle = .ready
      sendCurrentDocument()
      delegate?.editorBridgeDidBecomeReady(self)
    case .stateChanged:
      handleStateChanged(editorEvent)
    case .snapshotReady:
      handleSnapshotReady(editorEvent)
    case .editorError:
      handleEditorError(editorEvent)
    }
  }

  func failPendingRequests(_ error: Error) {
    let requests = Array(snapshotRequests.values)
    snapshotRequests.removeAll()
    for request in requests {
      request.completion(.failure(error))
    }
  }

  func becomeUnavailable(_ error: Error) {
    lifecycle = .unavailable
    failPendingRequests(error)
    delegate?.editorBridge(self, didBecomeUnavailable: error)
  }

  private func handleStateChanged(_ event: BridgeEditorEvent) {
    guard let state = event.state else { return }
    if revisionTracker.accept(state) {
      delegate?.editorBridge(self, didChangeState: state)
    }
  }

  private func handleSnapshotReady(_ event: BridgeEditorEvent) {
    guard let requestID = event.requestID else {
      failPendingRequests(EditorBridgeError.invalidMessage)
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
      request.completion(.failure(EditorBridgeError.staleRevision))
      return
    }
    revisionTracker.observeSnapshot(documentID: documentID, revision: revision)
    request.completion(.success(text))
  }

  private func handleEditorError(_ event: BridgeEditorEvent) {
    guard let code = event.code, let action = event.action, let message = event.message else {
      failPendingRequests(EditorBridgeError.invalidMessage)
      return
    }
    let error = EditorBridgeError.remote(code, action, message)
    if let requestID = event.requestID {
      guard let request = snapshotRequests.removeValue(forKey: requestID) else { return }
      if action == .retry && request.attempt < maximumSnapshotAttempts {
        beginSnapshotBarrier(completion: request.completion, attempt: request.attempt + 1)
      } else {
        request.completion(.failure(error))
      }
    } else {
      failPendingRequests(error)
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
      request.completion(.failure(EditorBridgeError.requestTimedOut))
    }
  }

  private func beginSnapshotBarrier(
    completion: @escaping (Result<String, Error>) -> Void,
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
    scheduleTimeout(for: requestID)
    sendImmediately(
      .createSnapshot(
        requestID: requestID,
        documentID: documentID,
        revision: revision
      )
    ) { [weak self] error in
      guard let self, let error else { return }
      self.snapshotRequests.removeValue(forKey: requestID)?.completion(.failure(error))
    }
  }

  private func sendCurrentDocument() {
    guard let currentDocument else { return }
    sendImmediately(
      .loadDocument(
        requestID: UUID().uuidString,
        documentID: currentDocument.documentID,
        revision: currentDocument.revision,
        text: currentDocument.text
      )
    )
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
        evaluator(script, { error in completion?(error) })
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
