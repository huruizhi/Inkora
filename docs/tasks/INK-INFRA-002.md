# INK-INFRA-002：self-hosted UI runner 诊断与本机互斥

- 来源：self-hosted main CI run 42394474314
- 分支：`task/INK-INFRA-002-ui-test-runner`
- 依赖：INK-INFRA-001 / PR #48

## 交付范围

- 全局 `/tmp/inkora-ui-tests.lock` 目录锁，包含 PID、分支、UTC 时间；排队、超时、陈旧 PID 回收和退出清理；
- DocumentOpen XCUITest、Debug/Release 启动烟测和 `make run` 共用锁；
- UI 会话与 automation mode 只读预检；执行期间用系统 `caffeinate` 防止空闲睡眠；
- `make test-ci` 覆盖锁行为；更新测试与 runner 故障处理文档。

## 诊断证据

2026-11-08 检查 main run 42394474314：XCUITest 初始化时出现
`Timed out while enabling automation mode` 和 `SACSetScreenSaverCanRun returned 22`。
本机 runner 为 `~/Library/LaunchAgents/actions.runner.huruizhi-Inkora.inkora-rayhu-mac-arm64.plist`，
处于 `gui/501`；Listener audit session 与桌面会话均为 100014，无需改为另一种安装方式。
当前控制台用户为 rayhu，采样时未见锁屏标记；这不能证明历史失败时屏幕未锁定。

初次 `automationmodetool` 返回 `Automation Mode is disabled` 且 requires user authentication，
构成无人值守初始化的直接阻塞。随后状态变为 `ENABLED`，但仍要求认证；本任务没有更改授权。
TCC 定向日志只观察到 Inkora 的提示记录，没有足以认定为拒绝授权的证据；不重置 TCC。
因此仓库修复提供预检和互斥，持久授权由管理员按 `docs/testing.md` 执行。

## 非范围

- 产品代码、runner 标签/触发策略、TCC 数据库及权限绕过；
- 自动执行 sudo、解锁桌面或修改系统设置。

## 本地验证

- `make setup`：通过。
- `make lint`：通过（Swift format + TypeScript）。
- `make test-ci`：通过，包含获取、排队、陈旧锁、手工锁超时、失败状态码与 INT/TERM 清理。
- `make test-document-open-ui test-ui`：成功等待并取得其他任务的手工锁后，
  XCUITest 预检发现模式关闭且需认证，以 78 退出；未启动 XCUITest，后续 test-ui 因 make 失败而未执行。
- `scripts/ci/ui-preflight.sh desktop`：通过，包含当前进程与 GUI audit session 比对。

## 剩余事项与风险

- 管理员需执行文档中的 automationmodetool 命令并保持桌面解锁，才能完成持续无人值守的 UI 验收。
- 历史失败时是否锁屏无法从当前状态还原；不声称已修复系统授权。
- 手工锁缺少有效 owner、PID 复用或 SIGKILL 导致的不完整元数据需人工核实；未使用包装器的屏幕操作不受保护。
