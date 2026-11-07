import Foundation
import XCTest

// Shared plumbing for performance benchmarks. All perf test classes skip
// unless INKORA_PERF=1, so `make test-native` stays fast and hermetic.

enum PerfEnvironment {
  static var isEnabled: Bool {
    value("INKORA_PERF") == "1"
  }

  static var profile: String {
    value("INKORA_PERF_PROFILE") ?? "light"
  }

  static var outputURL: URL? {
    value("INKORA_PERF_OUTPUT").map { URL(fileURLWithPath: $0) }
  }

  static var samplesDirectory: URL? {
    value("INKORA_PERF_SAMPLES_DIR").map {
      URL(fileURLWithPath: $0, isDirectory: true)
    }
  }

  static func sampleURL(named name: String) throws -> URL {
    guard let directory = samplesDirectory else {
      throw PerfEnvironmentError.missing("INKORA_PERF_SAMPLES_DIR")
    }
    let url = directory.appendingPathComponent("\(name).md")
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw PerfEnvironmentError.missingSample(url.path)
    }
    return url
  }

  /// Reads a variable either directly or through xcodebuild's TEST_RUNNER_
  /// forwarding prefix, depending on how the test host was launched.
  private static func value(_ name: String) -> String? {
    let environment = ProcessInfo.processInfo.environment
    return environment[name] ?? environment["TEST_RUNNER_\(name)"]
  }
}

enum PerfEnvironmentError: LocalizedError {
  case missing(String)
  case missingSample(String)

  var errorDescription: String? {
    switch self {
    case .missing(let name):
      "Performance test environment variable \(name) is not set; run via `make bench`."
    case .missingSample(let path):
      "Performance sample not found at \(path); run `make perf-samples` first."
    }
  }
}

final class PerfRecorder: @unchecked Sendable {
  static let shared = PerfRecorder()
  private let lock = NSLock()
  private var metrics: [String: [String: Any]] = [:]
  func record(name: String, unit: String, value: Double, cv: Double? = nil) {
    lock.withLock {
      metrics[name] = [
        "unit": unit,
        "value": (value * 10_000).rounded() / 10_000,
      ]
      if let cv {
        metrics[name]?["cv"] = (cv * 10_000).rounded() / 10_000
      }
    }
  }

  func attachment(layer: String) throws -> XCTAttachment {
    let payload: [String: Any] = lock.withLock {
      ["schema": 1, "layer": layer, "profile": PerfEnvironment.profile, "metrics": metrics]
    }
    let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
    let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
    attachment.name = "inkora-launch.json"
    attachment.lifetime = .keepAlways
    return attachment
  }

  /// Merges recorded metrics into the results JSON, preserving metrics from
  /// other test classes that share the same output file.
  func write(layer: String) throws {
    guard let url = PerfEnvironment.outputURL else {
      throw PerfEnvironmentError.missing("INKORA_PERF_OUTPUT")
    }
    let merged = lock.withLock { merge(into: url, layer: layer) }
    let count = (merged["metrics"] as? [String: Any])?.count ?? 0
    try JSONSerialization.data(withJSONObject: merged, options: [.prettyPrinted, .sortedKeys])
      .write(to: url)
    print("[perf] wrote \(count) \(layer) metrics to \(url.path)")
  }

  private func merge(into url: URL, layer: String) -> [String: Any] {
    var existing: [String: Any] = [:]
    if let data = try? Data(contentsOf: url),
      let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    {
      existing = decoded
    }
    var combined = (existing["metrics"] as? [String: Any]) ?? [:]
    for (name, metric) in metrics {
      combined[name] = metric
    }
    existing["schema"] = 1
    existing["layer"] = layer
    existing["profile"] = PerfEnvironment.profile
    existing["metrics"] = combined
    return existing
  }
}

func perfMedian(_ values: [Double]) -> Double {
  let sorted = values.sorted()
  let middle = sorted.count / 2
  if sorted.count % 2 == 1 {
    return sorted[middle]
  }
  return (sorted[middle - 1] + sorted[middle]) / 2
}

func perfCoefficientOfVariation(_ values: [Double]) -> Double {
  guard !values.isEmpty else { return 0 }
  let mean = values.reduce(0, +) / Double(values.count)
  guard mean > 0 else { return 0 }
  let variance = values.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(values.count)
  return (variance.squareRoot()) / mean
}

/// Resident memory of the current process in bytes (mach_task_basic_info).
func perfResidentBytes() -> Int64? {
  var info = mach_task_basic_info_data_t()
  var count = mach_msg_type_number_t(
    MemoryLayout<mach_task_basic_info_data_t>.size / MemoryLayout<natural_t>.size)
  let result = withUnsafeMutablePointer(to: &info) { pointer in
    pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { integers in
      task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), integers, &count)
    }
  }
  guard result == KERN_SUCCESS else { return nil }
  return Int64(info.resident_size)
}
