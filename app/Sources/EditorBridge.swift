import Foundation
import WebKit

@MainActor
protocol EditorBridgeDelegate: AnyObject {
  func editorBridgeDidBecomeReady(_ bridge: EditorBridge)
  func editorBridge(_ bridge: EditorBridge, didChangeText text: String)
}

enum EditorBridgeError: LocalizedError {
  case editorUnavailable
  case invalidMessage
  case javaScriptEvaluation(String)
  case requestFailed(String)
  case requestTimedOut

  var errorDescription: String? {
    switch self {
    case .editorUnavailable:
      "The editor is unavailable, so Inkora cannot save this document."
    case .invalidMessage:
      "The editor sent an invalid bridge message."
    case .javaScriptEvaluation(let message):
      "The editor command failed: \(message)"
    case .requestFailed(let message):
      "The editor request failed: \(message)"
    case .requestTimedOut:
      "The editor did not respond before the save request timed out."
    }
  }
}

@MainActor
final class EditorBridge: NSObject, WKScriptMessageHandler {
  private struct NativeCommand: Encodable {
    enum Kind: String, Encodable {
      case load
      case getText
    }

    let type: Kind
    let text: String?
    let requestID: String?
  }

  private struct EditorMessage: Decodable {
    enum Kind: String, Decodable {
      case ready
      case contentChanged
      case text
      case error
    }

    let type: Kind
    let text: String?
    let requestID: String?
    let message: String?
  }

  weak var delegate: EditorBridgeDelegate?
  private let requestTimeout: Duration
  private weak var webView: WKWebView?
  private var textRequests: [String: (Result<String, Error>) -> Void] = [:]

  init(delegate: EditorBridgeDelegate, requestTimeout: Duration = .seconds(5)) {
    self.delegate = delegate
    self.requestTimeout = requestTimeout
  }

  func attach(webView: WKWebView) {
    self.webView = webView
  }

  func load(text: String) {
    send(NativeCommand(type: .load, text: text, requestID: nil))
  }

  func requestText(completion: @escaping (Result<String, Error>) -> Void) {
    let requestID = UUID().uuidString
    textRequests[requestID] = completion
    let requestTimeout = self.requestTimeout
    Task { @MainActor [weak self] in
      do {
        try await Task.sleep(for: requestTimeout)
      } catch {
        return
      }
      guard let completion = self?.textRequests.removeValue(forKey: requestID) else {
        return
      }
      completion(.failure(EditorBridgeError.requestTimedOut))
    }
    send(NativeCommand(type: .getText, text: nil, requestID: requestID)) { [weak self] error in
      guard let self, let error else { return }
      self.textRequests.removeValue(forKey: requestID)?(.failure(error))
    }
  }

  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) {
    guard message.name == "inkora" else { return }
    guard
      let serialized = message.body as? String,
      let data = serialized.data(using: .utf8),
      let editorMessage = try? JSONDecoder().decode(EditorMessage.self, from: data)
    else {
      failPendingRequests(EditorBridgeError.invalidMessage)
      return
    }

    switch editorMessage.type {
    case .ready:
      delegate?.editorBridgeDidBecomeReady(self)
    case .contentChanged:
      if let text = editorMessage.text {
        delegate?.editorBridge(self, didChangeText: text)
      } else {
        failPendingRequests(EditorBridgeError.invalidMessage)
      }
    case .text:
      guard let requestID = editorMessage.requestID else {
        failPendingRequests(EditorBridgeError.invalidMessage)
        return
      }
      guard let completion = textRequests.removeValue(forKey: requestID) else {
        failPendingRequests(EditorBridgeError.invalidMessage)
        return
      }
      if let text = editorMessage.text {
        completion(.success(text))
      } else {
        completion(.failure(EditorBridgeError.invalidMessage))
      }
    case .error:
      let error = EditorBridgeError.requestFailed(editorMessage.message ?? "Unknown error")
      if let requestID = editorMessage.requestID {
        guard let completion = textRequests.removeValue(forKey: requestID) else {
          failPendingRequests(EditorBridgeError.invalidMessage)
          return
        }
        completion(.failure(error))
      } else {
        failPendingRequests(error)
      }
    }
  }

  func failPendingRequests(_ error: Error) {
    let completions = Array(textRequests.values)
    textRequests.removeAll()
    for completion in completions {
      completion(.failure(error))
    }
  }

  private func send(
    _ command: NativeCommand,
    completion: ((Error?) -> Void)? = nil
  ) {
    guard let webView else {
      completion?(EditorBridgeError.javaScriptEvaluation("Web view is unavailable"))
      return
    }

    do {
      let data = try JSONEncoder().encode(command)
      guard let serialized = String(data: data, encoding: .utf8) else {
        throw EditorBridgeError.invalidMessage
      }
      let literalData = try JSONEncoder().encode(serialized)
      guard let literal = String(data: literalData, encoding: .utf8) else {
        throw EditorBridgeError.invalidMessage
      }

      webView.evaluateJavaScript("window.inkora.receive(\(literal))") { _, error in
        if let error {
          completion?(EditorBridgeError.javaScriptEvaluation(error.localizedDescription))
        } else {
          completion?(nil)
        }
      }
    } catch {
      completion?(error)
    }
  }
}
