# M0：Paseo 执行调度记录

用户于 2026-11-08 指定主 Agent 作为任务调度者和规划者，通过 Paseo 调用 Codex 与 OMP 执行具体工作。主 Agent 负责范围、依赖、验收、证据与后续决策；具体原型、样稿和核验交给执行 Agent。

## 本轮分工

| 执行项 | Agent | 模型/思考 | Workspace | 工作分支 |
| --- | --- | --- | --- | --- |
| INK-PROT-001：保真与历史最小原型 | Codex | gpt-6.1-sol / high | wks_33805ba7863616ce | task/INK-PROT-001-fidelity-prototype |
| INK-PROT-002：独立样稿与预期字节结果 | OMP | zhipu-coding-plan/glm-5.3 / high | wks_ac42d570c5f7b794 | task/INK-PROT-002-fidelity-cases |

- Host：`srv_MEqRNkRW6fSx`（RayHu 的 Mac Mini）。实时检查 Codex、OMP 均 available；无配置 profile，因此通过 provider/model discovery 选择已列出的模型与思考级别。
- 两个执行 worktree 均固定从 `57aeaac18e41c7191b1be851b284aae8c1b1bbae` 分支，规划分支不充当产品基线，不修改 main。
- Codex 只负责隔离原型与运行说明；OMP 只负责独立输入/预期输出和验收步骤。各自提交、各自推送，不互改分支，不修改真实用户文档，不自行合并或宣告最终架构通过。
- 管理者使用当前规划分支 `task/INK-PLAN-005-paseo-orchestration` 维护状态；完成通知通过 Paseo `notifyOnFinish` 回传，不使用循环轮询代替通知。

## 验收与依赖

1. 原型题目与[增量路线验证票](../issues/11-incremental-fidelity-prototype.md)一致：局部字节保真、保护片段混排、主动源码往返的内容/dirty/选区/历史，以及不安全保存阻断。
2. 独立样稿先固定输入、用户动作、预期字节和允许变更范围；不能以原型实际输出反过来修改验收预期。
3. 两项产物就绪后安排交叉验证，记录通过/失败/未执行及最小反例，再进入真实 WKWebView/系统中文输入法与用户审阅。未执行项保持待验证。
4. 只有验收有实际证据后才解决原型票，之后进入[架构选型](../issues/12-fidelity-architecture-verdict.md)。调度成功、可打开演示、已有 111 项基线测试均不等于全部门槛通过。
5. 本地默认只运行非 UI 检查。原型桌面验证由 Codex 单独安排并遵循 UI 锁/隔离规则，OMP 不并发操纵桌面；真实输入法无法执行时如实保留人工验收项。

## 状态

两项任务均已派发，Paseo 创建回执状态为 running；这只表示执行已启动，不代表模型请求、产物或验收全部成功。

| 执行项 | Host / Agent ID | 已确认状态 | 后续 |
| --- | --- | --- | --- |
| INK-PROT-001 | srv_MEqRNkRW6fSx / 1b4ff74d-c416-407c-9a83-68ed1c02f190 | Codex 创建回执 running，full-access / high | 等待原型与实际运行证据回报 |
| INK-PROT-002 | srv_MEqRNkRW6fSx / deba3da8-2190-438c-a867-dadc478d7e9d | OMP 创建回执 running，full / high | 等待独立样稿与字节检查回报 |

两者均启用 notifyOnFinish；主 Agent 等待完成、错误或权限通知，收到后核查提交与实际结果并安排交叉验收。不因创建回执或 Agent 自述跳过检查；保留工作区到交付证据与用户审阅结束，再按生命周期规则回收。

本轮主 Agent 只执行工作区/代理调度与规划文档检查，没有产品测试结果；原型门槛均仍待执行，未修改主干或宣告最终架构通过。

### 持续执行：实时核实与验收口径

管理者已重新核实两个特定 Agent 的 running、activeTurn/session 与实际工具活动，无待审批项。已发送 steer 消息，强调用户最新“高级语法不自动整篇回退、含混边界阻止不安全保存”优先于旧产品规范中的自动回退行为。消息队列已接收，原型和独立样稿继续由原 Agent 执行，未重复启动。

后续证据与字节/交互/运行环境分层判据见 [M0 验收索引](M0-acceptance.md)。
