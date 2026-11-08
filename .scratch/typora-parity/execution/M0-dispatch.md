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

以下为初始派发状态，后续交接和回收见本文件末尾。Paseo 创建回执状态为 running 只表示执行已启动，不代表模型请求、产物或验收全部成功。

| 执行项 | Host / Agent ID | 已确认状态 | 后续 |
| --- | --- | --- | --- |
| INK-PROT-001 | srv_MEqRNkRW6fSx / 1b4ff74d-c416-407c-9a83-68ed1c02f190 | Codex 创建回执 running，full-access / high | 等待原型与实际运行证据回报 |
| INK-PROT-002 | srv_MEqRNkRW6fSx / deba3da8-2190-438c-a867-dadc478d7e9d | OMP 创建回执 running，full / high | 等待独立样稿与字节检查回报 |

两者均启用 notifyOnFinish；主 Agent 等待完成、错误或权限通知，收到后核查提交与实际结果并安排交叉验收。不因创建回执或 Agent 自述跳过检查；保留工作区到交付证据与用户审阅结束，再按生命周期规则回收。

## Agent 回收规则

用户明确要求执行完成的 Agent 及时回收。主 Agent 在完成通知后核实执行已结束、接收提交/产物/测试及未完成事项；完成本阶段且无需立即修正的 Agent 当轮归档，不为潜在未来复用保持闲置。需要修正时立即派发具体后续任务，不能仅停留在 idle。后续独立核验可新建 Agent，通过固定提交与任务记录交接。

Agent 归档与工作区回收分别处理：归档 Agent 保留会话、文件和工作区；工作区涉及未提交文件、未保存证据或后续验收时继续保留，避免 archive_workspace 移除 Paseo-owned worktree。运行中 Agent 必须等任务终止后再回收，不因观察超时中断或重建。

### 已完成回收

- 已归档旧滚动/预览修复 Agent `6a4158f1-76db-463e-8834-3c7afc986068`；回读状态 closed，archivedAt 为 `2026-11-08T12:09:36.683Z`。归档前为 idle、无 activeTurn，任务工作区干净，提交 `57aeaac` 与 `docs/tasks/INK-055.md` 保留。
- 保留该任务工作区与待办：其最后回报说明安装的 App 尚未更新；任务记录还列明既有 UTF-16/Open Recent 验收失败和一次键盘菜单波动。归档执行会话不代表这些安装/验收事项已解决，也不代表路线目标完成。
- 原型、样稿与图片研究 Agent 本轮直接核实均为 running、有 activeTurn，继续执行，未归档。

本轮主 Agent 只执行工作区/代理调度与规划文档检查，没有产品测试结果；原型门槛均仍待执行，未修改主干或宣告最终架构通过。

### 持续执行：实时核实与验收口径

管理者已重新核实两个特定 Agent 的 running、activeTurn/session 与实际工具活动，无待审批项。已发送 steer 消息，强调用户最新“高级语法不自动整篇回退、含混边界阻止不安全保存”优先于旧产品规范中的自动回退行为。消息队列已接收，原型和独立样稿继续由原 Agent 执行，未重复启动。

后续证据与字节/交互/运行环境分层判据见 [M0 验收索引](M0-acceptance.md)。

### 并行准备：本地图片事实研究

M0 两项执行尚未交付时，已独立派发 [Sandbox 本地图片约束研究](../issues/13-local-assets-feasibility.md)，只为后续资源策略提供事实输入，不展开图片功能实现。Paseo workspace 为 `wks_394cc660a127da5d`，host/agent 为 `srv_MEqRNkRW6fSx` / `10924b8b-564b-48fc-81c0-2e8df68ac355`，Codex GPT-6.1-Sol / high，创建回执 running。完成通知返回后核查一手来源与实际研究提交，再进入资源策略决策。

### 已接收交付与按成本重新派发

