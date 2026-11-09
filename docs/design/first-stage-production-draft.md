# 首阶段基础功能生产化草案（INK-SPEC-033）

状态：**草案（draft）**。本文为 M0 架构决策（票 12）尚未完成前的准备性草案，不宣告任何架构已采纳，不构成 ready-for-agent 的可执行工单；正式规格（to-spec）与实施任务（to-tickets）须待 M0 收尾与架构票 12 决定后，以本文为输入转写并复核。

基线：产品 main `48258a93b3fc4a75df21a22ac0d175e01943b744`（本文所有"已合 main"均指此 SHA，除非另行标注）。

## 1. 草案状态与依赖

### 1.1 M0 状态（不得推断为已通过）

依据 M0-CLOSURE-CHECKLIST（规划分支执行记录）：

- 已通过：冻结范围自动矩阵及独立反例；真实 WKWebView 空格停住保存、源码 no-op、保存点新 epoch 续写；物理中文上屏的 Undo/Redo（最近两次）及普通 Space；保护数学片段保持；真实 WK 源码草稿旅行保护、提交/跨模式 Undo/Redo/内存保存点；U1（真实 WK 未闭合公式→保存拒绝→主动修复→恢复→Undo/Redo）已在固定 bundle 关闭。
- 剩余：H1（真正取消一次中文组合）、H2（选区内中文替换的原子历史）、H3（源码区物理中文与组合边界）三项物理键盘证据，用户正与管理者验收中。**本文不推断其已通过。**
- 架构票 12（依据原型证据确定保真架构是否采用）状态 open，blocked by 原型票 11；05（实时渲染与源码交互票）依赖 12。因此本文所有依赖"唯一当前原文 + 派生投影"模型的条目均标注"待架构决策"。

### 1.2 已合 main 的非 UI 证据（48258a9）

PR #70（写作辅助：大纲、统计、标题定位、查找面板、源码/只读导航、可编辑源码原子替换）已完成双轴审查并 squash 合入 main：

- 干净 editor 目录 18 文件 / 315 项非 UI 测试（含 bridge）通过；独立 27 项冻结控制通过；lint/build 通过，TypeError=0。
- 默认 CI（lint、非 UI 层、Release 离线资源检查、轻量基准 warn-only）实际 success；UI 套件与完整启动基准 skipped。
- 当前合并版本的完整写作辅助尚未做真实窗口验收。早期面板版本 `3047c55` 曾在真实 App 中核对统计、Undo/Redo 和收起/展开，证据见规划分支 M1-004 执行记录；该局部历史观察不覆盖最终 `48258a9` 的标题定位、查找替换、滚动、IME 或辅助功能。

### 1.3 原"SaveBarrier"指称核实

任务指称的 "Swift SaveBarrier" 在产品源码中无同名类型。实际存在的对应机制是：

- 概念文档 `docs/save-barrier.md`（revision 门槛 snapshot + NSDocument 串行提交）；
- 实现 `app/Sources/InkoraDocument.swift` 的 `PendingSave` 队列、`processNextSave()`、`persist(_:for:)`、`validateOriginalForSaving()`、`DocumentDiskVersion` 提交后字节校验与 `confirmSaved` 回路；
- Web 侧 `editor/src/main.ts` `createSnapshot` 分支（composition 未收口时拒绝 `editor_not_ready`）与 `bridge.ts` 的 `EditorProtocolSession`。

后文统一使用"保存屏障（save barrier，见 docs/save-barrier.md）"指称此机制，不引用不存在的类型名。

## 2. 状态契约（目标形态）

以下为目标契约草案。核心原则来自冻结原型契约（`6e6e2b8` 的 docs/prototypes/source-authority/CONTRACT.md）与 028 共识：**禁止混用原型的内存保存点与 NSDocument 磁盘保存**——前者只证明保存点语义，后者是唯一被承认为"保存"的层。

