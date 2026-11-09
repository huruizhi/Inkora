# 当前文档查找面板（search-panel，阶段 A）

产品面板：Web 内自建"查找"入口，对当前文档做字面量、默认大小写敏感的原文查询，显示有限结果与计数。复用 `source-search` 纯函数（见 `source-search.md`），不改 runtime/kernel/session/Bridge/Swift、不加协议、不加 ⌘F/全局快捷键。本阶段**不含定位与替换**，也不渲染对应按钮；这不代表查找替换或 M1 整体完成。

## 组成

- `editor/src/search-panel.ts`：`SearchPanel` DOM 组件。
  - 查找入口按钮 + 展开后的查询输入 / 大小写开关（默认敏感，与 `searchSource` 默认一致）/ 关闭按钮与结果区域；`maxResults` 固定 100。
  - 状态 `idle | document(documentID/revision/epoch/raw 绑定 + result) | error`；`update()` 只通过 `createElement`/`textContent` 重绘，不执行 HTML、不加载资源、不触碰焦点与选区。
  - `truncated` 时显示"匹配至少 100 处，仅显示前 100 处"，不把截断数冒充精确总数；`rejected` 命中不计入计数、不渲染为条目；每个结果视图声明"结果基于 Markdown 原文；点击定位与替换尚未开放"。
  - 摘要为字素安全的有限上下文（`Intl.Segmenter` 吸附边界），超长命中只保留首尾，不切断字素、不无限长渲染。
- `editor/src/main.ts`：接入调度（`scheduleSearch`，与 `scheduleAnalysis` 同范式）。
  - 刷新信号唯一来源是既有 `stateChanged` 与面板自身查询/大小写/打开变化；文本取 `runtime.getText()`，revision/documentID 取协议字段，不伪造、不新增第二内容真值。
  - `searchGeneration` 代际计数 + 已接受 `loadDocument` 时 `cancelPendingSearch`：跨文档、重复 load、同 revision 异 documentID 时旧任务作废，旧结果不覆盖新文档。
  - 接受新 load 立即 `resetForNewDocument()`：清旧结果与绑定，查询/大小写回默认，面板开关保留；被拒 load（`stale_revision`/`request_conflict`）完全保留有效查找状态。
  - 查找异常只落面板局部错误态，不发 `editorError`、不触发 `stop_saving`；面板动作零正文/dirty/history/Bridge 副作用。
- `editor/src/main.ts` 布局：新增稳定 `.editor-workspace`（内含 `.find-bar` 与既有 `.editor-host`），工具条与 `replaceChildren(editorHost)` 隔离，不在活编辑器上重建/移动 DOM；`.search-panel-results` 绝对定位下拉、内部滚动，页面不滚动，窄窗不遮挡控制与正文。

## composition 安全

- 查询输入自身 composition（`compositionstart`/`isComposing`）期间不重搜，保留上一份稳定结果；`compositionend` 后自然重算。
- runtime（textarea / ProseMirror）composition 期间调度跳过，沿用上一份稳定结果；组合收口后的真实 `stateChanged` 才重算。
- 查找/关闭/大小写按钮 `pointerdown` 在编辑器 composition 中被 `preventDefault`（不夺焦点、不迫使组合提交）并给局部提示，`click` 二次校验拒绝动作。
- Esc 仅在查询框非 composition 且 `event.isComposing === false` 时关闭面板并回焦点正文；不截获候选 Esc / 正文 Esc。查询框 Enter 等不触发正文编辑或原生 Undo/Redo 命令。

## 已知边界

- 无点击定位、无替换、无 ⌘F/原生菜单/协议命令（后续阶段 B/C 及独立任务，见 INK-M1-007 设计契约）；结构化模式定位需先立项 raw↔PM 映射（阶段 D）。
- 查询/大小写/结果均私有于 Web 面板，不持久化到用户偏好或磁盘。
- 真实 WKWebView 渲染、真实 IME 组合与 VoiceOver 的最终体验验收保留给管理者阶段；自动化验证为 jsdom DOM 级。
