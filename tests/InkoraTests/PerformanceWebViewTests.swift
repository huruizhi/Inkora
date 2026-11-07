import WebKit
import XCTest

// WKWebView document-load benchmarks (full profile, still hostless: the web
// view never appears on screen). Two paths are measured:
//   * webview-load/* — structured editor mount through real WebKit (resource
//     scheme handler + bridge handshake + markdown parse + ProseMirror mount
//     for the whole sample);
//   * bridge-snapshot-roundtrip/large — source-mode snapshot request over the
//     WKScriptMessage bridge (JSON encode/decode of ~1 MB text both ways).
final class PerformanceWebViewTests: XCTestCase {
  private let markdownType = "net.daringfireball.markdown"
  private let structuredMounted = 2_000_000_000

  override func setUpWithError() throws {
    try XCTSkipUnless(
      PerfEnvironment.isEnabled,
      "Performance benchmarks run only via `make bench-full` (INKORA_PERF=1)."
    )
  }

  @MainActor
  func testWebViewDocumentLoadBenchmarks() async throws {
    for size in ["medium", "large"] {
      let url = try PerfEnvironment.sampleURL(named: size)
      let text = try String(contentsOf: url, encoding: .utf8)

      // Warmup run absorbs the one-time WebContent process spawn.
      _ = try await loadEditor(sampleURL: url, text: text)

      var timings: [Double] = []
      for _ in 0..<3 {
        let start = ContinuousClock.now
        _ = try await loadEditor(sampleURL: url, text: text)
        timings.append(Self.elapsedMilliseconds(since: start))
      }
      PerfRecorder.shared.record(
        name: "webview-load/\(size)",
        unit: "ms",
        value: perfMedian(timings),
        cv: perfCoefficientOfVariation(timings)
      )
    }
    try PerfRecorder.shared.write(layer: "webview")
  }

  @MainActor
  func testBridgeSnapshotRoundTripForLargeSourceDocument() async throws {
    // The CRLF variant forces the source-mode runtime (EOL-003), whose
    // snapshot path exercises the bridge rather than the markdown serializer.
    let url = try PerfEnvironment.sampleURL(named: "large-crlf")
    let text = try String(contentsOf: url, encoding: .utf8)
    let (document, controller, webView) = try await loadEditor(sampleURL: url, text: text)

    // Dirty the document through the real input path: focus the textarea,
    // move the caret to the end, and type a suffix via execCommand so the
    // kernel sees a genuine input event.
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor');
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
        return document.execCommand('insertText', false, 'perf-append');
      })()
      """
    )
    try await waitUntilDocumentChange(document: document)

    // Warmup snapshots absorb one-time lazy work before timing.
    for _ in 0..<2 {
      _ = try await requestText(controller)
    }

    var timings: [Double] = []
    for _ in 0..<9 {
      let start = ContinuousClock.now
      let snapshot = try await requestText(controller)
      XCTAssertTrue(snapshot.hasSuffix("perf-append"), "snapshot tail: ...\(snapshot.suffix(32))")
      timings.append(Self.elapsedMilliseconds(since: start))
    }
    PerfRecorder.shared.record(
      name: "bridge-snapshot-roundtrip/large",
      unit: "ms",
      value: perfMedian(timings),
      cv: perfCoefficientOfVariation(timings)
    )
    try PerfRecorder.shared.write(layer: "webview")
  }

  @MainActor
  private func loadEditor(
    sampleURL: URL,
    text: String
  ) async throws -> (InkoraDocument, EditorViewController, WKWebView) {
    let document = try InkoraDocument(contentsOf: sampleURL, ofType: markdownType)
    let controller = EditorViewController(
      document: document,
      resourceBundle: Bundle(for: Self.self)
    )
    controller.loadViewIfNeeded()
    guard let webView = controller.view as? WKWebView else {
      throw NSError(
        domain: "inkora-perf", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "editor view is not a WKWebView"]
      )
    }
    // A textarea normalizes CRLF to LF in its value API, so readiness is
    // checked against the LF-normalized length; LF-only samples match as-is.
    let expectedLength = text.replacingOccurrences(of: "\r\n", with: "\n").utf16.count
    _ = try await waitForJavaScriptValue(in: webView, script: editorProbeScript) { value in
      guard let number = value as? Int else { return false }
      if number == self.structuredMounted {
        // Structured editor mounted; its text content differs from the
        // markdown source by markup, so element presence means ready.
        return true
      }
      return number == expectedLength
    }
    return (document, controller, webView)
  }

  private var editorProbeScript: String {
    """
    (() => {
      const editor = document.querySelector('#editor');
      if (!editor) return -1;
      if (editor instanceof HTMLTextAreaElement) return editor.value.length;
      return \(structuredMounted);
    })()
    """
  }

  @MainActor
  private func waitUntilDocumentChange(document: InkoraDocument) async throws {
    for _ in 0..<200 {
      if document.bridgeRevision > 0 {
        return
      }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
    throw NSError(
      domain: "inkora-perf", code: 2,
      userInfo: [NSLocalizedDescriptionKey: "editor never reported the edit"]
    )
  }

  @MainActor
  private func requestText(_ controller: EditorViewController) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      controller.requestText { result in
        switch result {
        case .success(let text):
          continuation.resume(returning: text)
        case .failure(let error):
          continuation.resume(throwing: error)
        }
      }
    }
  }

  @MainActor
  private func waitForJavaScriptValue(
    in webView: WKWebView,
    script: String,
    attempts: Int = 600,
    until predicate: (Any?) -> Bool
  ) async throws -> Any? {
    for _ in 0..<attempts {
      let value = try? await webView.evaluateJavaScript(script)
      if let value, predicate(value) {
        return value
      }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
    throw NSError(
      domain: "inkora-perf", code: 3,
      userInfo: [NSLocalizedDescriptionKey: "editor never became ready"]
    )
  }

  private static func elapsedMilliseconds(since start: ContinuousClock.Instant) -> Double {
    let components = (ContinuousClock.now - start).components
    return Double(components.seconds) * 1_000 + Double(components.attoseconds) / 1e15
  }
}