| 契约项 | 内容 | 当前生产（48258a9） | 原型证据（493e2b7） |
| --- | --- | --- | --- |
| 单一当前原文 | 唯一公开内容权威；每个已接受编辑原子更新，含 BOM/EOL/尾随空格/空行 | 无。权威是 PM `ProseMirrorNode`（`editor-session.ts` `savedDocument`/`doc.eq` 语义比较）或 SourceEditorRuntime 的 `savedText` | `SourceAuthorityController.currentRaw`，已验证 |
| 派生语义/PM 投影 | 原文的派生解释；不能反向覆盖原文；与语义 AST 的差异须有原文范围/锚点证明 | PM doc 即权威，序列化经 markdown-codec；投影无需 provenance | provenance 审计投影，冻结范围内已验证 |
| 来源账本/UTF16 与字节 | 原文 UTF-16 边界选区 + UTF-8 字节预期；不盲找相同文本、不静默 nearest | source-search/source-navigation 已有 raw↔textarea 映射与方向选区（仅源码路径） | raw span/affinity/anchor 审计已验证 |
| saved 基线 | 最后成功保存的同一原文；documentDirty 仅由逐字节差决定 | 结构化路径使用 `doc.eq(savedDocument)`；源码路径已精确比较 currentText/savedText。在有效UTF-8且保留BOM/EOL、不归一化的范围内，原文字符串相等可表达相同字节；缺口是跨模式统一权威，不是否认源码路径既有保真 | `savedRaw` + 精确原文比较，另有UTF-8字节oracle（内存层） |
| source 草稿 | 未提交源码草稿有独立 draftDirty 与保存阻断，不冒充已接受内容 | 无独立草稿态；SourceEditorRuntime 直接编辑全文 | `draft`/`draftDirty`/`saveEligible`，已验证 |
| diagnostic 状态 | 瞬时拒绝诊断与内容分离；无可旅行历史的 Undo/Redo 不得假造清错误 | markdown-safety 结构化保存闸门（静态分析） | 真负例（pending math、保护内未映射、过期事务等）已验证 |
| session 状态 | 选区、composition、未解决意图、投影位置依据与历史；不能被 Save 偷偷重置 | `InkoraEditorSession` 有 composition 快照与 revision；Save 期间 closeHistory（选区/内容不动，符合部分要求） | 完整会话契约已验证 |
| history | 版本在接受字节变更及真实 Undo/Redo 后推进；Save 不是编辑；新 epoch 不恢复旧 Undo 栈 | PM history；SourceEditorRuntime 对普通input与替换均维护 undo/redo 栈，但未统一跨模式历史；重开即新栈 | 已验证（含跨模式 Undo/Redo） |
| composition | composition 期间保存/切换/重置/旅行守卫；拒绝不得破坏 marked text | `createSnapshot` 拒绝路径 + session beginComposition/endComposition（内存层） | 守卫真负例已验证；物理取消/选区替换/源码区中文待 H1/H2/H3 |

### 2.1 原型依赖的生产化风险

- **绝不整体搬运 `editor/prototypes/source-authority/` 目录进 `editor/src`。** 原型 `core.ts` 是有界验证实现（冻结 oracle 范围），其 projection comparator 与单尾随空格 shadow→raw 表不是完整 Markdown 映射；复杂表格、完整输入规则、跨块任意事务和性能未验（原型 RESULTS.md 自述）。
- 生产化必须把契约语义移植到生产接缝（main→runtime/session→Bridge），并以生产测试入口（315 项套件所在 vitest 体系）重写断言，复用冻结 ORACLES 的**预期数据**而非原型代码。
- 原型的 `saveMemory()`/scratch 文件不是 NSDocument；迁移后 `savedRaw` 基线必须由保存屏障的 `snapshotReady→NSDocument safe-save→markSaved` 回路驱动，Node scratch 证据层级不随之转移。
- schema 侧风险：生产 `schema.ts` 无表格节点、无任务列表、无图片节点、无公式/Mermaid/脚注（仅 markdown-safety 闸门 + protected_block）。表格当前是 `protected_block` 原子块（protected-markdown.ts），**不是直接编辑**。这些是首阶段最大的"待实现"面。

