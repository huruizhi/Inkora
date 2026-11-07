#!/bin/zsh
# Read-only checks; never change authorization or unlock the user's session.
set -euo pipefail
mode=${1:-desktop}
[[ $mode == desktop || $mode == xcuitest ]] || exit 64
shift || true
fail() { print -u2 -- "UI preflight: $*"; exit 78; }
user_id=$(id -u)
console_uid=$(stat -f %u /dev/console)
[[ $console_uid == $user_id ]] || fail "当前用户不是控制台用户。请登录 runner 账户桌面，并以该用户的 LaunchAgent 启动 runner。"
gui_state=$(launchctl print "gui/$user_id" 2>/dev/null) || fail "GUI 登录会话不存在。请登录桌面；不要用 LaunchDaemon 运行 UI runner。"
gui_audit=$(print -r -- "$gui_state" | sed -n 's/.*asid = \([0-9]*\).*/\1/p' | head -1)
process_audit=$(launchctl print "pid/$$" | sed -n 's/.*asid = \([0-9]*\).*/\1/p' | head -1)
[[ -n $gui_audit && $process_audit == $gui_audit ]] || fail "当前进程不属于桌面 audit session (gui=$gui_audit, process=$process_audit, pid=$$)。请以登录用户的 LaunchAgent 启动 runner。"
session=$(/usr/sbin/ioreg -n Root -d1)
[[ $session != *'"CGSSessionScreenIsLocked"=Yes'* ]] || fail "屏幕已锁定。请在本机解锁桌面后重试。"
[[ $session == *'"kCGSSessionOnConsoleKey"=Yes'* && $session == *'"kCGSessionLoginDoneKey"=Yes'* ]] || fail "没有已登录的活动控制台会话。请完成桌面登录后重试。"
if [[ $mode == xcuitest ]]; then
  automation=$(/usr/bin/automationmodetool)
  print -r -- "$automation"
  automation=${(L)automation}
  if [[ $automation != *'automation mode is enabled.'* && $automation != *'does not require user authentication'* ]]; then
    fail 'Automation Mode 无法无人值守启用。管理员在本机终端执行：sudo /usr/bin/automationmodetool enable-automationmode-without-authentication；随后运行 automationmodetool 确认不再需要认证。请保持桌面登录且解锁；不要重置或绕过 TCC。'
  fi
fi
print -r -- "UI preflight passed ($mode, uid=$user_id)"
if (( $# )); then
  exec /usr/bin/caffeinate -dimsu "$@"
fi
