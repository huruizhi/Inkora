# 编辑内核保真与复杂语法：路线研究

研究日期：2026-11-08。实现基线为地图指定 main `3bc978e`；本 worktree HEAD `45dae92` 仅增加规划文档。本票只读代码与一手资料，未执行原型、编辑器测试、原生测试或 UI 验收，未新增依赖。

## 决策所需结论

**现有 ProseMirror 可继续作为结构化编辑候选，但当前 codec 不能作为局部字节保真的完成证据。** 优先验证“原文范围补丁 + ProseMirror 模型 + 明确边界的不透明片段”；在证明安全前继续使用整篇源码回退。若映射与历史原型失败，再比较“原文为权威、结构化视图为投影”的成本。本研究不决定更换内核、不降低 `FID-002`，也不把添加节点视为功能完成。

## 已确认的仓库事实

- [保真规范](../../../docs/markdown-support.md)要求：未编辑字节一致；局部修改只触及实际编辑范围与必要的最小外层定界符；结构化模式中的 D 片段不透明保留；范围无法证明安全时回退。任务状态切换只改 `[ ]` 内字符，GFM 表格单元格不含块结构。这些是目标契约，不能由 codec 规范化规则替代。
- [codec](../../../editor/src/markdown-codec.ts)使用 CommonMark tokenizer，加 strike，schema/tokenSpecs 尚无表格、任务语义、图片或不透明节点。它保存部分 heading/list/fence 风格，但 `serializeMarkdown` 输出整篇；没有原始范围覆盖表、引用定义账本或 patch serializer。[codec 文档](../../../docs/markdown-codec.md)也明确未提供 FID-001/002 的源范围保真。
- [runtime](../../../editor/src/editor-runtime.ts)的 `StructuredEditorRuntime.getText()` 在 clean 时返回 `savedText`，dirty 时整篇序列化并恢复换行/尾部状态。纯 CRLF 准入额外检查往返等值；LF 没有相同检查。因此从代码可知“原样打开保存”不代表“局部修改无旁带 diff”，后者尚需证明。例如非标准空行、引用链接拼写、强调定界符的信息可能未进入模型；这是风险推断，未在本票运行反例。
- [安全扫描](../../../editor/src/markdown-safety.ts)发现任一风险便整篇 source；围栏内 Mermaid 被当代码保护，不触发专用图表模式。检测器是正则和保护 mask，风险 `start/end` 不是完整、无重叠的语法所有权映射。`prepareMarkdownSave` 有规范化阻断逻辑，但实际 snapshot 在 [main.ts](../../../editor/src/main.ts)调用 `runtime.getText()`，不能将该工具函数的存在当作运行时已执行保存闸门。
- 当前 source/structured 在 `createEditorRuntime` 加载时选择；重新创建会建立新 session/history。源码 runtime 的历史是全文字符串栈，结构化 runtime 是 PM history；没有在同文档内切换并迁移双向 selection/history 的接口。[editor-session](../../../editor/src/editor-session.ts)对 composition 聚合 revision、期间拒绝 Undo/Redo，并以 PM 文档相等判断 dirty。**推断：**未来若原文发生格式变化而语义树相同，dirty/baseline 必须包含原文状态。
- [Bridge 契约](../../../docs/bridge-protocol.md)、[snapshot 接收](../../../app/Sources/EditorBridge.swift)以 requestID/documentID/revision 配对；Web snapshot 拒绝未结束 composition，保存确认可针对历史 revision。Bridge 传完整文本，不传 PM selection 或源范围；它能运输无损结果，却不能修复 codec 损失。
- 本地图片还涉及原生能力：[资源 handler](../../../app/Sources/EditorResourceSchemeHandler.swift)只读 bundle/editor 内资源并验证路径和 symlink；[CSP](../../../editor/index.html)只允许指定 scheme/data 图片且禁联网。添加 image schema 不会自动获得文档同目录图片访问授权或相对路径重定位能力。

## 一手 API 能提供什么

官方网页文档本次返回 403，改读官方源码及表格 README；以下为检索时上游 master 的能力说明，实施前须对照 [锁定依赖](../../../editor/package.json)，不假设已经兼容或安装。