## 3. 首阶段能力范围（用户已定，不可缩减）

依据 03-first-milestone 用户确认。**必须覆盖**：

1. 中文/标题/列表/引用/代码/链接：常规编辑。
2. 表格与任务列表**直接编辑**（不回退保护块）。
3. 本地图片插入/显示、旁置资源首次保存及 SaveAs/迁移恢复（按 06 政策：文档名.assets、相对路径、未命名文档草稿区、Save As 复制托管资源）。
4. 主动源码查看/编辑入口（composition 守卫外总可达）。
5. 已合的大纲、字数统计和源码查找替换保留；**新增可视编辑模式的当前文档查找替换**。后者当前尚未实现，不能以保留源码功能代替。
6. 常用代码离线高亮与语言选择。
7. 公式/Mermaid/脚注先以受保护原文片段混排；异常时保留当前可视、阻断不安全保存、提供主动源码修复入口；不自动整篇源码化。

**不扩入**：文件树、跨文件搜索、专注模式、自定义主题、PDF/HTML/Word 导出、高级语法完整渲染、代码行号/折叠、AI。

## 4. 最高可验证接缝

按 07-quality-gates 分层；不能用纯函数/内存演示当完成。

| 层 | 接缝 | 证据入口 |
| --- | --- | --- |
| Web 运行时 | `main.ts` `window.inkora.receive` → `createEditorRuntime` → runtime/session | 既有 vitest 套件（editor 18 文件/315 项体系） |
| Bridge | `createSnapshot`/`markSaved`/`executeCommand`/`loadDocument` + revision 门槛 | `bridge.test.ts` + Swift `BridgeProtocolTests` |
| 原生保存 | `InkoraDocument` PendingSave→snapshotRequester→`super.save`→`DocumentDiskVersion` 校验→`confirmSaved` | `InkoraDocumentTests` |
| 资源 | （待建）资源 broker 接缝：06 政策的复制/授权/冲突规则挂在首次保存与 Save As 路径上 | 图片平台原型票 14（并行开发中） |
| 真实环境 | 真实 WKWebView + 系统 IME、最小 macOS 14、VoiceOver 分层记录 | 既有 UI 测试入口（`tests/InkoraUITests`），须持 UI 锁 |

## 5. 推荐纵向交付切分

少量可独立验收的纵向切片（每片穿过第 4 节接缝直达磁盘/真实视图），不按水平模块拆分，不产生几十个小票。顺序即真实 blocking edges：

**V1 内核权威迁移（第一个生产编辑闭环）**
打开/可视编辑（中文、标题/列表/引用、代码、链接）/保护片段邻接/主动源码往返/跨模式 Undo/Redo/正式 NSDocument 保存并重开。内容权威从"PM doc 语义"迁到"唯一当前原文 + 派生投影"（待票 12）。既有大纲/统计/查找替换在此迁移中必须保持可用（它们读 `getText()`/raw，契约上反而受益）。**出口：无修改保存字节一致；局部修改保留其余字节；源码 no-op 不变任何状态；保存点由保存屏障驱动。**
Blocking edge：票 12 未决则 V1 生产实施不得开工；H1/H2/H3 是当前票12的真实前置，不能以“只阻塞验收”为名绕过。独立图片平台验证和规格草案可以继续，不依赖V1完成。

**V2 高级片段与异常边界**
公式/Mermaid/脚注受保护混排 + 畸形/含混的"保留可视 + 阻断不安全保存 + 主动源码修复"。多数真负例在原型已验证，生产化为 markdown-safety 闸门与投影的整合。**依赖 V1。**

**V3 表格与任务列表直接编辑**
schema 新增表格/任务节点 + 输入规则 + 原文映射（从 protected_block 升级为可编辑投影）。普通合法表格与任务列表必须能直接编辑，不能用保护块或拒绝正常操作代替交付；真正含混或未支持方言的边界按V2保留原文并说明。**依赖 V1（映射契约）**；是首阶段最大新功能面。

