#!/bin/zsh
# One machine, one UI owner. Unknown/manual lock directories are never reclaimed.
set -eu
lock=/tmp/inkora-ui-tests.lock
# Only the isolated regression suite may select a private lock directory.
if [[ ${INKORA_UI_LOCK_TESTING:-0} == 1 ]]; then
  lock=${INKORA_UI_LOCK_TEST_PATH:?}
  [[ $lock == /private/tmp/inkora-ui-lock-test.*/lock ]] || exit 64
fi
timeout=${INKORA_UI_LOCK_TIMEOUT:-600}
[[ $timeout == <-> ]] && (( $# > 0 )) || { print -u2 'Usage: INKORA_UI_LOCK_TIMEOUT=<seconds> with-ui-lock.sh <command> [args...]'; exit 64; }
start=$SECONDS
owned=0
child=''
cleanup() {
  if (( owned )) && [[ -f $lock/owner ]] && grep -qx "pid=$$" "$lock/owner"; then
    rm -f "$lock/owner"
    rmdir "$lock" 2>/dev/null || true
  fi
}
terminate_tree() {
  local parent=$1 descendant
  for descendant in $(pgrep -P "$parent" || true); do
    terminate_tree "$descendant"
  done
  kill -TERM "$parent" 2>/dev/null || true
}
interrupted() {
  trap '' INT TERM
  if [[ -n $child ]]; then
    terminate_tree "$child"
    wait "$child" 2>/dev/null || true
  fi
  exit "$1"
}
trap cleanup EXIT
trap 'interrupted 130' INT
trap 'interrupted 143' TERM
while ! mkdir "$lock" 2>/dev/null; do
  # Serialize stale-owner inspection. Never recursively remove the lock: rmdir
  # cannot remove a newly acquired lock once another contender has written owner.
  if [[ -f $lock/owner ]] && mkdir "$lock/.reap" 2>/dev/null; then
    owner_pid=$(sed -n 's/^pid=\([0-9][0-9]*\)$/\1/p' "$lock/owner" 2>/dev/null || true)
    if [[ $owner_pid == <-> ]] && (( owner_pid > 1 )) && ! ps -p "$owner_pid" -o pid= >/dev/null; then
      print -u2 "Reclaiming stale UI lock (pid=$owner_pid)"
      rm -f "$lock/owner"
    fi
    rmdir "$lock/.reap" 2>/dev/null || true
    if rmdir "$lock" 2>/dev/null; then
      continue
    fi
  fi
  if (( SECONDS - start >= timeout )); then
    print -u2 "Timed out after ${timeout}s waiting for UI lock: $lock"
    [[ ! -f $lock/owner ]] || cat "$lock/owner" >&2
    exit 75
  fi
  if (( SECONDS == start )); then
    print -u2 "Waiting for UI lock: $lock"
  fi
  sleep 1
done
owned=1
{
  print -r -- "pid=$$"
  print -r -- "branch=$(git branch --show-current 2>/dev/null || print unknown)"
  print -r -- "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$lock/owner"
print -u2 "Acquired UI lock (pid=$$)"
"$@" &
child=$!
result=0
wait "$child" || result=$?
exit "$result"