| 阶段任务 | 固定交付/核查结果 | Agent 回收 |
| --- | --- | --- |
| INK-PROT-001 | 原型 `c76a20014492599ec1e5897a4b1cb6e1c1177749`，本地/远端一致且工作区干净；交付报告含 11 项原型检查和 111 项既有编辑器回归，管理者已读取代码、限制与运行记录；未取得完整 M0 通过证据 | `1b4ff74d-c416-407c-9a83-68ed1c02f190` 已归档，回读 closed，2026-11-08T12:13:37.358Z |
| INK-PROT-002 | 独立样稿 `c85e1890b2ef3938dd6853d97977d28ac54b309e`，本地/远端一致且工作区干净；管理者实跑 verify.py，11 例 43 步 508 项数据自校验通过，不等于原型通过 | `deba3da8-2190-438c-a867-dadc478d7e9d` 已归档，回读 closed，2026-11-08T12:15:59.279Z |
| INK-RES-001 | 研究 `408d2642834530658b72939ef741f5a19101363a`，一手依据与七场景已接收；无运行时权限验收结论 | `10924b8b-564b-48fc-81c0-2e8df68ac355` 已归档，回读 closed，2026-11-08T12:13:37.488Z |
| INK-PROT-003 的 Luna 尝试 | GPT-6-Luna / medium 两轮提前结束，只有读取，分支仍为 c76a200、无代码改动；保留失败原因及有限诊断，不作为交付 | `925ffe8f-15f9-480b-bfec-8e21de6c09df` 已归档，回读 closed，2026-11-08T12:19:19.683Z |

该阶段 INK-PROT-003 在同一干净 workspace `wks_c496417af8c06274` / 分支 `task/INK-PROT-003-source-eol-review` 交给 OMP GLM-5.3 / low，host/agent 为 `srv_MEqRNkRW6fSx` / `2a271324-54c2-46a6-9037-fdc84692fece`，初始回执 running，notifyOnFinish 已启用。任务限定为源码草稿 EOL/no-op 修正、重建离线产物和独立样稿支持矩阵，不改生产代码或预期样稿，不并发操纵桌面。最新交接见后文。

用户要求按难度选择模型，本轮已执行[分层调度规则](model-routing.md)。高成本原执行者不再承担普通后续任务；任务失败采用明确诊断和成本合适的交接，不自动升级最贵模型。所有原型产物和样稿工作区保留供固定提交复核。

### INK-PROT-003 交接完成与后续派工

- 固定交付 `692493508d4b5ac78f0b212045aae32a8b59b90e`，管理者已核实本地/远端一致、工作区干净并读取 CROSS-VALIDATION。源码 EOL/no-op 修正中还发现并修复原型按钮/textarea 重复 ID，旧证据不能按真正 textarea 行为解释。
- 执行回报：原型 15 项检查、lint 和 111 项既有编辑器回归通过；独立样稿 01/04/07/08 在可执行字节范围通过，09 仍缺选区映射，其它样稿暴露载入、marks/attrs、split、含混缓冲等失败。报告只作为阶段证据，M0 不通过。
- `2a271324-54c2-46a6-9037-fdc84692fece` 已交接归档，回读 closed，archivedAt=`2026-11-08T12:34:35.668Z`；分支和工作区保留。

| 后续任务 | 固定起点与范围 | Host / Agent / Workspace | 模型与状态 |
| --- | --- | --- | --- |
| INK-PROT-004：样稿语义审计 | c85e189；只读规范和独立解析，审计06/11的 Enter/段落/换行语义及01的Unicode描述；有依据才更正oracle，不接触原型以迎合输出 | srv_MEqRNkRW6fSx / fb89ab9b-ce31-4152-a346-27c3744f4fea / wks_abf264ce8c124ffc | OMP GLM-5.3 / low，创建回执 running |
| INK-PROT-005：保护片段/含混输入 | 6924935；只改原型，修正case02和case10，保留原文/输入/可信投影并阻断不安全保存 | srv_MEqRNkRW6fSx / 54622b76-6057-4797-bfdc-e7cf10f55144 / wks_cc9d6c53f3180f42 | OMP GLM-5.3 / high，创建回执 running |