**V4 本地图片**
插入/显示/旁置资源/首次保存/SaveAs/迁移恢复，按 06 政策挂在保存屏障与（待定的）资源 broker 上。**依赖 V1 保存点语义；与图片平台票 14 并行开发协调，14 的拖放/粘贴/书签/WK 未验证项是本片外部依赖。**

**V5 代码高亮与语言选择**
常用语言离线高亮（只读呈现，不改写源码）+ code_block 语言选择交互。**依赖 V1；与 V3 并行可行。**

**V6 可视查找替换**
可视正文、链接显示文字、格式文本和代码内容的字面查找、定位、单个与全部替换；保留既有源码原文字面搜索的语义和能力。可视命中必须从显示文本经provenance映射到真实PM/原文范围，不能只拿raw字符串匹配位置猜测；实体、转义、重复文本、跨格式边界须单独验收。替换通过统一编辑意图/事务接缝，一次全部替换只形成一个Undo单元，保存重开精确保留非目标字节。

高级保护片段的内部修改仍须用户主动进入源码；不可安全定位或替换的命中要明确说明，不自动切模式、不伪造成功、不静默部分执行“全部替换”。实际可视搜索范围、原文搜索范围和结果数量含义在正式规格中固定，不能把两者混为一套偏移。**依赖V1映射/历史契约及V2片段资格规则，可与V3/V5开发并行；V3/V4交付后须增补各自内容的查找联动。**

每片沿用既有测试入口；真实 WK/IME/macOS 14/VoiceOver 证据按 07 分层在片验收时集中取得，不放进默认 PR CI。

## 6. 逐功能状态矩阵

状态取值：已合main（48258a9 有代码+非UI测试）/ 原型证据（493e2b7 冻结范围验证）/ 待实现 / 待验收。

| 能力 | 已合main | 原型证据 | 待实现 | 待验收 |
| --- | --- | --- | --- | --- |
| 中文常规编辑（PM 路径） | ✔ composition 会话/快照 | ✔ 物理上屏 Undo/Redo | — | H1/H2；真实 WK IME 全链 |
| 标题/列表/引用/代码/链接编辑 | ✔ schema+输入规则+非UI测试 | ✔ repeat vectors（heading/list/quote/link/marks） | 保真迁移和既有行为兼容 | 当前完整版本的真实交互 |
| 唯一当前原文权威 | ✘（语义 doc.eq） | ✔ currentRaw 契约 | V1 全部 | 票 12 |
| 统一原文 saved 基线/dirty | 源码路径已有精确原文比较；结构化为语义比较 | ✔ savedRaw/draftDirty（内存） | V1 接保存屏障、统一跨模式 | NSDocument 层 |
| 主动源码入口/往返/no-op | 部分（源码导航/替换在 textarea 路径） | ✔ source_enter/apply/cancel 守卫 | V1 整合进统一权威 | 真实 WK H3 |
| 跨模式 Undo/Redo | ✘ | ✔ | V1 | — |
| 表格直接编辑 | ✘（protected_block 原子） | ✘（原型明示未验） | V3 | — |
| 任务列表 | ✘ | ✘ | V3 | — |
| 本地图片 | ✘ | ✘ | V4 + 平台票 14 | 14 的拖放/粘贴/书签/WK 未验项 |
| 大纲/字数统计 | ✔（document-analysis，非UI） | — | — | 真实 UI；V1 迁移不丢失 |
| 当前文档查找替换 | 源码查找/替换及只读导航✔；可视仅原文计数/预览 | 原型映射能力不等于已实现可视搜索 | V6可视正文/代码查找、定位与原子替换 | 两种搜索语义、真实UI、V1迁移兼容 |
| 代码高亮/语言选择 | ✘（code_block 无高亮） | ✘ | V5 | — |
| 公式/Mermaid/脚注混排保护 | 部分（markdown-safety 闸门 + protected preview） | ✔ pending math/修复链（真实 WK U1） | V2 生产化 | UI 层 |
| 异常保留可视/阻断保存/主动修复 | 部分（safety 闸门拒绝结构化保存） | ✔ 真负例组 | V2 诊断交互 | — |
| 正式保存/重开/冲突/恢复 | ✔（InkoraDocument+保存屏障+RecoveryStore，Swift 单测） | ✘（scratch 层，不转移） | — | 真实文件生命周期场景（07 矩阵） |

