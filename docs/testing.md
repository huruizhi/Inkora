# 构建、测试与 CI 入口

本地与 GitHub Actions 使用同一组 Make 目标。测试本身不得读取用户目录、个人配置或公网；`make setup` 仅负责安装和解析开发依赖。

`make setup` 将固定版本的 pnpm 安装到被忽略的 `.tools/`，避免 Homebrew 滚动版本或 Intel/Apple Silicon 架构差异改变构建结果。

## 命令

| 命令 | 作用 |
| --- | --- |
| `make test-editor` | Bridge 以外的编辑器模型与行为测试 |
| `make test-bridge` | TypeScript + Swift Bridge v1 contract tests |
| `make test-native` | 全部 XCTest 单元与 WKWebView 集成测试 |
| `make test-document-open-ui` | 文档打开 XCUITest，需已登录且解锁的桌面和 Automation Mode |
| `make test-ui-release` | Release 离线资源检查与 App 启动烟测 |
| `make test-ui` | 无辅助功能权限依赖的 Debug App 启动烟测；CI 通过 `INKORA_CAPTURE_SCREEN=1` 尽力截图 |
| `make test-ci` | 验证命令包装器、快照归档及 UI 锁的获取/排队/超时/回收/退出清理 |
| `make test-all` / `make test` | 按层运行全部测试 |
| `make build-release` | 构建 Release App，不配置正式签名凭据 |

## 固定产物目录

所有诊断产物位于被 Git 忽略的 `artifacts/`：

- `logs/`：每个入口的完整 stdout/stderr；
- `failures/`：失败状态码与 Markdown 摘要；
- `test-results/`：XCTest `.xcresult`，包含测试日志和 attachments；
- `screenshots/`：UI launch smoke 在系统允许时生成的 PNG；
- `markdown-snapshots/`：失败测试通过 `INKORA_MARKDOWN_SNAPSHOT_SOURCE` 提供的 Markdown 原文。

CI 无论成功失败都会上传整个目录，保留 14 天。正式签名、公证和凭据不属于本流程。

## 本机 UI 互斥

CI 和本地 agent 共用 `scripts/ci/with-ui-lock.sh`，生产锁路径固定为
`/tmp/inkora-ui-tests.lock`。`test-document-open-ui`、`test-ui`、`test-ui-release`
及 `run` 的屏幕操作均持锁；构建和 hostless 单元测试不占用屏幕锁。
`make run` 以前台子进程直接运行 App，直到该 App 退出才释放锁。
直接执行 XCUITest 或启动 App 时也必须使用包装器，避免绕过队列：

```sh
scripts/ci/with-ui-lock.sh scripts/ci/ui-preflight.sh xcuitest xcodebuild ...
INKORA_UI_LOCK_TIMEOUT=1200 make test-document-open-ui test-ui
```

默认等待 600 秒，超时返回 75，日志输出占用者。owner 文件是 `pid=...`、`branch=...`、
`time=...` 三行；PID 已不存在时自动回收。没有 owner 或 PID 无效的目录视为手工占用，
不会按目录年龄删除。确认没有其他测试/进程使用后，由持有者清理手工锁；不要直接删除活动锁。
正常退出、命令失败、INT/TERM 都释放锁；取消时先终止命令树并等待，再释放。
SIGKILL/掉电无法触发清理，下次凭 owner PID 回收；PID 复用、owner 未写入或回收中崩溃可能需要人工核实。
锁自测仅在 `INKORA_UI_LOCK_TESTING=1` 下使用临时私有目录，避免 `make test-ci` 干扰真实测试。
互斥不覆盖用户直接操作桌面，也不保护同一个 worktree 内的并行构建。

## self-hosted runner 的 UI 预检与恢复

锁获取后才执行 `ui-preflight.sh`，避免排队期间桌面状态变化。
所有 UI 入口检查控制台用户、GUI 登录域、活动且未锁定的桌面；XCUITest 额外检查
`automationmodetool`。预检失败返回 78，并在对应 `artifacts/logs/` 中保留操作提示。
通过后用系统 `caffeinate -dimsu` 防止执行期间空闲睡眠；这无法解锁已锁定的屏幕。

先在 runner 所属账户的桌面终端执行以下只读检查：

```sh
automationmodetool
stat -f '%Su' /dev/console
launchctl print "gui/$(id -u)" | head -20
launchctl print "gui/$(id -u)/actions.runner.huruizhi-Inkora.inkora-rayhu-mac-arm64"
```

若模式关闭且输出 `requires user authentication`，无人值守 XCUITest 可能超时。
**由管理员在本机终端认证执行**（脚本不会执行）：

```sh
sudo /usr/bin/automationmodetool enable-automationmode-without-authentication
/usr/bin/automationmodetool
```

确认输出已无需用户认证，再保持桌面登录且解锁，重跑 UI 目标或 CI。
这项配置允许测试无需再次认证地启用 Automation Mode；如需撤销，由管理员执行
`sudo /usr/bin/automationmodetool disable-automationmode-without-authentication`。
模式已开启时预检允许运行，但若仍需认证，模式失效后可能再次阻塞。

runner 应运行于登录用户的 LaunchAgent。当前检查已确认它属于 `gui/501`，
不需重装。若检查发现只有 LaunchDaemon，应由管理员停掉该服务，再在已登录账户下
按 runner 的 `svc.sh` 安装 LaunchAgent；不要同时启动两个 Listener。
本次 CI 进一步确认：虽然服务位于 GUI 域，`SessionCreate=true` 的 runsvc 与测试子进程
处于 audit session 102590，而桌面为 100014。仅判断 plist 位于 LaunchAgents 不足以验收。
预检会输出两个编号；发现不同则停止。由用户在 rayhu 的已登录桌面终端中，确认无 CI
正在运行后执行以下命令（不要 sudo 启动用户 LaunchAgent）：

```sh
runner_plist="$HOME/Library/LaunchAgents/actions.runner.huruizhi-Inkora.inkora-rayhu-mac-arm64.plist"
runner_label=actions.runner.huruizhi-Inkora.inkora-rayhu-mac-arm64
cp "$runner_plist" "$runner_plist.before-ink-infra-002"
launchctl bootout "gui/$(id -u)/$runner_label"
/usr/libexec/PlistBuddy -c 'Set :SessionCreate false' "$runner_plist"
launchctl bootstrap "gui/$(id -u)" "$runner_plist"
launchctl print "gui/$(id -u)/$runner_label"
```

这一步修改 runner 的系统会话配置，仓库脚本不会代为执行；需重跑 CI 确认测试进程与桌面
编号相同，才能认定会话问题修复。后续重新安装 runner 可能重新生成 plist，需再次核对。
若桌面锁定，请在本机解锁；不要通过脚本绕过锁屏。

若预检通过但 XCUITest 仍报告权限错误，在“系统设置 → 隐私与安全性”中检查
“开发者工具”、以及系统实际提示的“辅助功能/自动化”授权，并允许实际运行测试的宿主。
先运行一次 UI 目标观察系统提示；不批量授予权限、不修改 TCC 数据库。
`SACSetScreenSaverCanRun returned 22` 单独不足以证明锁屏或 TCC 拒绝，需结合会话和测试日志诊断。
