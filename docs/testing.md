# 构建、测试与 CI 入口

本地与 GitHub Actions 使用同一组 Make 目标。测试本身不得读取用户目录、个人配置或公网；`make setup` 仅负责安装和解析开发依赖。

Agent 本地只运行非 UI 目标，UI 目标由 CI 执行，以避免占用开发者桌面。

`make setup` 将固定版本的 pnpm 安装到被忽略的 `.tools/`，避免 Homebrew 滚动版本或 Intel/Apple Silicon 架构差异改变构建结果。

## 命令

| 命令 | 作用 |
| --- | --- |
| `make test-editor` | Bridge 以外的编辑器模型与行为测试 |
| `make test-bridge` | TypeScript + Swift Bridge v1 contract tests |
| `make test-native` | 全部 XCTest 单元与 WKWebView 集成测试 |
| `make test-document-open-ui` | 文档打开、菜单状态、菜单点击及 Cmd+O/S/Shift+S/Z/Shift+Z；Open Recent、冷/热启动打开、失效路径与重启恢复；实际打开与另存后验证磁盘内容；需已解锁桌面和 Automation Mode |
| `make test-ui-release` | Release 离线资源检查与 App 启动烟测 |
| `make test-ui` | 无辅助功能权限依赖的 Debug App 启动烟测；CI 通过 `INKORA_CAPTURE_SCREEN=1` 尽力截图 |
| `make test-ci` | 验证命令包装器、快照归档及 UI 锁的获取/排队/超时/回收/退出清理 |
| `make test-all` / `make test` | 按层运行全部测试 |
| `make build-release` | 构建 Release App，不配置正式签名凭据 |
| `make bench` | 轻量性能基准（编辑器 + 原生文档层），不启动 App UI，agent 本地可运行 |
| `make bench-full` | 完整基准，含 WKWebView 与 App 启动类指标，会启动 App UI，仅 CI runner 执行 |

性能基线的方法论、样本、阈值与数据见 `docs/performance.md`；`make test-native` 中的基准用例在未设置 `INKORA_PERF=1` 时自动跳过。

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
的屏幕操作均持锁；构建和 hostless 单元测试不占用屏幕锁。
`make run` 使用 `open` 启动 Debug App，启动后返回终端，不占用 UI 测试锁；
手动使用 App 可能干扰正在运行的 UI 测试，应避开测试时段。
直接执行 XCUITest 或自动化 App 启动测试时也必须使用包装器，避免绕过队列：

```sh
scripts/ci/with-ui-lock.sh scripts/ci/ui-preflight.sh xcuitest xcodebuild ...
INKORA_UI_LOCK_TIMEOUT=900 make test-document-open-ui test-ui
```

默认等待 1500 秒（25 分钟；CI job 总超时为 30 分钟），超时返回 75，日志输出占用者。owner 文件是 `pid=...`、`branch=...`、
`time=...` 三行；PID 已不存在时自动回收。没有 owner 或 PID 无效的目录视为手工占用，
不会按目录年龄删除。确认没有其他测试/进程使用后，由持有者清理手工锁；不要直接删除活动锁。
正常退出、命令失败、INT/TERM 都释放锁；取消时先终止命令树并等待，再释放。
SIGKILL/掉电无法触发清理，下次凭 owner PID 回收；PID 复用、owner 未写入或回收中崩溃可能需要人工核实。
锁自测仅在 `INKORA_UI_LOCK_TESTING=1` 下使用临时私有目录，避免 `make test-ci` 干扰真实测试。
互斥不覆盖用户直接操作桌面，也不保护同一个 worktree 内的并行构建。

## self-hosted runner 的 UI 预检与恢复

### 本机已修复状态（2026-11-08）

