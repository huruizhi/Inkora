import XCTest

// Cold-launch benchmark for the full app. Runs only via `make bench-full`
// (INKORA_PERF=1): it launches the real app repeatedly and therefore needs a
// logged-in, unlocked desktop — CI runner territory, never the agent desktop.
//
// Reported metrics:
//   * launch/first  — wall clock of the first launch in the run;
//   * launch/warm   — median wall clock of the subsequent launches;
//   * launch/rss    — median resident set of the Inkora app process (WebKit service
//     processes are not included) shortly after each warm launch.
// XCTApplicationLaunchMetric additionally records system launch timings in
// the .xcresult bundle.
final class PerformanceBaselineUITests: XCTestCase {
  private let launchCount = 5

  override func setUpWithError() throws {
    try XCTSkipUnless(
      PerfEnvironment.isEnabled,
      "Launch benchmarks run only via `make bench-full` (INKORA_PERF=1)."
    )
    continueAfterFailure = false
  }

  func testApplicationLaunchBenchmarks() throws {
    let app = XCUIApplication()
    var first: Double?
    var warm: [Double] = []
    var residentSizes: [Double] = []

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

      Thread.sleep(forTimeInterval: 0.5)
      if let tree = try Self.applicationResidentMegabytes() {
        if index > 0 {
          residentSizes.append(tree)
        }
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
    XCTAssertFalse(residentSizes.isEmpty, "App RSS samples are required")
    if !residentSizes.isEmpty {
      PerfRecorder.shared.record(
        name: "launch/rss",
        unit: "MB",
        value: perfMedian(residentSizes),
        cv: perfCoefficientOfVariation(residentSizes)
      )
    }
    try PerfRecorder.shared.write(layer: "launch")
  }

  /// System launch metric evidence recorded into the .xcresult bundle.
  func testApplicationLaunchMetric() throws {
    let app = XCUIApplication()
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

  /// App RSS only: WebKit services may be parented by launchd, so a process
  /// tree walk cannot reliably attribute their memory to this application.
  private static func applicationResidentMegabytes() throws -> Double? {
    let output = try runProcess("/bin/ps", arguments: ["-axo", "rss=,ucomm="])
    for line in output.split(separator: "\n") {
      let columns = line.split(whereSeparator: { $0 == " " }).map(String.init)
      if columns.count == 2, columns[1] == "Inkora", let kilobytes = Double(columns[0]) {
        return kilobytes / 1024
      }
    }
    return nil
  }

  private static func runProcess(_ path: String, arguments: [String]) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = arguments
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice
    try process.run()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { return "" }
    return String(data: data, encoding: .utf8) ?? ""
  }
}
