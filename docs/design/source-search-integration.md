# 查找界面接入契约（source-search-integration）

固定基线：`daec0f6c2f32b815c9da152e60d70d2c501f3a06`（task/INK-M1-005-panel-runtime-review）。本文全部行号证据均指该提交。本契约把"原文查找/导航"与"安全替换"拆成两个独立交付阶段，并如实列出当前生产接口缺什么。不假定任何实验性 source ledger 已进入生产：在基线上检索 `sourceMap|sourcePos|sourceRange|posTo|offsetTo` 于 `editor/src` 零命中，生产不存在通用 raw→ProseMirror 位置映射。

## 1. 生产现状（代码证据）

### 1.1 已有：纯函数原文查找替换内核

`editor/src/source-search.ts`（INK-M1-002 交付，`docs/source-search.md` 同步）：

- 快照 `{ raw, revision }`（source-search.ts:4），公共 API 按值捕获，结果绑定快照（source-search.ts:125-127）。
- `searchSource` 字面量、大小写选项、上限默认 10000、`truncated` 显式标记（source-search.ts:32-45,106,199-244）。
- 拒绝切断 surrogate/字素/CRLF 的匹配，BOM 不可作为正文替换（source-search.ts:20-24）。
- `findSourceMatch` 支持前向/后向、回绕、越过当前选区匹配；非法选区抛 `SourceSearchError("invalid-selection")`（source-search.ts:264-319,256-260）。
- `planSourceReplacement` / `planSourceReplaceAll` 返回完整降序 patch 计划或稳定失败码，失败保留原始意图、绝不返回部分计划（source-search.ts:86-93,445-490,492-536）。

该模块无 DOM、无编辑器状态依赖，可直接被查找面板复用，不需要改它。

### 1.2 已有：三种运行时与快照通道

- `EditorRuntime` 接口只有 `getText/markSaved/undo/redo/focus/destroy/status/composing`（editor-runtime.ts:15-24）。
- `StructuredEditorRuntime`（ProseMirror）：`getText()` 在 dirty 时整体 `serializeMarkdown` 回原文（editor-runtime.ts:72-77）。结构化模式的文档位置是 PM pos，与 raw UTF-16 偏移之间没有任何映射（见开头检索证据；`structuredInput` 还会把 CRLF 折叠成 LF，line-endings.ts:10-12，进一步保证两套坐标不可直换）。
- `SourceEditorRuntime`（textarea）：textarea 持有逐字节原文（EOL-003 注释，editor-runtime.ts:208；kernel 保真，editor-kernel.ts:124-137），**raw 偏移可直接映射 textarea selectionStart/End**；undo 是整文快照栈，一次 `replaceText` 天然形成单个撤销步（editor-runtime.ts:146-151,201-205）。
- `ReadOnlyEditorRuntime`：bare CR 文档整篇只读（editor-runtime.ts:209-229；运行时分派 editor-runtime.ts:231-268；原生侧同判 InkoraDocument.swift:137，保存被拒 InkoraDocument.swift:267,314-317）。
- Bridge 快照通道 `createSnapshot` 只返回 `(documentID, revision, text)` 整文，无任何位置信息（bridge.ts:238-261；原生侧 EditorBridge.swift:322-363）。

### 1.3 已有：修订与文档身份

- Web 侧每次真实文档变更 bump revision（editor-session.ts:172-175）→ `recordChange` 发 `stateChanged`（bridge.ts:198-209）。
- `executeCommand` 校验 documentID 相等且 revision 严格相等（bridge.ts:291-306）；快照通道容忍 revision 落后（bridge.ts:247-252）。
- 原生 `bridgeDocumentID` 每次 reopen/bareCR 转换都换新 UUID、revision 归零（InkoraDocument.swift:50,149-157,568-569），`editorDidChangeState` 只接受同 documentID 且 revision 不落后的状态（InkoraDocument.swift:329-336）。**同 revision 异文档**由 documentID 区分，查找状态必须同时绑定二元组。

### 1.4 已有：composition 防线与分析面板范式

- 结构化：composition 期间 undo/redo 拒绝（editor-session.ts:141-149），状态汇报用 composition 前文档（editor-session.ts:103-113）；快照在 composition 未收口时报 `editor_not_ready/retry`（main.ts:130-151）。
- 源码模式：undo/redo 在 `kernel.composing` 时直接 false（editor-runtime.ts:175-191）。
- 分析面板已建立可复用范式：只由真实 `stateChanged` 驱动、composition 期间保留上一份稳定结果、异常隔离在面板内不冒充 Bridge 错误（main.ts:63-86）、面板自身不碰焦点/选区、明确不冒充定位能力（document-analysis-panel.ts:3-10）。