| 证据 | 已确认能力 | 不能据此保证 |
| --- | --- | --- |
| [model/node.ts](https://github.com/ProseMirror/prosemirror-model/blob/master/src/node.ts) | PM 位置包含节点边界；文本 nodeSize 使用 JS 字符串 length | PM 位置不等于 Markdown UTF-8 字节位置；需单独映射 UTF-16、语法标记、CRLF 与文件 BOM |
| [transform/map.ts](https://github.com/ProseMirror/prosemirror-transform/blob/master/src/map.ts) | StepMap/Mapping 跟踪步骤前后位置、删除与边界关联 | 不提供 Markdown source map；标记/属性修改也不能只凭替换范围判定原文影响 |
| [markdown/from_markdown.ts](https://github.com/ProseMirror/prosemirror-markdown/blob/master/src/from_markdown.ts) | tokenizer 可配置方言，ParseSpec 可映射 block/node/mark 与 attrs；未知 token 无 handler 会抛错 | 不自动保留所有原始词法写法；`ignore` 会忽略内容，不能作为未知语法保真策略 |
| [model/schema.ts](https://github.com/ProseMirror/prosemirror-model/blob/master/src/schema.ts)、[view/viewdesc.ts](https://github.com/ProseMirror/prosemirror-view/blob/master/src/viewdesc.ts) | atom/isolating、NodeView 的 contentDOM、事件/selection/mutation 钩子支持自定义表示 | atom/isolating 不等于不可删除或逐字节保真；NodeView 不负责 Markdown 序列化，事件截断也可能影响 IME |
| [history/history.ts](https://github.com/ProseMirror/prosemirror-history/blob/master/src/history.ts) | history 保存逆 steps、位置 maps 与 selection bookmark，并支持事件分组 | 不会自动撤销外部原文缓冲区或 textarea 历史；跨模式历史需显式设计 |
| [官方 tables README](https://github.com/ProseMirror/prosemirror-tables#readme) | 表格节点、单元格选择、复制粘贴和结构修复插件，支持 rowspan/colspan | 不提供 Markdown 表格 codec/字节保真；其模型比本项目 GFM 表格范围更宽；当前仓库未依赖此包 |

## 候选路径与代价（均为推断，未选型）

| 路径 | 适用与代价 | 进入下一阶段条件 |
| --- | --- | --- |
| A：继续整篇安全源码回退 | 现有安全路径可作为扩展前的护栏；可先改善源码写作与只读预览，但不能宣称已支持结构化混排 | 维持完整 buffer 保存、只读编码/换行边界；不能通过放宽 scanner 隐式解锁 codec |
| B：PM + 原文范围账本/最小补丁 + D 不透明片段 | 保留现有编辑与 Bridge。需建立可逆范围所有权、词法 trivia、引用定义关系，并让所有 transaction/history 更新账本。未知边界依旧整篇回退 | 证明行内最小修改、跨块结构操作、Undo/Redo 均不扩大无关 diff；仅缓存整块原文仍不满足块内 FID-002 |
| C：原文权威 + PM 投影 | 更自然容纳任意源码与跨模式原文历史；需设计增量解析、投影同步与选择映射，可能比 B 更大 | 在同等保真与 IME 门槛下比较同步复杂度和延迟；不预设替换 PM，也不新增解析器依赖 |

B/C 都要求 source-map 失效时停止结构化保存，并把完整、可信的当前原文交给源码模式；不可先有损 serialize 再回退。

## 扩展约束与最小原型问题

1. **先验证局部补丁和未知语法共存。** 混合非规范 LF 空白、CRLF、emoji/ZWJ/组合字符、引用式链接、D 片段；在片段前后和同段行内编辑，再做 split/join/lift、粘贴、Undo/Redo。断言实际编辑与必要定界符之外的字节全相同，原文范围无缺口/重叠/重排；畸形、交叠或未闭合候选应整篇回退。包含 mark/attrs-only 操作，避免只覆盖有 StepMap 替换范围的编辑。
2. **任务列表可作最小切口。** `[ ]/[x]/[X]` 切换只改一个字符；保留大小写来源、缩进、bullet 与邻项。一次 PM transaction 同步原文补丁、selection 与历史；验证 toggle → edit → undo/redo → save，不把整项重写当合格。
3. **表格必须先限模型。** 选择自定义最小 schema 或评估官方插件前，先锁定单元格只含行内内容；禁用/拒绝无法表达的合并、多块粘贴等操作。验证转义管道、行内 code 中管道、对齐分隔行、单格编辑、增删行列、跨格选区、Tab/Enter 和中文 composition；结构修复不能偷偷重排原文。插件接入须另行说明依赖，本文不引入。
4. **本地图片须分清源值与显示资源。** 保存 Markdown 的相对路径、转义、title/引用标签，显示用受控本地资源 URL；两者不能相互覆盖。原型验证 sandbox 授权、同目录解析、symlink/越界拒绝、移动文档与 Save As、缺图，以及粘贴/复制导入的文件落盘与撤销边界。当前 handler 并非用户资源服务，不能直接扩大到任意文件访问。
5. **源码切换不能复用 loadDocument 作为最终方案。** 原型必须同文档保持 revision 单调、内容不变切换不 dirty，源码改格式但同语义仍 dirty；映射 anchor/head 方向、节点/跨格选区；在反复切换后跨模式撤销重做且选区恢复。composition 未提交时延迟切换；保存中切换、旧 markSaved、进程恢复都应保持准确 baseline。
6. **公式、Mermaid、脚注先独立于编辑权威。** 候选为保留公式/图表原始内容并提供 NodeView/预览，脚注保留 label 与定义关联；仅稳定识别边界者可不透明混排。Mermaid 当前可作为 fenced code 编辑，渲染未实现。验证渲染错误不改源码、异步渲染不增加 revision/dirty、不抢 IME/selection；离线资源与错误反馈另作决策，不在本票选择渲染依赖。
7. **原生联合门槛。** 上述原型最终需在真实 WKWebView 和系统中文输入法下覆盖 composition → 保存/关闭 → 历史，以及保存期间继续编辑的旧 snapshot 确认。现有模型/DOM 测试文件可复用验收方法，但本票没有运行，不能据此宣布新能力或真实输入法已通过。

建议路线门：先完成 1/2 的字节与历史原型，再决定 B/C；3–6 的结构化能力均以同一保真层为依赖。本票不承诺性能上限、日期或当前实现全面符合规范。
