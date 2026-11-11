#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
fixture=$(mktemp -d /tmp/inkora-update-tests.XXXXXX)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/Sources/UpdatePolicy" "$fixture/Tests/UpdatePolicyTests"
cp app/Sources/UpdatePolicy.swift app/Sources/UpdateService.swift app/Sources/TerminationReviewGate.swift app/Sources/ReleaseLookup.swift app/Sources/UpdateInstallationState.swift "$fixture/Sources/UpdatePolicy/"
for source in tests/InkoraTests/UpdatePolicyTests.swift tests/InkoraTests/UpdateServiceTests.swift tests/InkoraTests/TerminationReviewGateTests.swift tests/InkoraTests/ReleaseLookupTests.swift tests/InkoraTests/UpdateInstallationStateTests.swift; do
  { printf '@testable import UpdatePolicy\n'; cat "$source"; } > "$fixture/Tests/UpdatePolicyTests/$(basename "$source")"
done
cat > "$fixture/Package.swift" <<'PACKAGE'
// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "UpdatePolicy", platforms: [.macOS(.v14)], targets: [.target(name: "UpdatePolicy"), .testTarget(name: "UpdatePolicyTests", dependencies: ["UpdatePolicy"])])
PACKAGE
swift test --package-path "$fixture"