### 1.5 缺失（生产没有的东西）

1. **raw→PM 可视位置映射**：结构化模式无法把 raw 匹配定位到 PM 选区/滚动位置。`document-analysis.ts` 的"归一化副本+索引还原"（document-analysis.ts:3-15）只服务只读统计，解不出 PM pos。这是可视定位/替换的硬前置，不能用 `text` 首次 find 或全量 `serialize/setText` 伪造。
2. **查找 UI**：无任何 find 面板/菜单项/快捷键。菜单验证只有 save/undo/redo（AppDelegate.swift:209-212；EditorViewController.swift:163-172）。
3. **Bridge 命令面**：`NativeCommand` 仅 5 种（bridge.ts:28-64），无打开查找/应用计划类命令；`EditorCommand` 仅 undo/redo（bridge.ts:3）。
4. **保护区可编辑性**：`analyzeMarkdownSafety` 判定 raw_html/math/front_matter 等风险（markdown-safety.ts:3-16），结构化模式对这些片段走 source 匹配可行（raw 覆盖全文，docs/source-search.md），但**反向**（PM 内编辑这些片段）仍不可行。

## 2. 契约：阶段 A —— 查找面板与结果列表（可先行交付）

### 2.1 行为定义

- 打开：菜单 Find…（⌘F）/ 关闭：Esc 或 ⌘F 再按 / 按钮。面板常驻隐藏切换，不随文档切换重建。
- 输入：查询文本（字面量，无正则）；大小写开关（默认敏感，与 searchSource 默认一致）。
- 结果：`n 处匹配`；`truncated === true` 时显式显示"结果超过上限，仅显示前 N 处"（source-search.ts:106 默认 10000，面板可用更小 `maxResults` 但必须同样提示）。`rejected` 非空时不计入 n，不显示为可定位条目。
- 空查询：显示 0 处，不发导航。
- 状态过期：面板持有 `(documentID, revision, query, caseSensitive, result)`；任何 `stateChanged`（revision 变化或 documentID 变化）使结果标记过期，输入不变时按新 raw 重算（复用 scheduleAnalysis 的 generation/cancel 防竞态模式，main.ts:52-86）。composition 进行中沿用上一份稳定结果，不用半拼音文本重搜（同 main.ts:66 的既有约定）。
- 焦点安全：打开面板允许聚焦输入框；composition 进行中打开面板不得强制夺焦（textarea/PM 均可能正在组合），可先呈现面板但保留编辑器焦点，组合结束再让用户点击。Esc 关闭面板后按 runtime 类型决定是否 `focus()` 回编辑器。
- 导航不改 dirty/history：阶段 A **不提供**"上一处/下一处跳转定位"，仅列表与计数。回绕、方向键语义推迟到阶段 B，避免渲染无法兑现的按钮。

### 2.2 三种运行时的差异（阶段 A 实况）

| 运行时 | 搜索 | 计数/列表 | 定位 | 替换 |
|---|---|---|---|---|
| Structured（PM） | 可（raw 快照） | 可 | **不可**（无映射，显示"当前模式无法定位"） | 不可 |
| Source（textarea） | 可 | 可 | 可（阶段 B，raw 偏移=textarea 偏移） | 可（阶段 C） |
| bare_cr 只读 | 可 | 可 | 可（只读选区，阶段 B） | 不可（保存本被拒，InkoraDocument.swift:314-317） |

不可定位时必须显式说明并禁用相应按钮，不渲染虚假控件；这不是可绕过的 UI 细节，而是"未找到可靠映射的结果应明确不可定位"的产品诚实性要求。若产品要求结构化模式可定位/替换，正确路径是先立项 raw↔PM 映射接口任务（阶段 D），而非宣布完成。

### 2.3 最小接缝草案（阶段 A，非代码改动承诺）

