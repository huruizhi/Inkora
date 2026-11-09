import Darwin
import Foundation

// 真实 descriptor 边界回归；不启动 App、不触碰容器或用户文件。
let scratch = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
    .appendingPathComponent("ink-prot-040-path-check-\(UUID().uuidString)", isDirectory: true)
let manager = FileManager.default
try manager.createDirectory(at: scratch, withIntermediateDirectories: true)
defer { try? manager.removeItem(at: scratch) }
let root = scratch.appendingPathComponent("root", isDirectory: true)
let real = root.appendingPathComponent("real", isDirectory: true)
let outside = scratch.appendingPathComponent("outside", isDirectory: true)
try manager.createDirectory(at: real, withIntermediateDirectories: true)
try manager.createDirectory(at: outside, withIntermediateDirectories: true)
let bytes = Data("isolated read fixture".utf8)
try bytes.write(to: real.appendingPathComponent("中 文%.png"))
try bytes.write(to: outside.appendingPathComponent("image.png"))
try bytes.write(to: root.appendingPathComponent("plain.png"))
try manager.createSymbolicLink(at: root.appendingPathComponent("link"), withDestinationURL: outside)
try manager.createSymbolicLink(at: root.appendingPathComponent("final.png"), withDestinationURL: outside.appendingPathComponent("image.png"))
var failures: [String] = []
var passed = 0
func check(_ ok: Bool, _ name: String, _ detail: String = "") {
    if ok { passed += 1; print("PASS \(name)") }
    else { failures.append(name); print("FAIL \(name) \(detail)") }
}
let encoded = try SafeRelativePath(encoded: "real/%E4%B8%AD%20%E6%96%87%25.png")
let good = readFileNoFollow(root: root, path: encoded)
check(good.status == .success && good.data == bytes, "unicode-percent-exact-bytes")
let middle = readRelativeNoFollow(root: root, components: ["link", "image.png"])
check(middle.status == .symlink && middle.errnoValue == ENOTDIR && middle.data == nil,
      "component-symlink-original-enotdir", "status=\(middle.status.rawValue) errno=\(middle.errnoValue ?? -1)")
let plain = readRelativeNoFollow(root: root, components: ["plain.png", "image.png"])
check(plain.status == .ioError && plain.errnoValue == ENOTDIR && plain.data == nil,
      "ordinary-nondirectory-not-symlink", "status=\(plain.status.rawValue) errno=\(plain.errnoValue ?? -1)")
let final = readRelativeNoFollow(root: root, components: ["final.png"])
check(final.status == .symlink && final.errnoValue == ELOOP && final.data == nil, "final-symlink-eloop")
let missing = readRelativeNoFollow(root: root, components: ["missing", "image.png"])
check(missing.status == .missing && missing.errnoValue == ENOENT, "missing-component-distinct")
let absent = readRelativeNoFollow(root: root, components: ["real", "absent.png"])
check(absent.status == .missing && absent.errnoValue == ENOENT, "missing-final-distinct")
let directory = readRelativeNoFollow(root: root, components: ["real"])
check(directory.status == .invalid && directory.data == nil, "final-directory-rejected")
let limited = readFileNoFollow(root: root, path: encoded, maximumBytes: 1)
check(limited.status == .invalid && limited.data == nil, "size-limit-before-data")
check((try Data(contentsOf: outside.appendingPathComponent("image.png"))) == bytes, "outside-fixture-unmodified")
if !failures.isEmpty { fputs("PATH CHECK FAILED: \(failures.joined(separator: ", "))\n", stderr); exit(1) }
print("PATH CHECK PASSED: \(passed) assertions; non-sandbox CLI, no OS-authorization claim")