### 6.1 验收场景要点（摘自 03/07，转正时展开为完整矩阵）

- 固定中文技术样稿：打开→编辑→保存→重开，内容/结构/资源逐项对应；无修改保存字节一致（UTF-8 hex 比较）。
- 失败保留：composition 期保存拒绝不改 marked text；未闭合高级语法阻断结构化保存但原文/投影/选区/历史不变；保存失败不 markSaved、旧文件不动。
- 选区/历史不变：源码往返选区方向与锚点保持；Undo/Redo 跨模式一致；重开新 epoch 只撤新输入。
- 依赖矩阵：V1←票12；V2←V1；V3←V1；V4←V1+票14；V5←V1；V6←V1+V2（并在V3/V4交付后联动验收）；所有片验收←07分层证据。平台验证与草案准备不被V1阻塞。

### 6.2 退出条件与风险

- 退出条件（首阶段）：03 范围全能力 + 07 表格六维度（编辑保真/文件生命周期/图片资源/原生输入法/键盘辅助功能/系统显示）全部"通过"；存在未解决数据丢失、composition 破坏、整篇源码化、选区/撤销错乱、Sandbox 越权反例时不宣告。
- 风险：① 票12若不采纳当前有界实现，回到同一原文权威契约下的投影表示比较；本草案本身已是原文主数据，不把它误写成与自身竞争的另一条路线；② H1/H2/H3若暴露真实反例，保留原始证据并修对应边界；③ 表格/任务映射复杂度可能触发raw-span/锚点与规范化投影的比较；④ 图片平台票14未验项可能阻塞V4验收；⑤ 当前完整产品版本的真实交互证据尚不充分，早期局部观察不能外推；⑥ 性能预算票15未测。

## 附录 A：基线源码引用（绑定 SHA 48258a9…）

- `editor/src/main.ts` — Bridge 命令分发、createSnapshot composition 收口、面板/查找调度。
- `editor/src/editor-session.ts` — `InkoraEditorSession`：revision/dirty(doc.eq)/composition 快照/markSaved closeHistory。
- `editor/src/editor-runtime.ts` — `createEditorRuntime` 三路选择（Structured/Protected/Source/ReadOnly）；SourceEditorRuntime 的 raw↔textarea 映射、替换历史、标题定位。
- `editor/src/bridge.ts` — `EditorProtocolSession`、revision 门槛、错误恢复动作。
- `editor/src/source-search.ts` / `search-panel.ts` / `source-replacement.ts` — 查找、面板、原子替换计划。
- `editor/src/document-analysis.ts` / `document-analysis-panel.ts` — 大纲/统计。
- `editor/src/protected-markdown.ts` / `markdown-safety.ts` / `markdown-codec.ts` — 保护块、安全闸门、编解码。
- `app/Sources/InkoraDocument.swift` — PendingSave/processNextSave/persist/validateOriginalForSaving/DocumentDiskVersion/Recovery 回路。
- `app/Sources/EditorViewController.swift`、`app/Sources/DocumentDataWriter.swift`、`docs/save-barrier.md` — 保存屏障概念与落点。
- 原型（只读引用，git show）：`493e2b7:editor/prototypes/source-authority/{core.ts,main.ts,RESULTS.md}`；冻结契约 `6e6e2b8:docs/prototypes/source-authority/{CONTRACT.md,ORACLES.json}`（oracle SHA256 c53b2f9c…d08）。
- 规划指针（只读）：INK-PLAN-005 .scratch/typora-parity 的 issues/03、04、06、07、12 与 execution/M0-CLOSURE-CHECKLIST.md、M0-source-authority-consensus.md、M1-014-integration-ci.md。
