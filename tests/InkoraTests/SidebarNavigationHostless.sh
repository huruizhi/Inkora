#!/bin/zsh
# Actual production sources and XCTest, without launching an App or showing windows.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
out="$root/artifacts/INK-UX-132"
platform=$(xcrun --show-sdk-platform-path)
mkdir -p "$out/Resources.bundle/Contents/Resources"
[[ -f "$root/build/editor/index.html" ]] || { print -u2 '先运行离线 editor build'; exit 1; }
cat > "$out/Resources.bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.inkora.sidebar.hostless</string><key>CFBundlePackageType</key><string>BNDL</string></dict></plist>
PLIST
# This resource link belongs only to this test output directory.
[[ -e "$out/Resources.bundle/Contents/Resources/editor" ]] || ln -s "$root/build/editor" "$out/Resources.bundle/Contents/Resources/editor"
cat > "$out/Runner.swift" <<'SWIFT'
import XCTest
@main struct SidebarNavigationRunner {
  static func main() {
    let suite = XCTestSuite(forTestCaseClass: SidebarNavigationTests.self)
    suite.run()
    guard let run = suite.testRun, run.executionCount == 8, run.hasSucceeded else { exit(1) }
  }
}
SWIFT
sources=("$root"/app/Sources/*.swift)
sources=("${(@)sources:#*/AppDelegate.swift}")
xcrun swiftc -swift-version 6 -I "$platform/Developer/usr/lib" -L "$platform/Developer/usr/lib" \
  -F "$platform/Developer/Library/Frameworks" \
  -Xlinker -rpath -Xlinker "$platform/Developer/Library/Frameworks" \
  -Xlinker -rpath -Xlinker "$platform/Developer/usr/lib" \
  "${sources[@]}" "$root/tests/InkoraTests/SidebarNavigationTests.swift" "$out/Runner.swift" \
  -o "$out/navigation-tests" > "$out/compile.log" 2>&1
INKORA_SIDEBAR_RESOURCE_BUNDLE="$out/Resources.bundle" "$out/navigation-tests" > "$out/native-tests.log" 2>&1
cat "$out/native-tests.log"
