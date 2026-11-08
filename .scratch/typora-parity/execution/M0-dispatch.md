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

### INK-PROT-007 修正验收与隔离集成

- 接收修正提交 `952d5713d2fd9c147e289382417ae1976fe964af`，本地/远端一致、工作区干净。确定性构建每次重建入口与元数据，编译失败非零退出；执行者报告旧 mtime 入口/CSP 切换及编译负例均已实际验证。
- 管理者将已交付原型 6924935、审计样稿 484ee81 和修正宿主 952d571 接入独立分支 `task/INK-PROT-008-m0-integration`。Paseo workspace `wks_226155065e188d3f`，路径 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-008-m0-integration`；未合并产品主干。
- 管理者实际复跑样稿 557 项数据检查，并在集成提交 `82731d26fd57226abc681d45dd13c8a578c86e5a` 实跑宿主 `make ... verify`，编译/签名/资源与版本信息检查通过；尚未运行 App/WKWebView/IME。来源与待办见集成分支 `editor/prototypes/M0-INTEGRATION.md`。
- 007 Agent `fd9b1530-878f-4a55-a570-913cf49c7c0c` 已及时归档，回读 closed，archivedAt=`2026-11-08T12:59:37.438Z`；其工作区和构建证据保留。005、006继续独立执行，完成后按固定提交汇入008并安排后续集成，不因宿主通过构建关闭M0。

### INK-PROT-005/006 接收、复跑与回收

- 005固定交付 `6b0c33e43a0f40603faf6c06937d99c98b6be57b`，本地/远端一致且干净，范围仅fidelity/。管理者合并到008并实际复跑构建、严格类型、21项检查，以及审计后样稿02/10的三条变体，字节/含混缓冲/保存阻断/主动修复检查通过。存盘判据仍仅内存模拟，普通文本两个美元符号等反例仍过度保守阻断。
- 005 Agent `54622b76-6057-4797-bfdc-e7cf10f55144` 已归档，回读closed，archivedAt=`2026-11-08T13:02:55.239Z`，工作区保留。
- 006固定交付 `598312093ffef5413ae0a45c36ce24008c94b50e`，本地/远端一致且干净，仅3个新增文件。管理者合并到008并实际复跑selection-check 15项通过；模块未与UI接线，09旧crossval的PASS仅字节。006文档建议的“映射失败回退重置”不采纳，后续接线必须保留草稿与可信选区、明确提示。
- 006 Agent `62168a02-a1de-484e-b029-39d9a2cfa942` 已归档，回读closed，archivedAt=`2026-11-08T13:04:47.428Z`，工作区保留。
- 当前008集成提交 `7fe11b36c0981f2d57d9866320702a966c47866a` 已推送；管理者重新构建宿主verify通过，Info/manifest与该提交及新HTML hash一致，未启动App/IME。完整来源和hash见008分支 `editor/prototypes/M0-INTEGRATION.md`。

### 后续三项并行执行

无配置profile，按实际可用OMP GLM-5.3选择成本档；全部notifyOnFinish=true，创建回执running。

| 任务 | 起点/范围 | Agent / Workspace | 模型与分支 |
| --- | --- | --- | --- |
| INK-PROT-009 引用链接/图片混排 | 7c497a7；修复case03载入及全部实际动作，保留引用拼写/原始字节，不加载外部资源 | 76dcc654-9019-45e8-b9f9-06975476f4a8 / wks_1dfa405440d777d8 | GLM-5.3 high；task/INK-PROT-009-reference-links |
| INK-PROT-010 源码选区与历史接线 | 7fe11b3；将006接入main/model，实际UI入口验证09、方向/no-op/失败保留/pending修复 | dfca34b3-7c84-4be5-bb43-1958a791383c / wks_6b6c1315e303a8f3 | GLM-5.3 high；task/INK-PROT-010-selection-integration |
| INK-PROT-011 本地资源平台首部分 | 36e6365；仅prototypes/local-assets/，隔离持久化/所有权/失败注入与非GUI Sandbox探针 | 1da3379f-18dd-414b-b036-f8124a95bb67 / wks_3c98f8b2ad411c85 | GLM-5.3 low；task/INK-PROT-011-local-assets-platform |

三者host均为srv_MEqRNkRW6fSx；009/010可能在model/main交叠，固定提交汇合时按语义处理并复跑组合场景。011属于平台票14的首部分，GUI授权/书签跨启动/WK broker等仍待验证，不因首部分完成关闭父票。各执行者均禁止操纵桌面和修改生产/独立样稿，不直接合并main或宣告M0通过。

### INK-PROT-011 首轮交付审核

接收 `1a413b760c866e134d102e70a83985eef466648e`，本地/远端一致、工作区干净，范围仅 `prototypes/local-assets/`。执行者报告9项普通scratch场景通过，并在签名Sandbox进程中观察到容器内读写成功、未授权外部fixture返回EPERM；未执行GUI授权、书签跨启动或WK broker。管理者已读取代码和证据，尚未复跑。

审核发现四项限定缺口并已立即回派同Agent修正，notifyOnFinish开启：验证器未把所有探针/对照失败与不完整状态计入最终结果；未激活Sandbox时仍可能向HOME写固定fixture且清理路径不区分本轮会话；同名图片唯一化后PendingAsset仍记录旧名；回滚依靠不完整正则/浅层扫描且把读取失败当无引用，不能证明已发布文件可安全删除。要求严格分层判定、唯一会话与写入前容器检查、实际唯一名称及保守的staging/发布所有权边界，并补最小反例。当前阶段存在即时修正，不作为已验收成果归档或关闭平台票。

### 验收驱动审核与待派任务

管理者读取当前008原型、crossval与审计后manifest，确认旧driver的05跳过前置移除strong步骤、06仍插入单CRLF却执行PM段落split、11把源码单换行用PM split重放。因此这些旧driver输出不能直接作为新样稿的实现判决。

已准备独立workspace `wks_0743d97b1a902aef`，路径 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-012-audited-driver`，分支 `task/INK-PROT-012-audited-driver`，固定起点e5455ef。尚未创建执行Agent：009、010和011即时修正正在占用三个执行槽位，先等待其完成通知。

