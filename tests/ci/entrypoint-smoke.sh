#!/bin/zsh

set -euo pipefail

repo_root=${0:A:h:h:h}
artifact_root=${INKORA_ARTIFACTS_DIR:-"$repo_root/artifacts"}
smoke_root="$artifact_root/smoke"
capture="$repo_root/scripts/ci/run-and-capture.sh"
mkdir -p "$smoke_root"

INKORA_ARTIFACTS_DIR="$smoke_root" "$capture" success-smoke \
  /bin/zsh -c 'print -r -- success-output'
grep -q "success-output" "$smoke_root/logs/success-smoke.log"

snapshot_source="$smoke_root/source.md"
print -r -- "# Expected failure snapshot" > "$snapshot_source"
if INKORA_ARTIFACTS_DIR="$smoke_root" \
  INKORA_MARKDOWN_SNAPSHOT_SOURCE="$snapshot_source" \
  "$capture" failure-smoke /bin/zsh -c 'print -r -- failure-output; exit 23'; then
  print -u2 "Expected failure-smoke to fail"
  exit 1
fi

[[ $(<"$smoke_root/failures/failure-smoke.status") == 23 ]]
grep -q "failure-output" "$smoke_root/logs/failure-smoke.log"
grep -q "Exit status: 23" "$smoke_root/failures/failure-smoke.md"
cmp "$snapshot_source" "$smoke_root/markdown-snapshots/failure-smoke.md"
