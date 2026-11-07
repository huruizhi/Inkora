#!/bin/zsh
set -euo pipefail
repo_root=${0:A:h:h:h}
test_root=$(mktemp -d /private/tmp/inkora-ui-lock-test.XXXXXX)
export INKORA_UI_LOCK_TESTING=1
export INKORA_UI_LOCK_TEST_PATH="$test_root/lock"
export INKORA_UI_LOCK_TIMEOUT=8
lock=$INKORA_UI_LOCK_TEST_PATH
wrapper="$repo_root/scripts/ci/with-ui-lock.sh"
workers=()
cleanup() {
  local worker
  for worker in $workers; do kill -TERM "$worker" 2>/dev/null || true; done
  for worker in $workers; do wait "$worker" 2>/dev/null || true; done
  rm -rf "$test_root"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
wait_for() {
  local attempt
  for attempt in {1..100}; do
    [[ -f $1 ]] && return 0
    sleep 0.1
  done
  print -u2 "Timed out waiting for $1"
  return 1
}
"$wrapper" /bin/zsh -c 'grep -q "^pid=" "$1/owner"; grep -q "^branch=" "$1/owner"; grep -q "^time=" "$1/owner"' -- "$lock"
[[ ! -e $lock ]]
# A failing child must retain its exact exit code and release ownership.
result=0
"$wrapper" /bin/zsh -c 'exit 23' || result=$?
[[ $result == 23 && ! -e $lock ]]
# Manual directories (without owner metadata) are occupied, even if old.
mkdir "$lock"
result=0
INKORA_UI_LOCK_TIMEOUT=0 "$wrapper" touch "$test_root/unexpected" || result=$?
[[ $result == 75 && -d $lock && ! -e $test_root/unexpected ]]
# With the override unset, expose the default wait budget without waiting 25 min.
env -u INKORA_UI_LOCK_TIMEOUT "$wrapper" touch "$test_root/unexpected" > "$test_root/default-wait.log" 2>&1 &
waiting=$!
workers+=($waiting)
for attempt in {1..100}; do
  grep -q 'timeout=1500s' "$test_root/default-wait.log" && break
  sleep 0.1
done
grep -q 'timeout=1500s' "$test_root/default-wait.log"
kill -TERM "$waiting"
result=0
wait "$waiting" || result=$?
workers=()
[[ $result == 143 && -d $lock && ! -e $test_root/unexpected ]]
rmdir "$lock"
# Use a real exited PID rather than assuming an arbitrary PID is unused.
/bin/zsh -c 'exit 0' &
dead=$!
wait "$dead"
mkdir "$lock"
print -r -- "pid=$dead" > "$lock/owner"
"$wrapper" touch "$test_root/reclaimed"
[[ -f $test_root/reclaimed && ! -e $lock ]]
# A second contender cannot run until the first has finished.
"$wrapper" /bin/zsh -c 'touch "$1/first"; while [[ ! -f $1/release ]]; do sleep 0.1; done; touch "$1/done"' -- "$test_root" &
first=$!
workers+=($first)
wait_for "$test_root/first"
"$wrapper" /bin/zsh -c '[[ -f $1/done ]]; touch "$1/second"' -- "$test_root" &
second=$!
workers+=($second)
sleep 1
[[ ! -f $test_root/second ]]
touch "$test_root/release"
wait "$first"
wait "$second"
workers=()
[[ -f $test_root/second && ! -e $lock ]]
# Cancellation stops the command tree before making the UI available again.
for signal_name expected in TERM 143 INT 130; do
  rm -f "$test_root/child"
  "$wrapper" /bin/zsh -c 'print $$ > "$1/child"; sleep 30' -- "$test_root" &
  signalled=$!
  workers+=($signalled)
  wait_for "$test_root/child"
  command_pid=$(cat "$test_root/child")
  kill -"$signal_name" "$signalled"
  result=0
  wait "$signalled" || result=$?
  workers=()
  [[ $result == $expected && ! -e $lock ]]
  ! kill -0 "$command_pid" 2>/dev/null
done
print 'UI lock smoke passed: acquisition, failure, default budget, manual timeout, stale owner, waiting, TERM/INT'