下一空闲槽位优先委派低成本012，只新增独立驱动/报告，保留旧crossval避免与009/010冲突；按冻结manifest完整动作顺序重放05/06/11全部变体，expected只在操作后读取，禁止把oracle补丁喂进实现制造通过。区分真实UI/PM命令、显式patch演示、源码操作、未实现、驱动错误与oracle动作歧义；11 visual-split的文字动作能否产生指定段落数需独立核对，有疑点记录反例而非改预期。接受可指定新bundle路径，为009/010汇合后重跑准备证据；不改生产、模型或样稿，不宣称UI/IME/磁盘验收。

### 011探针复核、生命周期回收与013接续

- 收到011修正版 `256c30edbfa9230b93b793e9780bd1923350328a`，本地/远端一致、干净。管理者实跑 `make -C prototypes/local-assets check` exit 0，10项既有scratch场景、8项判定自测和真实Sandbox/非Sandbox同fixture对照通过；探针外部open返回EPERM=1，容器内读写成功。管理者本轮生成的证据已留在忽略的 `artifacts/logs/ink-prot-011-manager-check.log`，提交内原证据保持原样，工作区仍干净。
- 仅接受以上受限探针事实：审核发现保存模型先写最终Markdown再发布资源，发布失败可导致原件先变成断图内容；另有未托管相对图片源存在而目标缺失/不同字节时的Save As遗漏。现有绿色检查不覆盖这些反例，因此不接受整个保存模型/平台票。
- 011 Agent `1da3379f-18dd-414b-b036-f8124a95bb67` 已归档，回读closed，archivedAt=`2026-11-08T13:26:49.540Z`，工作区保留。数据提交时序比探针搭建更复杂，接续任务013选GLM-5.3/high，已创建running、notifyOnFinish开启。
- 013 host/agent/workspace：`srv_MEqRNkRW6fSx` / `dad521e7-c0ac-4883-ab1e-8dd7f4b05f13` / `wks_15302ab6dfd393d7`；分支`task/INK-PROT-013-asset-commit-order`，起点256c30e。仅改资源原型，要求验证第2张资源发布失败、资源发布后Markdown失败及未托管引用三类对照，保留所有权和原件SHA证据。该修正优先于待派012，后者继续排队，未重复启动。

