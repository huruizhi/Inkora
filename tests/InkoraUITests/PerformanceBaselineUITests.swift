import XCTest

// Cold-launch benchmark for the full app. Runs only via `make bench-full`
// (INKORA_PERF=1): it launches the real app repeatedly and therefore needs a
// logged-in, unlocked desktop — CI runner territory, never the agent desktop.
//
// Reported metrics:
//   * launch/first  — wall clock of the first launch in the run;
//   * launch/warm   — median wall clock of the subsequent launches;
//   * launch/rss    — median resident set of the app process tree (Inkora
//     plus its WebContent children) shortly after each warm launch.
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
      if let tree = try Self.applicationTreeResidentMegabytes() {
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

  /// Resident memory (MB) of the Inkora app process plus all descendants,
  /// sampled through `ps`; WKWebView's WebContent processes are children and
  /// are therefore included.
  private static func applicationTreeResidentMegabytes() throws -> Double? {
    let output = try runProcess("/bin/ps", arguments: ["-axo", "pid=,ppid=,rss=,ucomm="])
    var parents: [Int: Int] = [:]
    var names: [Int: String] = [:]
    var rss: [Int: Double] = [:]
    for line in output.split(separator: "\n") {
      let columns = line.split(whereSeparator: { $0 == " " }).map(String.init)
      guard columns.count >= 4,
        let pid = Int(columns[0]),
        let ppid = Int(columns[1]),
        let kilobytes = Double(columns[2])
      else { continue }
      parents[pid] = ppid
      names[pid] = columns[3]
      rss[pid] = kilobytes / 1024
    }
    guard
      let root = names.first(where: { $0.value == "Inkora" && parents[$0.key] != $0.key })?.key
    else {
      return nil
    }
    var total = 0.0
    var queue = [root]
    var visited: Set<Int> = [root]
    while let pid = queue.popLast() {
      total += rss[pid] ?? 0
      for (child, parent) in parents where parent == pid && visited.insert(child).inserted {
        queue.append(child)
      }
    }
    return total
  }

  private static func runProcess(_ path: String, arguments: [String]) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = arguments
    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { return "" }
    return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
  }
}
