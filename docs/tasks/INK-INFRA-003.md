# INK-INFRA-003：UI 锁等待与本地启动调整

- 来源：INK-INFRA-002 / PR #49 合并后的 follow-up
- 分支：`task/INK-INFRA-003-ui-lock-tuning`
- 依赖：INK-INFRA-002（main 8d77203）

## 交付范围

- `make run` 恢复使用 `open` 启动 Debug App，启动后返回终端，不使用 UI 测试锁；
- UI 测试锁默认等待提高至 1500 秒（25 分钟），等待日志显示超时预算，仍可通过环境变量覆盖；
- 锁自测验证未设置覆盖值时的默认预算，以及等待过程中取消不释放他人的锁；
- 测试文档记录 2026-11-08 本机 runner 的已修复状态及成功 run 42402574810，保留恢复与撤销步骤。

## 非范围

- 产品代码、CI runner 标签/触发条件、30 分钟 job 超时及新的系统配置变更。

## 验收入口

- `make lint test-ci`：Swift/TypeScript 检查、capture wrapper 与锁回归测试；
- `make test-ui`：持锁执行 Debug App 启动烟测；
- 分支 CI：`gh workflow run CI --ref task/INK-INFRA-003-ui-lock-tuning`，等待全部测试与 Release 烟测结果。

## 风险

- 25 分钟等待预算属于 30 分钟 CI job 的总预算，排队过久时仍可能触发 job 超时；
- `make run` 不占用测试锁，手动操作 App 时应避开自动化 UI 测试。