### 009首轮交付未接受、010预审修正

- 收到009 `d3c15c789b47be3e7cda3446e9ea8fb9571bcf40`，核实本地/远端一致、干净。但其把含链接段落/标题的源码变为单个可编辑字面文本叶，丢掉链接与同段marks的可视语义，并拒绝列表/引用内链接。字节样稿PASS不能替代原任务体验；本实现未接入008，已立即回派同Agent修正，要求真实link marks/DOM与段落/列表/引用结构、仅图片自身局部原文表示及完整字节证据，失败则如实保留架构反例而非缩减体验。
- 010仍运行。管理者只读预审其尚未提交的main.ts，发现源码态Undo/Redo无条件离开可丢未提交草稿，以及noTextAnchor例外仍重置选区。已发steer要求真实UI路径补证/修正，保留草稿和可信选区，并更正旧05/06/11驱动输出的归因；未将草稿报告视为固定交付。
- 当前三个执行槽位为009即时修正、010接线修正、013资源提交修正。均保留原范围和隔离；M0、平台票14与总体路线均未通过。

### 010固定交付复跑与空文档反例

收到 `8ca296bfd84501f4259800d9beb4e759da32b8b2`，本地/远端一致且干净；原有草稿Undo丢输入路径已加守卫，纯保护块改为owner NodeSelection并明确不是精确文本映射。管理者实跑 `make -C editor/prototypes/fidelity test`，构建/严格类型与28项检查通过。

额外实际重放“默认样稿→主动源码→textarea删空并input→光标0→apply”发现：`sourceMode=true`、`sourceEmpty=true`、`revisionDelta=1`、`pastDelta=1`，随后报 `TypeError: Cannot read properties of undefined (reading 'pos')`。空文档parse没有ranges，noTextAnchor分支先提交内容再访问不存在的owner。此反例说明28项正例不足以证明源码提交边界完整；该提交尚未接入008。

已立即回派同010 Agent限定修正：空/仅空白或引用定义文档的合法空段落锚点，提交前验证选区，删全文/Undo/Redo/no-op/Cancel与纯保护块owner回归；异常时草稿/原文/revision/history必须保持。只重跑受影响检查，不重复未变化的生产111项。原工作区检查后干净，临时链接已清理；012仍排队，尚无执行Agent。

### 010最终交付接收与012派发

- 接收010 `713e9227a242da3a6dae04c98f74160d1b4eb9a3`，核实本地/远端一致、干净；合入008为 `698dbdb9fa10a7d246a1ff36259e5beec17f69ec` 并推送。管理者实际复跑29项原型检查、15项模块检查及02/09/10全部变体；额外四类无正文缓冲（空/空白/仅引用定义/BOM）的提交与Undo/Redo也通过，无半提交。29项含原有草稿保留/纯保护块owner回归，不代表草稿文本级撤销或真实IME完成。
- 新HTML的宿主verify也实际通过，Info/manifest与698dbdb、源/副本SHA一致；未启动App、IME或真实磁盘保存。010 Agent `dfca34b3-7c84-4be5-bb43-1958a791383c` 已归档，回读closed，archivedAt=`2026-11-08T13:37:49.360Z`，工作区保留。
- 012准备分支在创建Agent前从e5455ef快进至698dbdb；首位执行者为GLM-5.3/low `97570f1f-67de-4802-a966-e1a57270e72c`，workspace仍为wks_0743d97b1a902aef。创建回执running后即遭额度错误，尚无代码改动，交接如下。

