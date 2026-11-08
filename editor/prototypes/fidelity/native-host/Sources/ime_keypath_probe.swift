// INK-PROT-017: constrained CoreGraphics virtual-key probe for system IME acceptance.
// It never requests TCC access and never injects Unicode strings or clipboard content.
import AppKit
import Carbon.HIToolbox
import CoreGraphics
import Foundation

private let fidelityBundleID = "com.huruizhi.Inkora.FidelityPrototype"

private struct KeyStroke {
  let label: String
  let virtualKey: CGKeyCode
}

private let fixedSequences: [String: [KeyStroke]] = [
  "zhongwen": [
    KeyStroke(label: "z", virtualKey: 6),
    KeyStroke(label: "h", virtualKey: 4),
    KeyStroke(label: "o", virtualKey: 31),
    KeyStroke(label: "n", virtualKey: 45),
    KeyStroke(label: "g", virtualKey: 5),
    KeyStroke(label: "w", virtualKey: 13),
    KeyStroke(label: "e", virtualKey: 14),
    KeyStroke(label: "n", virtualKey: 45),
  ],
  "space": [KeyStroke(label: "space", virtualKey: 49)],
  "escape": [KeyStroke(label: "escape", virtualKey: 53)],
]

private func frontmostBundleID() -> String? {
  NSWorkspace.shared.frontmostApplication?.bundleIdentifier
}

private func currentInputSourceID() -> String? {
  guard let unmanagedSource = TISCopyCurrentKeyboardInputSource() else { return nil }
  let source = unmanagedSource.takeRetainedValue()
  guard let rawProperty = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) else {
    return nil
  }
  return Unmanaged<CFString>.fromOpaque(rawProperty).takeUnretainedValue() as String
}

private func environmentRecord(preflight: Bool) -> [String: Any] {
  let info = ProcessInfo.processInfo
  return [
    "architecture": SystemInfo.machineArchitecture,
    "bundle_id": Bundle.main.bundleIdentifier ?? NSNull(),
    "executable_path": info.arguments.first ?? NSNull(),
    "frontmost_bundle_id": frontmostBundleID() ?? NSNull(),
    "input_source_id": currentInputSourceID() ?? NSNull(),
    "os_version": info.operatingSystemVersionString,
    "pid": info.processIdentifier,
    "post_event_access": preflight,
    "process_name": info.processName,
  ]
}

private enum SystemInfo {
  static var machineArchitecture: String {
    var systemInfo = utsname()
    uname(&systemInfo)
    return withUnsafePointer(to: &systemInfo.machine) {
      $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
    }
  }
}

private func emit(_ value: [String: Any]) {
  guard JSONSerialization.isValidJSONObject(value),
    let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
    let line = String(data: data, encoding: .utf8)
  else {
    fputs("probe: failed to encode JSON\n", stderr)
    exit(70)
  }
  print(line)
  fflush(stdout)
}

private func usage() -> Never {
  fputs(
    "usage: ime-keypath-probe preflight | post --expected-bundle "
      + "\(fidelityBundleID) --sequence zhongwen|space|escape\n",
    stderr
  )
  exit(64)
}

private func post(sequenceName: String, expectedBundleID: String) -> Never {
  let access = CGPreflightPostEventAccess()
  guard access else {
    emit(["event": "post-refused", "reason": "preflight-false"])
    exit(77)
  }
  guard expectedBundleID == fidelityBundleID else {
    emit(["event": "post-refused", "reason": "unexpected-target"])
    exit(64)
  }
  guard let sequence = fixedSequences[sequenceName] else { usage() }
  guard frontmostBundleID() == expectedBundleID else {
    emit([
      "event": "post-refused",
      "frontmost_bundle_id": frontmostBundleID() ?? NSNull(),
      "reason": "target-not-frontmost",
    ])
    exit(78)
  }
  guard let source = CGEventSource(stateID: .hidSystemState) else {
    emit(["event": "post-refused", "reason": "event-source-unavailable"])
    exit(69)
  }

  var delivered: [String] = []
  for key in sequence {
    guard frontmostBundleID() == expectedBundleID else {
      emit([
        "delivered": delivered,
        "event": "focus-lost",
        "frontmost_bundle_id": frontmostBundleID() ?? NSNull(),
        "stopped_before": key.label,
      ])
      exit(78)
    }
    guard
      let down = CGEvent(keyboardEventSource: source, virtualKey: key.virtualKey, keyDown: true),
      let up = CGEvent(keyboardEventSource: source, virtualKey: key.virtualKey, keyDown: false)
    else {
      emit(["delivered": delivered, "event": "post-failed", "key": key.label])
      exit(69)
    }
    down.post(tap: .cghidEventTap)
    usleep(30_000)
    up.post(tap: .cghidEventTap)
    delivered.append(key.label)
    usleep(80_000)
  }
  emit([
    "delivered": delivered,
    "event": "post-complete",
    "expected_bundle_id": expectedBundleID,
    "input_source_id": currentInputSourceID() ?? NSNull(),
    "sequence": sequenceName,
    "transport": "CGEvent virtual key down/up via cghidEventTap",
  ])
  exit(0)
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first else { usage() }

switch command {
case "preflight":
  guard arguments.count == 1 else { usage() }
  let access = CGPreflightPostEventAccess()
  emit(["event": "preflight", "environment": environmentRecord(preflight: access)])
  exit(access ? 0 : 77)
case "post":
  guard arguments.count == 5,
    arguments[1] == "--expected-bundle",
    arguments[3] == "--sequence"
  else { usage() }
  post(sequenceName: arguments[4], expectedBundleID: arguments[2])
default:
  usage()
}
