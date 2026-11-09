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
    // CRLF is visually editable in the source-authoritative runtime. Enter
    // source mode explicitly; line endings no longer select the runtime.
    let url = try PerfEnvironment.sampleURL(named: "large-crlf")
    let text = try String(contentsOf: url, encoding: .utf8)
    let (document, controller, webView) = try await loadEditor(sampleURL: url, text: text)

    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.editor-mode-source').click()")
    let sourceReady = try await webView.evaluateJavaScript(
      "document.querySelector('textarea#editor') !== null")
    XCTAssertEqual(sourceReady as? Bool, true)

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
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.source-draft-apply').click()")
    try await waitUntilDocumentChange(document: document)

    // Warmup snapshots absorb one-time lazy work before timing.
    for _ in 0..<2 {
      _ = try await requestText(controller)
    }

    var timings: [Double] = []
    for _ in 0..<9 {
      let start = ContinuousClock.now
      let snapshot = try await requestText(controller)
      XCTAssertEqual(snapshot, text + "perf-append")
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

  // Actual production DOM/buttons + Bridge, with no window or synthetic IME.
  // Input ends at an exact acknowledged snapshot; this is not visible paint.
  @MainActor
  func testProductionVisualWorkflowBenchmarks() async throws {
    try PerfRecorder.shared.recordEditorResources(in: Bundle(for: Self.self))
    for size in PerfEnvironment.productionSamples {
      let url = try PerfEnvironment.sampleURL(named: size)
      let text = try String(contentsOf: url, encoding: .utf8)
      try PerfRecorder.shared.recordInput(name: size, url: url)
      var timings: [String: [Double]] = [:]
      for iteration in -1..<3 {
        var start = ContinuousClock.now
        let (document, controller, webView) = try await loadEditor(sampleURL: url, text: text)
        webView.setFrameSize(NSSize(width: 900, height: 700))
        defer { document.close() }
        let loaded = try await requestText(controller)
        XCTAssertEqual(loaded, text)
        let mount = try await webView.evaluateJavaScript(
          "document.querySelector('#editor.ProseMirror') !== null")
        XCTAssertEqual(mount as? Bool, true, "Must measure the visual production runtime")
        if iteration >= 0 {
          timings["production-open-ack", default: []].append(Self.elapsedMilliseconds(since: start))
        }
        let titleValue = try await webView.evaluateJavaScript(
          "document.querySelector('#editor h1, #editor h2, #editor h3, #editor h4').textContent")
        let title = try XCTUnwrap(titleValue as? String)
        let titleRange = try XCTUnwrap(text.range(of: title))
        let expected = text.replacingCharacters(in: titleRange, with: "字" + title)
        start = ContinuousClock.now
        let inserted = try await webView.evaluateJavaScript(
          """
          (() => {
            const editor = document.querySelector('#editor.ProseMirror');
            const title = editor.querySelector('h1,h2,h3,h4');
            if (title.firstChild.nodeType !== Node.TEXT_NODE) throw Error('Expected plain fixture title');
            editor.focus();
            const range = document.createRange(); range.setStart(title.firstChild, 0); range.collapse(true);
            const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
            return document.execCommand('insertText', false, '字');
          })()
          """)
        XCTAssertEqual(inserted as? Bool, true)
        let edited = try await requestText(controller)
        let inputTime = Self.elapsedMilliseconds(since: start)
        XCTAssertEqual(edited, expected)
        XCTAssertGreaterThan(document.bridgeRevision, 0)
        if iteration >= 0 { timings["production-input-to-snapshot", default: []].append(inputTime) }

        for _ in 0..<5 {
          start = ContinuousClock.now
          let snapshot = try await requestText(controller)
          let elapsed = Self.elapsedMilliseconds(since: start)
          XCTAssertEqual(snapshot, expected)
          if iteration >= 0 {
            timings["production-snapshot-roundtrip", default: []].append(elapsed)
          }
        }
        let revision = document.bridgeRevision
        start = ContinuousClock.now
        let roundTrip = try await webView.evaluateJavaScript(
          """
          (() => {
            document.querySelector('.editor-mode-source').click();
            if (!document.querySelector('textarea#editor')) return false;
            document.querySelector('.source-draft-cancel').click();
            return !!document.querySelector('#editor.ProseMirror');
          })()
          """)
        let returned = try await requestText(controller)
        let modeTime = Self.elapsedMilliseconds(since: start)
        XCTAssertEqual(roundTrip as? Bool, true)
        XCTAssertEqual(returned, expected)
        XCTAssertEqual(document.bridgeRevision, revision)
        if iteration >= 0 {
          timings["production-source-no-op-roundtrip", default: []].append(modeTime)
        }
      }
      for (operation, samples) in timings {
        PerfRecorder.shared.recordSamples(name: "\(operation)/\(size)", milliseconds: samples)
      }
      try PerfRecorder.shared.write(layer: "webview")
    }
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