### GLM配额终止与保留工作区的模型交接

三位GLM执行者均返回系统错误429/type1308：“已达到5小时使用上限”，服务报告重置时间2026-11-09 01:42:27（未另推断时区）。管理者逐一核实status=error、activeTurn=null、无pendingPermissions，随后归档并回读closed，绝非观察超时重启。

| 旧Agent | 归档时间（UTC） | 保留状态 |
| --- | --- | --- |
| 009：76dcc654-9019-45e8-b9f9-06975476f4a8 | 2026-11-08T13:40:57.658Z | HEAD d3c15c7；model/main未提交语义修正保留，含临时依赖链接；旧整段字面化方案仍不接受 |
| 013：dad521e7-c0ac-4883-ab1e-8dd7f4b05f13 | 2026-11-08T13:40:57.698Z | HEAD 256c30e；Model.swift/probe未提交改动保留，尚未验证 |
| 012：97570f1f-67de-4802-a966-e1a57270e72c | 2026-11-08T13:40:57.746Z | HEAD 698dbdb，干净，未产生驱动代码 |

已重新发现profile为空、Codex available及实际model IDs，采用以下接续，均同原workspace/分支、不reset、不创建重复worktree，full-access/default服务档/notifyOnFinish=true：

| 任务 | 新Agent | 模型 | Workspace |
| --- | --- | --- | --- |
| 009 引用链接可视语义 | 5b1a6728-12c9-46b4-ad89-502bcdc12e2c | Codex GPT-5.6-Sol/high | wks_1dfa405440d777d8 |
| 013 资源事务与Save As保全 | a61d140e-4132-4e58-ab01-fdab17e966f4 | Codex GPT-5.6-Sol/high | wks_15302ab6dfd393d7 |
| 012 修订样稿验收驱动 | b4bf1578-0239-48a4-88a4-487802462ed1 | Codex GPT-6-Luna/medium | wks_0743d97b1a902aef |

Host统一srv_MEqRNkRW6fSx。GPT-5.1-Sol当前未列出，5.6为另一明确型号，已向用户说明；复杂语义/事务用Sol，限定驱动用Luna，没有改用6.1。接续提示包含原任务边界、审核反例、固定起点和未提交改动，已创建回执running，不据此宣称模型执行/测试成功；等待完成通知再核查。

### 012 Luna未完成交付与按实际难度升级

Luna Agent `b4bf1578-0239-48a4-88a4-487802462ed1` 已结束，但只新增未跟踪的46行audited-crossval.mjs，未验证、未提交推送，也没有DRIVER-AUDIT。管理者读取确认其中model.apply缺tr、05手供patch、06把文字替换当结构动作、11未实际试验、退出码与路径处理不完整；不作为任务完成或可信矩阵接收。草稿保留供接续检查，原会话已及时归档，回读closed，archivedAt=`2026-11-08T13:45:47.510Z`。

这项工作实际上涉及模式/结构命令、累计步骤依赖与oracle语义归因，已用具体未达标结果确认高于普通脚本执行的难度。改交GPT-5.6-Sol/medium/default服务档，在同一workspace wks_0743d97b1a902aef / 分支task/INK-PROT-012-audited-driver接续；新Agent `353d654a-6628-41c5-8d48-63f131ceca1b`，host仍srv_MEqRNkRW6fSx，notifyOnFinish=true，创建回执running。要求完整driver/实际运行/报告/提交，而非再次只交初稿；不要求原型全绿，不将目标未支持当作driver无法完成的理由。

### 资源提交修正版接收与真实环境专项

