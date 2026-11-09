# 大纲与统计面板（document-analysis-panel）

产品面板：在编辑器旁显示文档大纲（标题层级列表）与内容口径统计，并由标题按钮安全定位正文。基于已通过的 `analyzeDocument` 纯模块（见 `document-analysis.md`），不新增第二套统计口径，不改动 session/Bridge 协议。

## 组成

- `editor/src/document-analysis-panel.ts`：`DocumentAnalysisPanel` DOM 组件。
- `editor/src/heading-navigation.ts`：标题快照相等性与原文到 textarea 的 UTF-16/EOL 映射。
  - 状态 `AnalysisPanelState = empty | document | error`；`update()` 只通过 `createElement`/`textContent` 重绘，不执行 HTML、不加载资源、不渲染跳转按钮（标题定位是后续 M1 必需能力，未实现前明确不冒充导航）。
  - 收起/展开：唯一的 `<button>`（明确名称“收起面板/展开面板”，`aria-expanded`/`aria-controls`，原生键盘可达）；收起仅隐藏面板内容。
  - 空文档显示“空文档：暂无标题”；无标题文档显示“本文档没有标题”；分析失败显示“分析失败：…”。
- `editor/src/main.ts`：接入调度。
  - `#app` 内创建稳定子宿主 `.editor-host`（活编辑器 DOM 只在 loadDocument 重建，分析更新绝不重建/移动）；面板挂在宿主之后。
  - 刷新信号唯一来源是既有 `stateChanged` 消息（loadDocument / runtime 编辑变更 / markSaved / executeCommand / queryState 响应），读取其中的 `documentID`/`revision`，文本来自 `runtime.getText()`。不产生额外协议查询或虚假 revision。
  - `scheduleAnalysis`：`setTimeout(0)` 合并；`analysisGeneration` 代际计数 + 已接受的 `loadDocument`（响应为 `stateChanged`）时的 `cancelPendingAnalysis` 保证跨文档、重复 load、同 revision 异 documentID 时旧任务作废，旧结果不覆盖新文档。
  - 被 Bridge 拒绝的 `loadDocument`（`stale_revision`/`request_conflict`）不重置面板、不作废待执行分析：`main.ts` 先经 `session.loadDocument` 验证，只有真正接受的新 load 才清空面板并重建 runtime；拒绝请求保留当前有效大纲/统计与编辑器文本。
  - composition 进行中（`runtime.composing`）直接跳过调度，保留上一份稳定统计；组合结束且文本实际变化时由既有 stateChanged 链路自然刷新。

## 标题导航

- 每个标题以真实 `button` 渲染，重复标题按分析顺序分别绑定；`textContent` 保证标题内容不作为 HTML 执行。
- 请求绑定 `documentID/revision/epoch/raw` 与标题原文范围。`epoch` 是 main 在每次**已接受**的 `loadDocument` 上递增的加载代际：即使新文档 docID/revision/raw 与旧文档完全相同，旧面板按钮携带的旧 `epoch` 也会被拒绝（"文档已重新载入"），不会移动新视图的光标；被 Bridge 拒绝的 load 不递增 `epoch`，当前面板导航保持有效。执行前 main 同时核对当前文档、revision、原文和 composition；失败只在面板显示局部状态，不发送 Bridge 消息。
- 结构化模式重新分析当前原文，并将完整标题序列与真实 ProseMirror heading 序列逐项核对 `level/text`。只有数量和顺序完全一致才设置无历史选区并滚动；保护块伪标题等不一致会拒绝。
- 源码及只读裸 CR 模式先验证 textarea 的 LF 投影，再将原文 UTF-16 偏移按 CRLF/孤立 CR 显式折叠后设置光标。BOM 与代理对保留 UTF-16 计数。落在 CRLF 对内部（`\r` 与 `\n` 之间）或拆开代理对的偏移没有对应的 textarea 边界，`rawOffsetToTextareaOffset` 返回 `undefined` 并由调用方拒绝；有效标题起点/终点坐标不受影响，原文不做规范化。
- `pointerdown` 阻止面板按钮提前夺焦点；composition 期间不会调用 focus、更新 PM state 或设置 textarea 选区。

## 折叠空间

折叠状态同时落在面板 root 与 body。宽窗将侧栏基宽从 264px 缩至 96px；窄窗将底部面板限制为 44px，仅保留可键盘聚焦的展开按钮。展开时沿用原内容 DOM 状态与内部滚动布局，不重建正文。
  - 分析异常被捕获并显示为面板错误态，绝不转发为 `editorError`、不阻断保存/编辑。
  - `recordRuntimeChange` 的 `executingCommand` 防重复规则原样保留：显式 `markSaved`/`executeCommand` 的响应本身即 stateChanged，面板据此刷新。
- `editor/src/style.css`：`#app` 双栏 flex；面板固定宽、自身滚动（INK-055：页面不滚动，编辑区与面板各自内层滚动）；≤640px 窄窗改底部条带；颜色全部走系统 `Canvas/CanvasText` 系（跟随深浅色）。

## 计数口径（面板展示）

- 字符数 = `analysis.content.characters`：只计可读内容文本；不计空白；组合表情/ZWJ 序列各算一个字符。
- 字数 = `analysis.content.writingUnits`：中文逐字计数；英文与数字的连续串按一个词计；标点与表情不计入字数。
- 面板内以用户可读提示说明以上规则；不展示 raw 口径或内部契约术语，不承诺与 Typora 各语言计数完全一致。

## 已知边界

- 大纲仅为只读章节列表，点击标题不会定位/滚动（后续 M1 必需，见 `docs/tasks/INK-M1-004.md`）。
- 分析在主线程同步执行（`setTimeout(0)` 合并）；无 Worker、无网络、无新依赖。
- 真实 WKWebView 渲染、VoiceOver 与真实 IME 组合的最终体验验收保留给管理者阶段；自动化验证为 jsdom DOM 级。