1. 新增 `editor/src/search-panel.ts`：DOM 组件，仿 `document-analysis-panel.ts` 的安全 API 约束（createElement/textContent、无 HTML 注入、无焦点副作用）；状态机 `empty|results(documentID,revision,query,caseSensitive,matches,truncated)|error`。
2. `main.ts` 增加调度：`postToNative` 中 `stateChanged` 分支同时驱动 `scheduleSearch` 与既有 `scheduleAnalysis`（main.ts:96-98）；搜索与面板分析一样完全在 Web 侧，不新增 Bridge 消息。
3. raw 快照来源：`runtime.getText()` + `stateChanged.state.revision`，与 `scheduleAnalysis` 取 `activeRuntime.getText()` 同源（main.ts:75）。这是"用 text 做搜索快照"，不是用它做位置映射，符合禁令。
4. 原生入口（可选，二选一，推荐 a）：
   a. Web 侧 keydown 监听 ⌘F（无协议改动，最小接缝；风险：与原生菜单键位冲突需在 App 层让位）。
   b. 新增 additive `NativeCommand` 类型 `openSearch`（带 requestID 走 `claimRequest` 去重，bridge.ts:308-314），EditorViewController 菜单项经 `sendImmediately` 下发（EditorBridge.swift:637-675）。协议版本仍是 1，但旧编辑器会以 invalid_message 拒绝新命令——本仓库原生与 Web 同 bundle 发布，无版本漂移；若未来考虑混布需升版本。
5. 状态归属：查询/大小写/结果/过期标记全部归 Web 侧 search-panel 模块私有；不进 `EditorProtocolSession`（其只管 document/revision 事实）；不持久化到磁盘；`loadDocument` 接受新文档时面板整体重置为 empty（main.ts:114-129 是重置钩子点）。
6. 错误归属：`SourceSearchError`（仅 `invalid-selection`，阶段 A 不触发）与内部异常一律落面板 error 态，不发 `editorError`、不触发 `stop_saving`（对照分析面板约定 main.ts:78-84 与 recoveryActionFor bridge.ts:159-172——查找失败不是保存安全问题）。

## 3. 契约：阶段 B —— 源码模式/只读模式的查找导航

- 输入：面板当前结果的 matchIndex；操作：上一处/下一处（可回绕，语义直接复用 `findSourceMatch` 的 wrap 与越过当前匹配规则，source-search.ts:264-319）。键盘：Enter/Shift-Enter 上/下一处，回绕发生时可给轻量提示。
- 生效范围：仅 Source（textarea）与 bare_cr 只读两种运行时。raw 偏移直接写 `selectionStart/selectionEnd`（+滚动到可见），无需映射层。
- 前置校验（每次导航）：`documentID/revision` 仍与结果绑定一致，否则丢弃结果回到阶段 A 过期态；`runtime.composing === true` 时不改选区（组合串内移动选区会打断 IME，等同 editor-session.ts:141-149 的拒绝语义），排队到 compositionend 后执行或提示。
- 导航绝不产生 transaction/undo 步：textarea setSelection 不入 undo 栈（kernel 只在 text 变化时入栈，editor-runtime.ts:146-151）；只读模式无栈。
- 结构化模式：按钮禁用 + 明示原因（见 2.2）。

## 4. 契约：阶段 C —— 源码模式原子安全替换（依赖 B）

- 入口：单个替换 / 全部替换，仅 Source 运行时。bare_cr、结构化、编码错误视图一律无替换入口。
- 计划：`planSourceReplacement(search, current, matchIndex, replacement)` / `planSourceReplaceAll(...)`（source-search.ts:445-536）。`current` 必须取**应用时刻**的 `(runtime.getText(), 当前 revision)`，不允许用面板缓存的 raw 直接应用。
- 原子应用：拿到 ok 计划后一次性 `resultRaw` 写入（走 `SourceEditorRuntime` 的整文替换路径，editor-runtime.ts:201-205），单次写入=单条 undo 记录=单个历史事务；禁止逐 patch 多次写入（违反 docs/source-search.md 适配器边界）。禁止为替换自动把结构化文档整篇切源码。
- 失败处理：任一失败码（source-search.ts:86-93：`revision-mismatch`/`source-mismatch`/`missing-match`/`truncated-search`/`invalid-replacement-unicode`/`invalid-selection`/`invalid-result-caret`）→ 不应用任何内容、保留用户输入的查询与替换文本、面板显示按码解释的稳定文案；`truncated-search` 时"全部替换"按钮禁用并说明。
- composition：替换进行前后若 `composing` 为真则拒绝并提示（textarea composition 中改 value 会破坏 IME）。
- 替换成功后：结果按新 `(documentID, revision+1, raw)` 重建（revision 由 recordChange 通道自然 bump，bridge.ts:198-209），选区落在计划给出的建议选区（source-search.ts 成功结果含 selection）。
- 保存联动：不新增保存语义；dirty/history 由既有 runtime→bridge→InkoraDocument 链路自然成立（InkoraDocument.swift:329-336），替换不是特殊保存事件。

