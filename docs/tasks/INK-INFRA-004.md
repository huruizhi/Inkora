# INK-INFRA-004：减少 CI 中 UI 测试的运行次数

- 分支：`task/INK-INFRA-004-reduce-ui-runs`
- 依赖：origin/main fc9eac7

## 背景

self-hosted runner 运行在开发者本机，UI 测试会占用开发者桌面。此前每个 PR 要跑两轮完整
UI 套件：合并前在分支上手动触发一轮，合并后 push 到 main 时 workflow 又自动跑一轮。另外
`test-all` 中的 `test-ui`（Debug 版启动烟测）与 XCUITest 重复：每个 XCUITest 用例都会启动
Debug App。

## 交付范围

- `.github/workflows/ci.yml` 删除 `push: branches: [main]` 触发器，仅保留 `workflow_dispatch`
  （原有 `full-bench` 输入不变）；workflow 顶部注释说明合并前必须在已 rebase 到最新 main
  的分支上手动触发并通过，需要时也可以在 main 上手动触发；
- `make test-all` 移除 `test-ui` 依赖并注明原因；`test-ui` 目标保留供手动运行，
  `test-ui-release` 及其在 CI 中的步骤保持不变；
- `docs/testing.md` 记录 CI 仅手动触发与合并规则（分支必须基于最新 main 且 CI 通过，一次
  只合并一个 PR），并说明 `test-all` 不再包含 `test-ui`；`README.md` 同步提示 CI 仅手动
  触发。

## 非范围

- 产品代码与测试代码；不引入新依赖；
- runner 标签、job 超时及其余 CI 步骤；不触发 CI（本机 Automation Mode 待用户重新授权，
  由协调者在环境恢复后统一触发）。

## 本地验证

- `make setup`：通过（pnpm 安装、编辑器构建、xcodegen 生成工程）。

- `make lint`：通过（Swift format + TypeScript）。
- `make test-ci`：通过（命令包装器、快照归档及 UI 锁回归）。
- 未运行任何 UI 测试或启动 App 的命令；未触发 CI。

## 风险

- CI 不再在 push main 后自动运行，依赖合并纪律：一次只合并一个 PR；合并后其余待合并分支
  须重新 rebase 到新 main 再手动触发 CI，否则"基于最新 main"的保证失效；
- `test-ui` 移出 `test-all` 后，Debug 启动烟测不在常规套件中执行，其覆盖由
  `test-document-open-ui` 的每个 XCUITest 用例（均启动 Debug App）与 `test-ui-release`
  的 Release 启动烟测承接；如需单独验证 Debug 启动，手动运行 `make test-ui`。