- 接收013固定提交 `a60b7b9a513f5949e83aa25ef9b2c99dfa7986e2`，本地/远端一致、干净，修改仅资源原型。管理者实跑 `make -C prototypes/local-assets check` exit 0，14项scratch场景、判定自测、真实Sandbox/非Sandbox对照、非法UUID不写检查均通过；本轮证据留 `artifacts/logs/ink-prot-013-manager-check.log`，原提交内JSON保持原样，工作区仍干净。
- 已核对资源先发布、Markdown最后提交及S11–S14故障/Save As反例。仅接受该受限原型结论：内存journal不支持跨重启，保守图片正则不是通用解析，GUI授权/书签/WK broker/最低系统仍未过。资源分支独立保留，没有向008合并不同产品基线的代码。
- 013 Agent `a61d140e-4132-4e58-ab01-fdab17e966f4` 已及时归档，回读closed，archivedAt=`2026-11-08T13:55:26.345Z`；工作区保留。
- 空闲槽位用于已获用户确认的M0真实WK/中文IME专项 INK-PROT-014，基线 `def2002cd281f567de9adea192c25b1b1673d4a1`，分支 `task/INK-PROT-014-wk-ime-runtime`；host/agent/workspace为 `srv_MEqRNkRW6fSx` / `c5d1a216-1a93-4831-9678-7f8bb7c50848` / `wks_41bdef266cb1ee55`。GPT-5.6-Sol/medium/default档，notifyOnFinish开启，创建回执running。
- 014只改native-host诊断/证据，使用独立原型App，须持生产UI锁并在取锁后desktop preflight，前台App进程结束后由包装器释放锁。系统输入法须真实键序与marked/composition证据，不用注入中文或模拟事件冒充；缺权限/锁屏/工具能力时记录实际未执行，不绕过系统授权。仅内存save不是NSDocument磁盘保存。009/012继续各自执行，014不能宣称验证了尚未合入的009版本或资源票14。

### 真实引用语义与审计驱动接收

- 009最终提交 `70bc4da914bf2e42b86ea5c3b1d3b3004f27c80b`（前一提交62c73cc），本地/远端一致、干净，整段字面化已被真实link mark/DOM、结构与邻近marks取代。管理者实跑build/tsc/28项检查及02/03/10全部变体通过；未重跑生产122项（执行者已报告运行），未运行WK/IME/磁盘。inline目标/正文碰撞、转义仍安全拒绝，图片仅局部原文占位。009 Agent `5b1a6728-12c9-46b4-ad89-502bcdc12e2c` 已归档，回读closed，archivedAt=`2026-11-08T14:02:42.768Z`。
- 012最终提交 `70597e0697cbaeb3df60680496c71213353cbd98`，仅新增3文件，本地/远端一致、干净。管理者实际重跑node语法检查、audited driver（结果写忽略的artifacts/logs/ink-prot-012-manager-results.json）和verify.py557项。runner rc1/NOT_PASS、错误0：source4步PASS、05四步EXPLICIT_PATCH_DEMO；06/11原生结构操作与空文档visual输入失败；11单Enter动作与三段oracle歧义以独立PM/解析计数复现。驱动本身验收通过，不把目标失败当runner未完成。012 Agent `353d654a-6628-41c5-8d48-63f131ceca1b` 已归档，回读closed，archivedAt=`2026-11-08T14:02:32.574Z`。
- 两个任务工作区与固定证据保留。009和010分支的测试数量不能相加称为组合通过；下一任务负责真实手工整合与组合回归。

### 组合集成与动作再审派发

全部使用当前已发现Codex GPT-5.6-Sol、full-access/default档/notifyOnFinish=true，host统一srv_MEqRNkRW6fSx；无profile。当前014真实WK专项仍独立执行。

