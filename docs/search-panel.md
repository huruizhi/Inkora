# 当前文档查找与替换面板（源码与可视内容）

产品面板：Native 通过既有“查找”命令响应 ⌘F，Web 独立开发环境保留“查找”按钮。面板提供字面量、默认大小写敏感的查询、有限结果与计数，并显式区分“查找”与“替换”模式：查找为单行，替换展开第二行。源码模式搜索当前原文，可视模式搜索 PM 可编辑内容，复用 `source-search` 的匹配边界规则；不搜索链接目标/标题、代码语言、保护块或控件文字。源码与可视模式均支持定位、单个选中匹配和全部替换，后者通过 production source ledger 与 owner 局部补丁接受为当前原文。bare-CR 仍只读；不自动切源码，本次不新增 Bridge 字段。

## 组成

- `editor/src/search-panel.ts`：`SearchPanel` DOM 组件。
  - 展开后的首行包括“查找/替换”模式选择、查询输入、`Aa` 大小写开关（默认敏感，与 `searchSource` 默认一致）和关闭按钮；`maxResults` 固定 100。Native 环境隐藏常驻入口，由 ⌘F 打开并聚焦查询框；独立 Web 环境保留入口作为回退。
  - 查找模式只显示首行；切到替换模式后，replacement 输入与“全部”“替换”按钮显示在第二行。单个操作要求正文当前有向选区与一个完整匹配范围精确相等；可编辑源码和可视模式的全部替换即使列表截断也会在当前稳定快照重搜完整结果，达到 10,000 硬上限则整批拒绝。
  - 状态 `idle | document(documentID/revision/epoch/raw 绑定 + result) | error`；`update()` 只通过 `createElement`/`textContent` 重绘，不执行 HTML、不加载资源、不触碰焦点与选区。
  - `truncated` 时显示"匹配至少 100 处，仅显示前 100 处"，不把截断数冒充精确总数；`rejected` 命中不计入计数、不渲染为条目。定位只在这最多 100 个可见结果中提供上一处、下一处、回绕与结果按钮；截断提示明确未显示部分不参与导航循环，全部替换另按完整稳定快照重搜。
  - 摘要对完整原文只做一次 `Intl.Segmenter` 字素分段，之后按边界索引生成有限上下文；超长命中只显示字素安全的首尾各最多 48 个 UTF-16 单元，中间省略。若单个字素本身超过预算，则整簇省略，不切入组合序列，也不无限长渲染。
- `editor/src/main.ts`：接入调度（`scheduleSearch`，与 `scheduleAnalysis` 同范式）。
  - 刷新由既有 `stateChanged`、面板自身查询/大小写/打开变化，以及 runtime 本地 `status` 驱动。后者用于模式或可操作状态变化后的搜索范围刷新，不伪造正文变更或额外 Bridge revision。当前原文取 `runtime.getText()`，可视匹配索引取 PM doc，revision/documentID 取协议字段，不新增第二内容真值。
  - `searchGeneration` 代际计数 + 已接受 `loadDocument` 时 `cancelPendingSearch`：调度时冻结 query/case/documentID/revision/epoch，计时器执行时再校验 runtime/query composition、面板开关与全部绑定；关闭、跨文档、重复 load、同 revision 异 documentID 时旧任务作废。
  - 接受新 load 立即 `resetForNewDocument()`：清旧结果与绑定，查询/大小写回默认，面板开关保留；被拒 load（`stale_revision`/`request_conflict`）完全保留有效查找状态。
  - 查找异常只落面板局部错误态，不发 `editorError`、不触发 `stop_saving`。查询、展示和导航零正文/dirty/history/Bridge 副作用；成功且有变化的替换才产生一次正文历史、revision 和 `stateChanged`，失败/no-op 不发布文档变化。
  - `SearchPanel.ownsFocus` 只从当前 DOM `activeElement` 派生，不保存第二份焦点真值。查询区域持焦或查询输入正在 composition 时，来自 Native 的文档 Undo/Redo 仍经过既有 session 请求校验，但执行回调明确拒绝并返回 `command_rejected`；不调用 runtime、不增加 revision、不发虚假 `stateChanged`，也不清正文 history/future。正文重新拥有焦点后，文档 Undo/Redo 保持原行为。
  - 导航请求携带 `documentID/revision/epoch/raw/query/case/result/target` 快照回到 `main`。执行前重新读取 runtime 原文、当前有向选区并重跑有限搜索；任一身份、查询、结果或目标不一致就局部拒绝，不部分更新选区。
  - production runtime 搜索结果自身也按值捕获 `documentID/revision/raw/load epoch`。接受 load 时 `main` 把身份显式交给新 runtime；可视导航/替换在公共 runtime 接缝先验证结果所属 load，因此同身份同文本重载后的旧结果不能绕过面板 epoch。当前 runtime 的值拷贝与稳定重复查询仍有效；纯源码 search/plan 不读取这份适配上下文。
  - 替换请求额外冻结 replacement 与单个/全部意图。`main` 重验身份、epoch、revision、raw、query、case、显示结果与意图；全部替换再对稳定快照执行不受 100 项显示上限影响的完整搜索，之后才调用源码纯计划或 production 可视 owner 事务；no-op 仅显示"未产生更改"，不发 `stateChanged`。