## 5. 契约：阶段 D —— 前置接口任务：raw↔PM 映射（阻塞结构化定位/替换）

明确列为独立任务，不并入 A-C：

- 目标：结构化模式下把 raw 匹配定位到 PM 选区（或改为 PM 文档内原生搜索），并处理 markdown 语法本身不可映射的情况：标题定界符、链接 `[label](href)` 的括号/href、强调定界符、受保护片段（front_matter/raw_html/math 等，markdown-safety.ts:3-16）、CRLF 折叠偏移（line-endings.ts:10-12）。
- 验收基线：映射必须是双向可验证的（raw range ↔ PM range round-trip），拒绝区（语法/保护片段内的匹配）显式标记"不可定位"，不渲染按钮。
- 在 D 完成前，结构化模式的查找诚实停留在"可搜、可数、不可定位、不可替换"。

## 6. 范围外

跨文件/项目搜索、正则、替换历史、云同步、查找高亮装饰层（依赖 D）、任何强制整篇切源码的路径、M0 门槛变更。

## 7. 测试矩阵（实施任务的验收清单）

阶段 A（vitest，仿 main.test.ts/document-analysis-panel.test.ts 的 jsdom 范式）：

| # | 场景 | 期望 |
|---|---|---|
| A1 | 打开面板输入查询 | 计数=匹配数；面板不触发 stateChanged/editorError |
| A2 | 大小写开关 | 与 searchSource caseSensitive 一致 |
| A3 | 空查询 | 0 处，无错误态 |
| A4 | >maxResults | truncated 提示文案出现 |
| A5 | stateChanged(revision+1) | 旧结果标记过期并重算 |
| A6 | loadDocument 新 documentID | 面板重置 empty |
| A7 | 同 revision 异 documentID（原生重开） | 旧结果不跨文档复用 |
| A8 | composition 中 stateChanged | 沿用旧结果，不重搜 |
| A9 | searchSource 抛错 | 面板 error 态，无 Bridge 消息 |
| A10 | structured 模式 | 定位/替换入口禁用且可见原因 |
| A11 | rejected 非空 | 不计入计数、不出现可定位条目 |

阶段 B（+ textarea 交互）：

| # | 场景 | 期望 |
|---|---|---|
| B1 | 下一处/上一处/回绕 | 与 findSourceMatch 语义一致，越过当前匹配 |
| B2 | 导航后 | dirty/canUndo 不变，无 stateChanged |
| B3 | composing 中导航 | 拒绝/延迟，组合串不破坏 |
| B4 | revision 过期后导航 | 结果丢弃，回到过期态 |
| B5 | bare_cr 只读 | 可定位选区，无替换入口 |

阶段 C（+ 替换）：

| # | 场景 | 期望 |
|---|---|---|
| C1 | 单个替换 | 文本正确、单条 undo、选区=计划选区 |
| C2 | 全部替换 | 单条 undo、changed 计数正确 |
| C3 | current.raw ≠ search.source.raw | source-mismatch，零应用，输入保留 |
| C4 | revision 不一致 | revision-mismatch，零应用 |
| C5 | truncated 全部替换 | 按钮禁用 |
| C6 | 替换含未配对 surrogate | invalid-replacement-unicode，零应用 |
| C7 | 结果 caret 落 CRLF/字素内 | invalid-result-caret，零应用 |
| C8 | composing 中替换 | 拒绝，value 未动 |
| C9 | 替换后新匹配集 | 绑定新 revision，旧索引失效安全 |

阶段 D：映射 round-trip 真值表 + 语法/保护片段拒绝样例 + CRLF/BOM/字素边界。

## 8. 任务拆分与依赖

- INK-M1-007（本文档）：设计契约。无产品改动。
- 任务 A（依赖无）：查找面板 + 计数 + 过期/组合安全（web 侧，可全 jsdom 测试）。
- 任务 B（依赖 A）：source/只读模式导航定位。
- 任务 C（依赖 B）：source 模式原子替换。
- 任务 D（依赖无，可并行 A-C）：raw↔PM 映射接口；完成前结构化模式定位/替换不出现在 UI。