| 任务 | 固定起点/范围 | Agent / Workspace | 分支与档位 |
| --- | --- | --- | --- |
| INK-PROT-015 链接与选区组合集成 | def2002；合并009的70bc4da与012的70597e0，保留010选区/草稿/空文档与009schema/marks，组合回归，不实现新结构功能 | 95ba831b-bd41-4b5a-b4ed-7b034b19ce0b / wks_fe72da7873a19790 | task/INK-PROT-015-link-selection-integration；high |
| INK-PROT-016 混合换行视觉动作独立再审 | 484ee81；仅fidelity-cases，独立PM/规范推导，保留原三段字节oracle并明确复合动作，新增单Enter语义覆盖，不读原型实现输出 | 23e699cd-6516-44ab-9fcd-fec30b8a3718 / wks_acbfee4074f32dc1 | task/INK-PROT-016-visual-action-semantics；medium |

创建回执running，不据此宣称完成。016不为当前原型失败改预期；015先沿用冻结484样稿，后续接受新审计后再更新动作driver。组合就绪后优先补已证实的原生空文档/结构/marks事务桥接，仍按M0门槛验证而非锁定架构或直接产品化。

测试计数口径已核对：make test-editor排除src/bridge.test.ts（既有111/9文件）；009执行的pnpm --dir editor test不排除Bridge（122/10文件）。这是命令覆盖范围差异，不是本次新增11项回归，也不能以数量判断覆盖提升；已通知015按实际命令分层报告。

### WK运行专项接收与系统IME键码后续

- 014交付 `afe85724a0b98acae7c0810de003b92d7858d2ac`，本地/远端一致、干净，仅native-host六文件。A层真实WK基础路径有条件通过，保护数学块源码插入仍存在真实映射/pending边界；B层因Computer Use逐键路径只出现insertText/isComposing=false、无候选/组合事件，保持未执行。未验证009、生产App或NSDocument。输入源恢复U.S.、App正常退出和UI锁释放已记证据。
- 管理者读取证据与runtime.log（122232B）存在，独立build/verify通过并核对HTML/script/observer hash；未重放桌面操作。014 Agent `c5d1a216-1a93-4831-9678-7f8bb7c50848` 已归档，回读closed，archivedAt=`2026-11-08T14:12:20.055Z`，工作区/日志保留。
- 008已从def2002快进至afe8572，native-host Git tree与交付完全一致，再次verify通过；HTML source/bundle hash仍182fcee/123726e，observer SHA为28f0fa8c…0b33d4f。015基于def2002的核心组合继续执行，交付后以merge接入008保留新native-host，不要求重启/rebase，已发协调消息。
- 新派INK-PROT-017：只读检查公开CoreGraphics键码投递权限，获准时才在受UI锁/preflight保护的隔离宿主验证真实IME；不申请权限/改TCC/借身份绕过，不用Unicode直插/JS事件当组合。缺权限则记录具体事实并保留人工物理键盘验收。当前仅创建回执running，无B层通过结论。
- 017 host/agent/workspace：`srv_MEqRNkRW6fSx` / `d52fdd6b-0a6c-443f-90b3-d335a400fb42` / `wks_1b21c2960cb24ac5`；分支`task/INK-PROT-017-system-ime-keypath`，固定起点afe8572，GPT-5.6-Sol/medium/default档/notifyOnFinish=true。当前执行者为015组合、016独立动作审计、017系统IME路径，均不宣告M0通过。

### 组合、动作审计及键码路径三项接收回收

