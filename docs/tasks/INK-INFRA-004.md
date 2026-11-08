# INK-INFRA-004：减少 CI 中 UI 测试的运行次数

- 分支：`task/INK-INFRA-004-reduce-ui-runs`
- 依赖：origin/main fc9eac7

## 背景

self-hosted runner 运行在开发者本机，UI 测试会占用桌面。此前每个 PR 要跑两轮完整
UI 套件：合并前在分支上手动触发一轮，合并后 push 到 main 时 workflow 又自动跑一轮。
另外 `test-all` 中的 `test-ui`（Debug 启动烟测）与 XCUITest 重复：每个 XCUITest 用例都会
启动 Debug App。

经用户批准（2026-11-08），进一步改为按需运行：默认 CI 完全不运行 UI 测试，UI 套件只在
发布前（release gate）或用户明确要求时运行。

## 交付范围

- `.github/workflows/ci.yml`：删除 `push: branches: [main]` 触发器，仅保留
  `workflow_dispatch`；新增 `ui-tests` 布尔输入（默认 `false`），`full-bench` 输入不变。
  默认路径运行 setup、lint、`make test-non-ui`、`make release-bundle-check`（Release
  离线资源检查，不启动 App）与轻量 `make bench`；`ui-tests=true` 时追加
  `make test-document-open-ui` 与 `make test-ui-release`；Upload diagnostics 保持
  `if: always()`；
- `Makefile`：`test-all` 移除 `test-ui` 依赖（每个 XCUITest 用例都会启动 Debug App，与其
  重复）；新增 `test-non-ui`（编辑器、Bridge、native、CI 脚本）与 `release-bundle-check`
  （自 `test-ui-release` 拆出离线资源检查，不启动 App）；`test-ui`、`test-ui-release` 等
  全部目标保留；
- `docs/testing.md`：CI 仅手动触发与合并规则（基于最新 main、CI 通过、一次只合并一个
  PR）；默认 CI 不运行 UI 测试；UI 套件只在发布前或用户明确要求时以
  `gh workflow run CI --ref <branch> -f ui-tests=true` 运行；普通 PR（含菜单、快捷键、
  对话框、窗口或文档生命周期改动）只跑默认 CI 即可合并，但必须在描述中写明“UI 未验证”
  并列出受影响的 UI 测试名称；记录取舍（UI 回归推迟到发布前发现、失败需回溯定位）与仅
  UI 套件覆盖的能力（菜单/快捷键、对话框流程、最近文件、Finder 打开、键盘可达、无障碍
  审计、Release 启动）；均注明经用户批准（2026-11-08）；
- `README.md` 同步；本任务说明。

## 非范围

- 产品代码与测试代码；不引入新依赖；不删除任何测试或测试目标；
- runner 标签与 job 超时；`full-bench` 语义不变；
- 本任务不触发 `ui-tests=true` 的 CI（由协调者按需触发）。

## 本地验证

- `make setup`：通过（pnpm 安装、编辑器构建、xcodegen 生成工程）。
- `make lint`：通过（Swift format + TypeScript）。
- `make test-ci`：通过（命令包装器、快照归档及 UI 锁回归）。
- `make release-bundle-check`：通过，构建 Release 并输出 "Offline editor bundle smoke
  passed"；仅文件/CSP/entitlements 离线检查，未获取 UI 锁、未启动 App。
- 未运行任何 UI 测试或启动 App 的命令。

## 分支 CI 验证

- [run 42460094912](https://github.com/huruizhi/Inkora/actions/runs/42460094912)
  （默认 `ui-tests=false`，commit 3c885f2）：成功，总时长 4 分 18 秒。执行：checkout、
  setup、Lint、Test non-UI layers、Release bundle check (offline)、Performance baseline
  (light)、Upload diagnostics；跳过：UI acceptance (XCUITest)、UI release launch smoke
  （`ui-tests=false`）、Full performance baseline（`full-bench=false`）。未运行任何 UI 步骤。

## 风险

- UI 回归会推迟到发布前才被发现；发布前 UI 失败时需回溯多个 PR 定位；改动菜单、对话框、
  窗口或文档生命周期的 PR 依赖“UI 未验证 + 受影响测试清单”在发布前集中补验；
- CI 不再在 push main 后自动运行，依赖合并纪律：一次只合并一个 PR；合并后其余待合并分支
  须重新 rebase 到新 main 再手动触发 CI；
- `test-ui` 移出 `test-all` 后，Debug 启动烟测不在常规套件中执行，如需单独验证手动运行
  `make test-ui`。
