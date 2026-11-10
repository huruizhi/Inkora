#!/bin/zsh
# Compile the actual A-owned sources in a dependency-free, macOS 14 Swift package.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
package="$root/build/sidebar-tests"
mkdir -p "$package/Sources" "$root/artifacts/logs"
cat > "$package/Package.swift" <<'SWIFT'
// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "SidebarHostless", platforms: [.macOS(.v14)], targets: [
  .testTarget(name: "SidebarHostless", path: "Sources")
])
SWIFT
cp "$root/app/Sources/SidebarCatalog.swift" "$root/app/Sources/SidebarWorkspaceBridge.swift" \
  "$root/tests/InkoraTests/SidebarCatalogTests.swift" \
  "$root/tests/InkoraTests/SidebarWorkspaceBridgeTests.swift" "$package/Sources/"
cat > "$package/Sources/BridgeConstants.swift" <<'SWIFT'
// External constants only; Catalog and Bridge implementations compile unchanged.
enum EditorResourceSchemeHandler { static let scheme = "inkora-editor" }
enum BridgeProtocolV1 { static let maxSafeRevision = 9_007_199_254_740_991 }
SWIFT
swift test --package-path "$package"