用户已执行 `sudo automationmodetool enable-automationmode-without-authentication`，
将 runner LaunchAgent 的 `SessionCreate` 设为 `false` 并重启服务。
[验证 run 42402574810](https://github.com/huruizhi/Inkora/actions/runs/42402574810)
已全绿，包含 XCUITest；此前的系统会话与认证阻塞已完成验证。
下列步骤保留用于以后恢复或撤销配置，重新安装 runner 后也需核对。

### 预检与恢复步骤

锁获取后才执行 `ui-preflight.sh`，避免排队期间桌面状态变化。
UI 测试入口检查控制台用户、GUI 登录域、活动且未锁定的桌面；XCUITest 额外检查
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
修复前的 CI 曾确认：虽然服务位于 GUI 域，`SessionCreate=true` 的 runsvc 与测试子进程
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

这一步修改 runner 的系统会话配置，仓库脚本不会代为执行；以后再次应用配置时，需重跑 CI
确认测试进程与桌面编号相同。后续重新安装 runner 可能重新生成 plist，需再次核对。
如需撤销 SessionCreate 修改，确认没有 CI 正在运行后，在同一桌面终端执行：

```sh
launchctl bootout "gui/$(id -u)/$runner_label"
cp "$runner_plist.before-ink-infra-002" "$runner_plist"
launchctl bootstrap "gui/$(id -u)" "$runner_plist"
```

恢复备份可能再次造成 UI 会话隔离；撤销无人值守 Automation Mode 的命令见上文。
若桌面锁定，请在本机解锁；不要通过脚本绕过锁屏。

若预检通过但 XCUITest 仍报告权限错误，在“系统设置 → 隐私与安全性”中检查
“开发者工具”、以及系统实际提示的“辅助功能/自动化”授权，并允许实际运行测试的宿主。
先运行一次 UI 目标观察系统提示；不批量授予权限、不修改 TCC 数据库。
`SACSetScreenSaverCanRun returned 22` 单独不足以证明锁屏或 TCC 拒绝，需结合会话和测试日志诊断。
## UI 测试数据隔离

`test-document-open-ui`、`test-ui` 和 `test-ui-release` 构建使用独立 bundle ID
`com.huruizhi.Inkora.UITesting`，与用户正式 App 的最近文件、Sandbox 容器、窗口偏好隔离。
XCUITest 另以 `-INKTestDefaultsSuite` 隔离每个用例的恢复历史；冷启动经 Launch Services
传入相同参数。恢复草稿另以 `--inkora-test-recovery-session` 隔离；测试 bundle
启用与正式 App 相同的草稿恢复流程，Hostless XCTest 不启用真实存储。
普通 `make build` / `make run` 仍使用正式 bundle ID。

## 原生菜单验收

`DocumentOpenUITests` 将编辑器查询限定到目标文档窗口，兼容独立窗口与 Sheet 两种系统文件面板。历史场景用一次粘贴建立单个编辑事件并恢复原剪贴板，避免逐字合成键盘事件的时间间隔改变 history 分组；Undo/Redo 本身仍通过菜单点击及真实快捷键执行。

同机多个 worktree 或 CI 同时验证时，所有启动 App 的命令须使用 `/tmp/inkora-ui-tests.lock` 互斥。runner 的 automation mode 超时须与测试断言失败分开记录。

## 1.0 验收套件（INK-024）

逐条覆盖与人工 VoiceOver 清单见 [acceptance.md](acceptance.md)。
`make test-document-open-ui` 同时运行 AcceptanceUITests：只用键盘打开、编辑、保存、
取消关闭、放弃关闭、从最近文件重开，并运行 macOS 14+ 原生 AX 审计（描述、操作、父子关系）。
SDK 的审计 API 自 macOS 14 可用，与项目最低版本一致；不支持的运行环境不作为通过或静默跳过。

截图通过 XCTest keepAlways attachments 保存，入口在成功和失败时均导出附件到
`artifacts/screenshots/document-open-ui/`（包含 manifest、PNG 与诊断文本；无像素比对）。
新增键盘场景使用固定 Markdown 样本，900×700 内容区、浅色外观、既有 16px/1.65
系统等宽字体；不覆盖真实用户的外观/字体偏好。窗口外框会因系统版本有所不同。

全部 UI 类继承 AcceptanceTestCase，在记录失败时、清理 App 前附截图、AX 树、
App Bridge 日志和当前 Markdown。日志 hook 仅测试 bundle 启用，记录 request/revision/
category，不含正文。快照 hook 复用 Bridge，不移动焦点、不提交 composition、不修改历史；
取不到快照时附件明确写 unavailable。原始 App/WebKit unified log 与命令 stdout 仍由
run-and-capture.sh 失败分支归档。

`TEST_RUNNER_INKORA_MARKDOWN_SNAPSHOT_SOURCE` 将测试专用容器目录传给 runner，
由每个 XCUIApplication 使用 UUID 文件并向 App 传入 `INKORA_MARKDOWN_SNAPSHOT_SOURCE`。
快照只用于测试诊断，不能作为生产恢复机制。冷 Launch Services 启动未继承 XCUITest
环境时快照可能 unavailable，完整日志与截图仍保留。此限制须结合失败附件判断。
`bench-full` 的启动构建也明确使用 UITesting bundle ID，并使用独立 defaults/recovery 参数。
