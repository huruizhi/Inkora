#!/bin/zsh
# Opt-in hostless supplement; run after the unchanged production baselines.
set -eu
root=${0:A:h:h:h}
cd "$root"
cp editor/test/perf/production-mixed.md build/perf-samples/mixed.md
export INKORA_PERF=1
export INKORA_PERF_SAMPLES_DIR="$root/build/perf-samples"
export INKORA_PERF_OUTPUT="$root/build/production-perf/safe-save-151.json"
export INKORA_PRODUCTION_PERF_SIZES=${INKORA_PRODUCTION_PERF_SIZES:-small,medium,large,large-crlf,mixed}
export TEST_RUNNER_INKORA_PERF=1
export TEST_RUNNER_INKORA_PERF_SAMPLES_DIR="$INKORA_PERF_SAMPLES_DIR"
export TEST_RUNNER_INKORA_PERF_OUTPUT="$INKORA_PERF_OUTPUT"
export TEST_RUNNER_INKORA_PRODUCTION_PERF_SIZES="$INKORA_PRODUCTION_PERF_SIZES"
# Unique result path retains previous failed attempts and their raw distributions.
xcodebuild -quiet -project Inkora.xcodeproj -scheme Inkora \
  -destination 'platform=macOS' -derivedDataPath "$root/build/DerivedData" \
  -resultBundlePath "$root/artifacts/test-results/safe-save-151-$(date +%s).xcresult" \
  -only-testing:InkoraTests/PerformanceWebViewTests/testProductionSafeSaveBenchmarks test