两项均 notifyOnFinish，工作分支分别为 `task/INK-PROT-004-fixture-semantics` 和 `task/INK-PROT-005-protected-boundaries`。其它 links、marks、通用映射、历史、实际 WKWebView/IME 等缺口继续保留，不能以有限修正缩减总体验收目标。

### INK-PROT-004 交接与选区模块并行任务

- 接收独立审计提交 `484ee81d924efd2a1038e8421b146f4ae5d5b743`，本地/远端一致、工作区干净；管理者实际复跑 verify.py，11 例 47 步 557 项完整性检查通过。CommonMark 段落/softbreak 语义纠正保留原单换行覆盖；emoji 文案改为实际字节/UTF-16 数，没有改有效字节预期。
- 11 visual-split 的段落重组/原边界吸收仍是需按真实动作重放的表示选择，不能仅凭与单个目标 hash 不一致判定失败；样稿自校验不是完整交互语义证明。
- `fb89ab9b-ce31-4152-a346-27c3744f4fea` 已交接归档，回读 closed，archivedAt=`2026-11-08T12:45:30.575Z`，样稿工作区保留。后续统一核验使用新固定样稿，005当前专测的02/10不受此审计改动影响。
- 新增 INK-PROT-006：GLM-5.3 / high，独立分支 `task/INK-PROT-006-source-selection`，起点6924935；host/agent/workspace 为 `srv_MEqRNkRW6fSx` / `62168a02-a1de-484e-b029-39d9a2cfa942` / `wks_b402ba30bed468ee`。创建回执 running，notifyOnFinish 开启。
- 006只新增选区映射纯模块、独立检查和证据，不改005正在修改的model/main/shell/build/HTML；覆盖PM与原文双向位置、textarea与CRLF偏移、方向、emoji/BOM及语义编辑后的内容锚点。模糊映射必须有明确失败结果，不静默重置；模块交付后仍需集成与真实环境验证。

### INK-PROT-007：真实 WKWebView 环境准备

005、006 本轮重新核实仍为 running、有 activeTurn、无待审批项；继续原会话，不因等待重启。并行派发低复杂度的真实环境准备：

- Host / Agent / Workspace：`srv_MEqRNkRW6fSx` / `fd9b1530-878f-4a55-a570-913cf49c7c0c` / `wks_c1a816897258247a`。
- 模型：OMP GLM-5.3 / low；分支 `task/INK-PROT-007-wkwebview-host`，起点6924935。创建回执 running，notifyOnFinish 开启。
- 只新增 `editor/prototypes/fidelity/native-host/` 的 Swift/AppKit/WebKit 宿主、隔离 bundle、构建/运行入口和说明，不改生产代码或005/006文件。
- 使用独立 bundle ID、App Sandbox、离线资源/导航约束和 ad-hoc 签名；支持指定原型HTML，记录原文件与加载副本hash，避免源码更新却验证旧产物。
- 本阶段只编译、打包、签名和检查资源，不启动桌面或模拟IME。后续合并原型后单独安排真实运行；构建成功不能当作 WKWebView/系统输入法验收通过。

### INK-PROT-007：首轮交付审核与即时修正

- 已收到 `98374111161d5ccc2e1723d2c590ca3fc5dcfb0f`，本地/远端指针一致、工作区干净，范围仅 native-host 七个文件；执行者报告编译、签名和资源检查通过，未运行 App/WKWebView/IME。管理者本轮检查源码与构建规则，未独立重跑构建。
- 审核发现构建可靠性缺口：swiftc 管道可能以 tee 成功掩盖编译失败；Info.plist 对入口/CSP/HEAD 变化的依赖不完整；并行构建存在元数据写入顺序问题；入口相对路径说明需与 make -C 一致。以上会影响后续加载版本证据的可信性。
- 已立即给同一低成本 Agent 派发限定修正，要求验证无 clean 更换较旧 HTML、切换 CSP 后元数据一致、编译失败使 make 非零，并修正文档；仍禁止启动 App。修正通知已排队、notifyOnFinish 开启。该任务尚有审核修正待完成，因此本轮继续执行而非以 idle 状态闲置保留；完成交接后及时归档，工作区继续保留。