- 016固定 `5d02043342c6dcb585baf41c069346b15d541fe6`，本地/远端一致、干净。管理者实跑独立PM/CommonMark3项与verify.py：11例49步582项通过；另核对旧visual-split的ops/expected元数据与既有Markdown未改。三段目标明确需要Enter→输入→Enter→前向Delete，新增single-enter两段覆盖。016 Agent `23e699cd-6516-44ab-9fcd-fec30b8a3718` 已归档，closed，`2026-11-08T14:25:11.837Z`。
- 015固定 `97b681ffc87991e66a6b7159ec36440d1a908d6f` 与017固定 `50fae06979013ddcdb5e3242a6e47ae264c33c03`，均核实远端一致、干净，已merge接回008为 `3aab70587837f9d3108b2020c53263d4a40449bc`并推送，保留014 native-host。管理者实跑37组合检查、15模块、02/03/09/10、旧484 audited driver（rc1/NOT_PASS/错误0）及host/probe编译verify通过；没有把旧目标失败变成通过。
- 017只读CGPreflightPostEventAccess为false/rc77，未启动UI或发键；管理者在组合008复跑也得到false/77。输入源保持当时实际Sogou，不强行还原为旧014的U.S.；没有新增授权或改TCC。B层仍需真人物理键盘，不阻止继续自动可做的内核修正，也不假称系统IME完成。
- 015 Agent `95ba831b-bd41-4b5a-b4ed-7b034b19ce0b` 与017 Agent `d52fdd6b-0a6c-443f-90b3-d335a400fb42` 已归档，回读closed，时间分别 `2026-11-08T14:31:02.884Z`、`2026-11-08T14:31:03.047Z`。全部工作区/证据保留；新组合f37dd72没有重跑真实WK，014只覆盖182fcee。

### 原生事务与词法范围两路并行

准备基线 `30b73530af2e8dac37399a0dc9df64f8a9689eb3` = 008组合3aab705 + 独立016固定5d02043。仅018/019工作区含新582项样稿，008当前旧driver仍冻结484，禁止混用版本。两项Codex GPT-5.6-Sol/high、full-access/default档/notifyOnFinish=true，无profile，创建回执running。

| 任务 | 范围 | Agent / Workspace | 分支 |
| --- | --- | --- | --- |
| INK-PROT-018 原生编辑事务保真桥接 | 真EditorView/PM命令自动产生局部patch，补空文档visual、paragraph/list split/join、marks/attrs，并更新driver适配016；不改样稿/native-host/生产 | 753c2e3a-8e25-44b5-bb6d-393e74717f24 / wks_406e1054497d4e77 | task/INK-PROT-018-native-transactions |
| INK-PROT-019 词法原文范围账本 | 只新增source-ledger模块/检查/证据，区分label/href/正文、转义/实体与重复内容，替代猜测性搜索；不接线/不改018现有文件 | df31e64f-b5e5-4228-934b-3a35e3eec64b / wks_271caea7e2d6b9ac | task/INK-PROT-019-inline-source-ledger |

Host均为srv_MEqRNkRW6fSx。两者接口/文件边界已协调，018暂用旧映射保留反例，不等待019；模块通过也不当UI接线通过。后续组合后继续全门槛核验，当前不锁架构，不宣告M0或路线完成。

### 独立推进保存与历史平台事实研究

018/019经实时状态核实仍running且无待授权，保留执行；前一轮为verified wait。无前置依赖的路线研究16现由INK-RES-002领取，与内核文件不重叠，避免把后续平台事实积压到M0结束后。

- Host / Agent / workspace：`srv_MEqRNkRW6fSx` / `e431defb-395c-4856-99a9-ecd243d4d252` / `wks_3bc8ea24dc2e43d2`。
- 分支：`task/INK-RES-002-save-history-platform`；worktree：`/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-res-002-save-history-platform`；固定生产起点36e6365。
- 本次list_profiles为空，已实时核对list_models/inspect_provider后用`codex/gpt-6-luna`、medium、full-access、service_tier=default、notifyOnFinish=true；这类资料整理用经济档，不升级6.1-Sol。当前仅创建回执running。
- 限定只新增一份研究Markdown，以Apple一手文档及固定代码区分事实、现状、建议和待签名Sandbox实验。对比系统管理/应用检查点，核实保存失败、位置不支持、Save As/移动、旁置图片、保留容量与卸载迁移；不启用autosavesInPlace、不改产品或依赖、不做桌面/真实用户文件操作。
- 接收时核查实际来源与代码引用、研究缺口及分支推送；未取得平台实验不能称系统版本或macOS14验收通过。完成后当轮回收Agent并保留证据工作区。

