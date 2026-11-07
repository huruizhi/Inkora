#!/bin/zsh

set -u

if (( $# < 2 )); then
  print -u2 "Usage: run-and-capture.sh <label> <command> [args...]"
  exit 64
fi

label=$1
shift
artifact_root=${INKORA_ARTIFACTS_DIR:-"$PWD/artifacts"}
log_dir="$artifact_root/logs"
failure_dir="$artifact_root/failures"
snapshot_dir="$artifact_root/markdown-snapshots"
mkdir -p "$log_dir" "$failure_dir" "$snapshot_dir"

log_file="$log_dir/$label.log"
status_file="$failure_dir/$label.status"
summary_file="$failure_dir/$label.md"

set +e
"$@" 2>&1 | tee "$log_file"
exit_code=$pipestatus[1]
set -e

if (( exit_code == 0 )); then
  rm -f -- "$status_file" "$summary_file"
  exit 0
fi

print -r -- "$exit_code" > "$status_file"
{
  print -r -- "# Failure: $label"
  print -r -- ""
  print -r -- "- Exit status: $exit_code"
  print -r -- "- Log: logs/$label.log"
} > "$summary_file"

if [[ -n ${INKORA_MARKDOWN_SNAPSHOT_SOURCE:-} && -f $INKORA_MARKDOWN_SNAPSHOT_SOURCE ]]; then
  cp -- "$INKORA_MARKDOWN_SNAPSHOT_SOURCE" "$snapshot_dir/$label.md"
fi

result_bundles=("$artifact_root"/test-results/*.xcresult(N.om))
if (( ${#result_bundles} > 0 )); then
  result_summary="$failure_dir/$label-xcresult.json"
  xcrun xcresulttool get test-results summary \
    --path "$result_bundles[1]" --compact | tee "$result_summary" || true
fi

exit "$exit_code"
