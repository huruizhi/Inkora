# 大纲与统计面板（document-analysis-panel）

只读产品面板：在编辑器旁显示文档大纲（标题层级列表）与内容口径统计。基于已通过的 `analyzeDocument` 纯模块（见 `document-analysis.md`），不新增第二套统计口径，不改动 runtime/session/Bridge 协议。

## 组成

- `editor/src/document-analysis-panel.ts`：`DocumentAnalysisPanel` DOM 组件。
  - 状态 `AnalysisPanelState = empty | document | error`；`update()` 只通过 `createElement`/`textContent` 重绘，不执行 HTML、不加载资源、不渲染跳转按钮（标题定位是后续 M1 必需能力，未实现前明确不冒充导航）。
  - 收起/展开：唯一的 `<button>`（明确名称“收起面板/展开面板”，`aria-expanded`/`aria-controls`，原生键盘可达）；收起仅隐藏面板内容。
  - 空文档显示“空文档：暂无标题”；无标题文档显示“本文档没有标题”；分析失败显示“分析失败：…”。
- `editor/src/main.ts`：接入调度。
  - `#app` 内创建稳定子宿主 `.editor-host`（活编辑器 DOM 只在 loadDocument 重建，分析更新绝不重建/移动）；面板挂在宿主之后。
  - 刷新信号唯一来源是既有 `stateChanged` 消息（loadDocument / runtime 编辑变更 / markSaved / executeCommand / queryState 响应），读取其中的 `documentID`/`revision`，文本来自 `runtime.getText()`。不产生额外协议查询或虚假 revision。
  - `scheduleAnalysis`：`setTimeout(0)` 合并；`analysisGeneration` 代际计数 + `loadDocument` 时的 `cancelPendingAnalysis` 保证跨文档、重复 load、同 revision 异 documentID 时旧任务作废，旧结果不覆盖新文档。
  - composition 进行中（`runtime.composing`）直接跳过调度，保留上一份稳定统计；组合结束且文本实际变化时由既有 stateChanged 链路自然刷新。
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