INK-RES-002首轮`28d5ab0731414c20c5f1cec6c146322509f91cb7`已推送且干净，但验收未通过：遗漏NSDocument自带`browseVersions(_:)`浏览器，把系统浏览界面概括为需应用自建；未说明`preservesVersions`与`autosavesInPlace`组合约束。管理者实际读取Apple官方DocC JSON确认浏览器入口与配置限制，已把具体来源及限定修正交回同Agent（message `ac9f4914-8cac-44d9-b601-b02ecd7145e0`）。还要求核实生产所用completion保存API与writeSafely契约、修正代码引用和研究基线措辞。此时研究16保持claimed，不把初稿或文档检查通过当事实验收完成；Agent继续修订而非闲置等待。

### 019模块与保存历史研究接收

- INK-RES-002修订为`3fad2d05591966aa0d8d2301426bc80c98b2b301`，仅研究文件。管理者核对官方browseVersions/preservesVersions/save/writeSafely DocC正文及生产代码引用，退回项已修正，diff检查/本地远端一致/干净；研究16据此resolved，真实Sandbox、最低系统与方案选型仍未完成。Agent `e431defb-395c-4856-99a9-ecd243d4d252` 已归档回读closed，`2026-11-08T14:48:21.052Z`，工作区保留。
- 019固定`738e5e0583e2f19f2ec2fa4e71cbf7fa10f43cd0`，仅新增source-ledger模块、检查脚本、严格TS配置、证据四文件。管理者实跑严格tsc、8组来源断言及verify.py582项通过；核对测试按独立拼装原文span定位，不以旧贪心或仅往返自洽当预期。引用目标/标题/正文碰撞、转义/entity、Unicode边界、方向和显式affinity有模块级证据，未接入model/main/selection-map/HTML。
- 019多行定义、复杂lazy continuation/delimiter、hardbreak等仍未覆盖；最坏O(n²)与逐grapheme内存成本明示，不能直接称通用source map或生产可用。失败必须保留当前视图/缓冲并明确阻断该操作，未来接线禁止自动整篇源码化或默认nearest吸附。
- 019本地/远端一致且干净，临时依赖链接和打包已清；Agent `df31e64f-b5e5-4228-934b-3a35e3eec64b` 已归档回读closed，`2026-11-08T14:49:31.553Z`。未合入008，待018交付后统一组合；没有为模块任务重复生产/桌面/IME/磁盘测试。

### 接线前补齐代码块及结构定位覆盖

管理者额外将019账本作用于冻结样稿所有input：除05之外均能build（不等于所有坐标已验收）；05在围栏代码块失败，`范围 72..100 有 PM 文本但没有可审计 inline token`。这是模块当前能力边界，阻止直接全量替换旧sourcePosition。初次只读检查因错误使用两位case目录名报ENOENT，改用manifest完整case.id后获得上述真实结果；临时打包与依赖链接均已清理。

据此新派INK-PROT-020，只改019模块/检查/证据，补围栏与缩进代码块、hard_break原子节点及空结构有语义的插入锚点；不改018的model/main或冻结预期。不以默认nearest、猜文档头或整篇源码回退绕过。保留019已知复杂语法/最坏复杂度风险，测量与覆盖分别说明。

- Host / Agent / workspace：`srv_MEqRNkRW6fSx` / `bfe9a6d2-4a92-44e1-b4bf-5c660b4de968` / `wks_07b742c264f1b9b9`。
- 分支`task/INK-PROT-020-ledger-block-coverage`；worktree`/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-020-ledger-block-coverage`；固定起点738e5e0。
- list_profiles仍空，实时inspect_provider后用Codex GPT-5.6-Sol/medium、full-access/default档、notifyOnFinish=true；限定接口/已证实缺口使用中档推理，不默认6.1-Sol。当前仅创建running回执，未有通过结论。018继续独立原生事务任务，未来再统一组合。