- `editor/src/source-navigation.ts`：纯 raw UTF-16 ↔ textarea LF 坐标接缝。
  - 映射以当前 `raw` 与完整 `textarea.value` 投影一致为前提，逐单元处理 LF、CRLF、bare CR 与混合换行；不使用首次文本命中或长度比例。
  - CRLF 内部、代理对内部、字素内部、越界端点全部拒绝；BOM 作为正常原文单元参与后续范围映射。
- `editor/src/editor-runtime.ts`：显式区分原文定位/替换能力与可视内容定位/替换。bare-CR 可定位但不可替换；生产原文权威 runtime 在源码模式验证完整计划、textarea 投影、补丁顺序/范围/expected/resultRaw/Unicode/结果选区/composition，可视模式验证 PM 匹配、owner 局部补丁与候选重解析等价，再一次写入、一次历史登记、一次通知。
- `editor/src/source-replacement.ts`：runtime 侧不信任计划验证。补丁必须降序且不重叠，`resultRaw` 必须可由当前原文精确重推导；BOM、CRLF/LF/mixed、无尾换行和无关字节均不经过 PM 序列化。
- `editor/src/main.ts` 布局：新增稳定 `.editor-workspace`（内含 `.find-bar` 与既有 `.editor-host`），工具条与 `replaceChildren(editorHost)` 隔离，不在活编辑器上重建/移动 DOM；`.search-panel-results` 绝对定位下拉、内部滚动，页面不滚动，窄窗不遮挡控制与正文。

## composition 安全

- 查询与替换输入分别分离“DOM 候选草稿”与稳定值：composition（`compositionstart`/`isComposing`）期间不导航、不替换、不关闭、不切换大小写、不移动焦点；候选 Enter/Esc 不被消费。跨 load 保留活候选，收口后执行重置并忽略晚到 final input。
- runtime（textarea / ProseMirror）composition 期间调度跳过，沿用上一份稳定结果；组合收口后的真实 `stateChanged` 才重算。
- 查找/关闭/大小写按钮及公开 open/close 统一检查 runtime 与 query composition；`pointerdown` 被 `preventDefault`（不夺焦点、不迫使组合提交），`click`/`change` 二次校验拒绝动作。拒绝打开时提示位于 hidden 面板之外，关闭状态也可感知。
- Esc 仅在查询框非 composition 且 `event.isComposing === false` 时关闭面板并回焦点正文；不截获候选 Esc / 正文 Esc。查询框非组合期 Enter 定位下一处、Shift-Enter 定位上一处并保持查询焦点；组合期与 `event.isComposing` Enter 只局部拒绝，不进入正文。
- 接受新文档时若查询框正在 composition，先清旧结果/绑定，但保留候选草稿与查询焦点；`compositionend` 安全收口后再清查询。这样既执行新文档重置策略，也不在候选期间偷偷改写输入。
- 查询输入 composition 期间，大纲标题点击也在 `main` 的真实导航接缝被拒绝，保留查询焦点、候选文本、正文与 Bridge 消息；composition 收口后正常大纲导航继续可用。

## 已知边界

- UI 只支持单行字面替换，无正则、无多行 replacement。⌘F 复用既有 Native `find` 菜单命令与 Bridge 命令，不新增协议字段；可视模式使用 production source ledger、PM 位置与 owner 候选事务，不读取 DOM 文本或按首次同文猜测。
- 新增的精确有向选区历史保证覆盖替换链；普通 textarea 输入沿用既有历史行为，本任务未把普通输入历史整体重写。
- 当前补正只隔离 Native `executeCommand` 对**文档**历史的误路由；查询框自身的原生 Cmd-Z/文字 undo 路由没有真实 WKWebView 证据，未在本任务验收，也不宣称已实现完整 query undo。
- 查询/大小写/结果均私有于 Web 面板，不持久化到用户偏好或磁盘。
- 真实 WKWebView 渲染、真实 IME 组合、实际布局与 VoiceOver 的最终体验验收保留给管理者阶段；自动化验证为 jsdom DOM 级。磁盘保存/重开也不属于本任务结论。

- runtime查找结果同时绑定当前内容版本；编辑后Undo/Redo即便回到相同字节也使旧结果失效。单纯选区、no-op及保存回执不改变该版本。
