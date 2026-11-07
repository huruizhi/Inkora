import XCTest

// Hostless document benchmarks: open (file read + UTF-8 decode + BOM policy)
// and save (encode + atomic write), plus the resident-memory delta of a
// loaded large document. Runs only under `make bench` (INKORA_PERF=1).
final class PerformanceBaselineTests: XCTestCase {
  private let markdownType = "net.daringfireball.markdown"
  private let samples = ["small", "medium", "large"]
  private let saveSamples = ["medium", "large"]

  override func setUpWithError() throws {
    try XCTSkipUnless(
      PerfEnvironment.isEnabled,
      "Performance benchmarks run only via `make bench` (INKORA_PERF=1)."
    )
  }

  @MainActor
  func testDocumentOpenBenchmarks() throws {
    for size in samples {
      let url = try PerfEnvironment.sampleURL(named: size)
      let timings = try openTimings(url: url, warmup: 2, samples: 15)
      PerfRecorder.shared.record(
        name: "document-open/\(size)",
        unit: "ms",
        value: perfMedian(timings),
        cv: perfCoefficientOfVariation(timings)
      )
    }
    try PerfRecorder.shared.write(layer: "native")
  }

  @MainActor
  func testDocumentSaveBenchmarks() throws {
    for size in saveSamples {
      let url = try PerfEnvironment.sampleURL(named: size)
      let document = try InkoraDocument(contentsOf: url, ofType: markdownType)
      let target = FileManager.default.temporaryDirectory
        .appendingPathComponent("inkora-perf-save-\(size)-\(UUID().uuidString).md")
      defer { try? FileManager.default.removeItem(at: target) }

      let timings = try saveTimings(document: document, target: target, warmup: 2, samples: 15)
      PerfRecorder.shared.record(
        name: "document-save/\(size)",
        unit: "ms",
        value: perfMedian(timings),
        cv: perfCoefficientOfVariation(timings)
      )
    }
    try PerfRecorder.shared.write(layer: "native")
  }

  @MainActor
  func testDocumentMemoryFootprintForLargeSample() throws {
    let url = try PerfEnvironment.sampleURL(named: "large")
    var deltas: [Double] = []
    for _ in 0..<5 {
      let before = perfResidentBytes() ?? 0
      // The document stays alive while sampling so the delta reflects the
      // retained text storage rather than transient allocator churn.
      let document = try InkoraDocument(contentsOf: url, ofType: markdownType)
      let during = perfResidentBytes() ?? 0
      deltas.append(Double(during - before) / 1024 / 1024)
      _ = document
    }
    PerfRecorder.shared.record(
      name: "document-memory/large",
      unit: "MB",
      value: perfMedian(deltas),
      cv: perfCoefficientOfVariation(deltas)
    )
    try PerfRecorder.shared.write(layer: "native")
  }

  /// XCTMetric evidence for the large sample: clock and memory measurements
  /// land in the .xcresult bundle; JSON numbers come from the samplers above.
  /// XCTest permits a single measure block per test method, hence two tests.
  @MainActor
  func testXCTClockAndMemoryMetricsForLargeDocumentOpen() throws {
    let url = try PerfEnvironment.sampleURL(named: "large")
    measure(metrics: [XCTClockMetric(), XCTMemoryMetric()]) {
      MainActor.assumeIsolated {
        _ = try? InkoraDocument(contentsOf: url, ofType: markdownType)
      }
    }
  }

  @MainActor
  func testXCTClockMetricForLargeDocumentSave() throws {
    let url = try PerfEnvironment.sampleURL(named: "large")
    let target = FileManager.default.temporaryDirectory
      .appendingPathComponent("inkora-perf-xctmetric-\(UUID().uuidString).md")
    defer { try? FileManager.default.removeItem(at: target) }
    let document = try InkoraDocument(contentsOf: url, ofType: markdownType)
    measure(metrics: [XCTClockMetric()]) {
      MainActor.assumeIsolated {
        try? document.write(
          to: target,
          ofType: markdownType,
          for: .saveOperation,
          originalContentsURL: nil
        )
      }
    }
  }

  @MainActor
  private func openTimings(url: URL, warmup: Int, samples: Int) throws -> [Double] {
    for _ in 0..<warmup {
      _ = try InkoraDocument(contentsOf: url, ofType: markdownType)
    }
    var timings: [Double] = []
    for _ in 0..<samples {
      let start = ContinuousClock.now
      _ = try InkoraDocument(contentsOf: url, ofType: markdownType)
      timings.append(elapsedMilliseconds(since: start))
    }
    return timings
  }

  @MainActor
  private func saveTimings(
    document: InkoraDocument,
    target: URL,
    warmup: Int,
    samples: Int
  ) throws -> [Double] {
    for _ in 0..<warmup {
      try document.write(
        to: target,
        ofType: markdownType,
        for: .saveOperation,
        originalContentsURL: nil
      )
    }
    var timings: [Double] = []
    for _ in 0..<samples {
      let start = ContinuousClock.now
      try document.write(
        to: target,
        ofType: markdownType,
        for: .saveOperation,
        originalContentsURL: nil
      )
      timings.append(elapsedMilliseconds(since: start))
    }
    return timings
  }

  private func elapsedMilliseconds(since start: ContinuousClock.Instant) -> Double {
    let elapsed = ContinuousClock.now - start
    let components = elapsed.components
    return Double(components.seconds) * 1_000 + Double(components.attoseconds) / 1e15
  }
}
