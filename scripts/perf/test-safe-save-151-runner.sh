#!/bin/zsh
# Exercise the real runner in a disposable fixture; no Xcode process is launched.
set -eu
source_root=${0:A:h:h:h}
scratch=$(mktemp -d "${TMPDIR:-/tmp}/inkora-151-runner.XXXXXX")
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/scripts/perf" "$scratch/editor/test/perf" \
  "$scratch/build/perf-samples" "$scratch/build/production-perf" "$scratch/bin"
cp "$source_root/scripts/perf/run-safe-save-151.sh" "$scratch/scripts/perf/"
cp "$source_root/editor/test/perf/production-mixed.md" "$scratch/editor/test/perf/"
print -r -- '{"metrics":{"old-large":true,"old-mixed":true}}' > "$scratch/old.json"
cat > "$scratch/bin/xcodebuild" <<'STUB'
#!/bin/zsh
set -eu
[[ ! -e "$INKORA_PERF_OUTPUT" ]] || { print -u2 'RED: stale canonical output'; exit 91; }
[[ "$INKORA_PRODUCTION_PERF_SIZES" == small ]]
[[ "$TEST_RUNNER_INKORA_PRODUCTION_PERF_SIZES" == small ]]
[[ "$TEST_RUNNER_INKORA_PERF_OUTPUT" == "$INKORA_PERF_OUTPUT" ]]
[[ "$INKORA_PERF_SAMPLES_DIR" == "$TEST_RUNNER_INKORA_PERF_SAMPLES_DIR" ]]
[[ -f "$INKORA_PERF_SAMPLES_DIR/mixed.md" ]]
archives=("${INKORA_PERF_OUTPUT:h}"/prior-safe-save-151.*/safe-save-151.json(N))
(( ${#archives} > 0 ))
found=0
for prior in "${archives[@]}"; do
  if cmp -s "$prior" "$PROBE_EXPECTED_PRIOR"; then found=1; fi
done
(( found == 1 )) || { print -u2 'RED: prior output not preserved'; exit 92; }
if [[ "$PROBE_FAIL" == 1 ]]; then exit 23; fi
print -r -- '{"metrics":{"small":true}}' > "$INKORA_PERF_OUTPUT"
STUB
chmod +x "$scratch/bin/xcodebuild"
export PATH="$scratch/bin:$PATH"
export INKORA_PRODUCTION_PERF_SIZES=small
export PROBE_EXPECTED_PRIOR="$scratch/old.json"
export PROBE_FAIL=0
cp "$scratch/old.json" "$scratch/build/production-perf/safe-save-151.json"
"$scratch/scripts/perf/run-safe-save-151.sh"
print 'PASS: subset invocation starts clean and archives prior full output'
cp "$scratch/build/production-perf/safe-save-151.json" "$scratch/subset.json"
export PROBE_EXPECTED_PRIOR="$scratch/subset.json"
export PROBE_FAIL=1
set +e
"$scratch/scripts/perf/run-safe-save-151.sh"
result=$?
set -e
[[ "$result" == 23 ]]
[[ ! -e "$scratch/build/production-perf/safe-save-151.json" ]]
print 'PASS: failed invocation preserves prior and leaves no stale canonical output'
