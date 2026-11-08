import XCTest

// Cold-launch benchmark for the full app. Runs only via `make bench-full`
// (INKORA_PERF=1): it launches the real app repeatedly and therefore needs a
// logged-in, unlocked desktop — CI runner territory, never the agent desktop.
//
// Reported metrics:
//   * launch/first  — wall clock of the first launch in the run;
//   * launch/warm   — median wall clock of the subsequent launches;
//   * launch/peak-physical-memory — XCTest physical memory peak of the app.
// XCTApplicationLaunchMetric additionally records system launch timings in
// the .xcresult bundle.
final class PerformanceBaselineUITests: AcceptanceTestCase {
  private let launchCount = 5

  override func setUpWithError() throws {
    try XCTSkipUnless(
      PerfEnvironment.isEnabled,
      "Launch benchmarks run only via `make bench-full` (INKORA_PERF=1)."
    )
    continueAfterFailure = false
  }

  @MainActor
  func testApplicationLaunchBenchmarks() throws {
    let app = diagnosticApplication()
    var first: Double?
    var warm: [Double] = []

    for index in 0..<launchCount {
      let start = ContinuousClock.now
      app.launch()
      XCTAssertTrue(app.waitForExistence(timeout: 10), "app did not launch")
      let elapsed = Self.elapsedMilliseconds(since: start)
      if index == 0 {
        first = elapsed
      } else {
        warm.append(elapsed)
      }

      app.terminate()
    }

    if let first {
      PerfRecorder.shared.record(name: "launch/first", unit: "ms", value: first)
    }
    PerfRecorder.shared.record(
      name: "launch/warm",
      unit: "ms",
      value: perfMedian(warm),
      cv: perfCoefficientOfVariation(warm)
    )
    add(try PerfRecorder.shared.attachment(layer: "launch"))
  }

  /// System launch metric evidence recorded into the .xcresult bundle.
  @MainActor
  func testApplicationLaunchMetric() throws {
    let app = diagnosticApplication()
    let options = XCTMeasureOptions()
    options.invocationOptions = []
    measure(metrics: [XCTApplicationLaunchMetric()], options: options) {
      app.launch()
      app.terminate()
    }
  }

  private static func elapsedMilliseconds(since start: ContinuousClock.Instant) -> Double {
    let components = (ContinuousClock.now - start).components
    return Double(components.seconds) * 1_000 + Double(components.attoseconds) / 1e15
  }

  /// XCTest samples the target process without spawning restricted tools.
  @MainActor
  func testApplicationMemoryMetric() {
    let app = diagnosticApplication()
    app.launch()
    XCTAssertTrue(app.waitForExistence(timeout: 10), "app did not launch")
    defer { app.terminate() }
    measure(metrics: [XCTMemoryMetric(application: app)]) {
      Thread.sleep(forTimeInterval: 0.5)
    }
  }
}
