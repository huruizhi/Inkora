#!/bin/zsh

set -euo pipefail

if (( $# != 1 )); then
  print -u2 "Usage: ui-launch-smoke.sh <Inkora.app>"
  exit 64
fi

app_bundle=$1
executable="$app_bundle/Contents/MacOS/Inkora"
artifact_root=${INKORA_ARTIFACTS_DIR:-"$PWD/artifacts"}
screenshot="$artifact_root/screenshots/launch.png"
mkdir -p "${screenshot:h}"

capture_screenshot() {
  if [[ ${INKORA_CAPTURE_SCREEN:-0} == 1 ]]; then
    screencapture -x "$screenshot" 2>/dev/null || true
  fi
}

if [[ ! -x $executable ]]; then
  print -u2 "Inkora executable is missing: $executable"
  exit 66
fi

"$executable" -ApplePersistenceIgnoreState YES --inkora-test-recovery-session "$(uuidgen)" &
app_pid=$!

cleanup() {
  if kill -0 "$app_pid" 2>/dev/null; then
    kill -TERM "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for _ in {1..30}; do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    print -u2 "Inkora exited during launch"
    capture_screenshot
    exit 1
  fi
  sleep 0.1
done

capture_screenshot
print -r -- "Inkora launch smoke passed (pid=$app_pid)"
