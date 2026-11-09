# 当前文档查找面板（search-panel，阶段 A）

产品面板：Web 内自建"查找"入口，对当前文档做字面量、默认大小写敏感的原文查询，显示有限结果与计数。复用 `source-search` 纯函数（见 `source-search.md`），不改 runtime/kernel/session/Bridge/Swift、不加协议、不加 ⌘F/全局快捷键。本阶段**不含定位与替换**，也不渲染对应按钮；这不代表查找替换或 M1 整体完成。

## 组成

- `editor/src/search-panel.ts`：`SearchPanel` DOM 组件。
  - 查找入口按钮 + 展开后的查询输入 / 大小写开关（默认敏感，与 `searchSource` 默认一致）/ 关闭按钮与结果区域；`maxResults` 固定 100。
  - 状态 `idle | document(documentID/revision/epoch/raw 绑定 + result) | error`；`update()` 只通过 `createElement`/`textContent` 重绘，不执行 HTML、不加载资源、不触碰焦点与选区。
  - `truncated` 时显示"匹配至少 100 处，仅显示前 100 处"，不把截断数冒充精确总数；`rejected` 命中不计入计数、不渲染为条目；每个结果视图声明"结果基于 Markdown 原文；点击定位与替换尚未开放"。
  - 摘要对完整原文只做一次 `Intl.Segmenter` 字素分段，之后按边界索引生成有限上下文；超长命中只显示字素安全的首尾各最多 48 个 UTF-16 单元，中间省略。若单个字素本身超过预算，则整簇省略，不切入组合序列，也不无限长渲染。
- `editor/src/main.ts`：接入调度（`scheduleSearch`，与 `scheduleAnalysis` 同范式）。
  - 刷新信号唯一来源是既有 `stateChanged` 与面板自身查询/大小写/打开变化；文本取 `runtime.getText()`，revision/documentID 取协议字段，不伪造、不新增第二内容真值。
  - `searchGeneration` 代际计数 + 已接受 `loadDocument` 时 `cancelPendingSearch`：调度时冻结 query/case/documentID/revision/epoch，计时器执行时再校验 runtime/query composition、面板开关与全部绑定；关闭、跨文档、重复 load、同 revision 异 documentID 时旧任务作废。
  - 接受新 load 立即 `resetForNewDocument()`：清旧结果与绑定，查询/大小写回默认，面板开关保留；被拒 load（`stale_revision`/`request_conflict`）完全保留有效查找状态。
  - 查找异常只落面板局部错误态，不发 `editorError`、不触发 `stop_saving`；面板动作零正文/dirty/history/Bridge 副作用。
  - `SearchPanel.ownsFocus` 只从当前 DOM `activeElement` 派生，不保存第二份焦点真值。查询区域持焦或查询输入正在 composition 时，来自 Native 的文档 Undo/Redo 仍经过既有 session 请求校验，但执行回调明确拒绝并返回 `command_rejected`；不调用 runtime、不增加 revision、不发虚假 `stateChanged`，也不清正文 history/future。正文重新拥有焦点后，文档 Undo/Redo 保持原行为。
- `editor/src/main.ts` 布局：新增稳定 `.editor-workspace`（内含 `.find-bar` 与既有 `.editor-host`），工具条与 `replaceChildren(editorHost)` 隔离，不在活编辑器上重建/移动 DOM；`.search-panel-results` 绝对定位下拉、内部滚动，页面不滚动，窄窗不遮挡控制与正文。

## composition 安全

- 查询输入分离“DOM 候选草稿”与“已提交稳定查询”：composition（`compositionstart`/`isComposing`）期间不更新稳定查询、不重搜，已排队计时器也会在执行时拒绝半成品；`compositionend` 后提交最终值并自然重算，晚到的同值 final input 不重复调度。
- runtime（textarea / ProseMirror）composition 期间调度跳过，沿用上一份稳定结果；组合收口后的真实 `stateChanged` 才重算。
- 查找/关闭/大小写按钮及公开 open/close 统一检查 runtime 与 query composition；`pointerdown` 被 `preventDefault`（不夺焦点、不迫使组合提交），`click`/`change` 二次校验拒绝动作。拒绝打开时提示位于 hidden 面板之外，关闭状态也可感知。
- Esc 仅在查询框非 composition 且 `event.isComposing === false` 时关闭面板并回焦点正文；不截获候选 Esc / 正文 Esc。查询框 Enter 等不触发正文编辑或原生 Undo/Redo 命令。
- 接受新文档时若查询框正在 composition，先清旧结果/绑定，但保留候选草稿与查询焦点；`compositionend` 安全收口后再清查询。这样既执行新文档重置策略，也不在候选期间偷偷改写输入。
- 查询输入 composition 期间，大纲标题点击也在 `main` 的真实导航接缝被拒绝，保留查询焦点、候选文本、正文与 Bridge 消息；composition 收口后正常大纲导航继续可用。

## 已知边界

- 无点击定位、无替换、无 ⌘F/原生菜单/协议命令（后续阶段 B/C 及独立任务，见 INK-M1-007 设计契约）；结构化模式定位需先立项 raw↔PM 映射（阶段 D）。
- 当前补正只隔离 Native `executeCommand` 对**文档**历史的误路由；查询框自身的原生 Cmd-Z/文字 undo 路由没有真实 WKWebView 证据，未在本任务验收，也不宣称已实现完整 query undo。
- 查询/大小写/结果均私有于 Web 面板，不持久化到用户偏好或磁盘。
- 真实 WKWebView 渲染、真实 IME 组合与 VoiceOver 的最终体验验收保留给管理者阶段；自动化验证为 jsdom DOM 级。
