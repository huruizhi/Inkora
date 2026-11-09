# 表格与任务列表直接编辑

Inkora 的生产可视编辑器把合法 GFM 管道表格解析为 `table`、section、row、header/cell 节点，把合法列表任务解析为带 `task`、`checked` 与原始状态字符的 `list_item`。这些节点只是当前原文的可编辑投影；保存内容仍只来自 `SourceAuthoritySession.currentRaw`。

## 表格

单元格保留可编辑 inline 内容，支持中文、强调、链接、行内代码、转义管道、Unicode 字素与选区。账本分别记录 cell 可见文字和管道、空白、对齐 marker、容器前缀等非可见语法。普通文字事务在 table-cell 上必须生成唯一、可重解析且与目标 PM 表格精确相等的最小原文候选；缺失格首次输入时才补必要管道。额外源单元格不进入可见列，但继续由原文范围持有，编辑可见格不会删除它。

每个表格有键盘可达的本地工具栏，可前后插入行/列、删除数据行/列、设置无/左/中/右对齐及删除表格。最后一列时“删除列”禁用；删除全部数据行仍保留表头和分隔行。新建按钮在当前顶层块后建立两列、表头和一数据行；空白文档直接替换空段落。结构命令先产生 PM transaction，再由原文事务规划器按命令元数据生成局部补丁并重解析核对；按钮不直接改字符串。

Tab 与 Shift-Tab 只移动 cell 选区，不产生 dirty/history；末数据格 Tab 新增一行，作为单一可撤销结构命令，并把光标放入新行首格。引用和列表容器内的表格通过实际 `table_open.map` 与容器前缀建立位置依据；新增行继承当前行 EOL 与前缀。

## 任务列表

只有普通/有序/嵌套列表项开头的合法 `[ ]`、`[x]`、`[X]` 才生成 checkbox。代码块和普通段落中的同形文字不生成控件。checkbox 是可聚焦的原生 input，名称只取任务自身首段 label，不包含嵌套子项；点击或 Space 切换时只替换括号内一个字符。勾选写小写 `x`，取消写 ASCII 空格；未操作的大写 `X` 保持。

任务 label 是普通可编辑 inline 投影，保留 marks 与链接。任务末尾 Enter 通过现有列表 keymap 创建相同列表样式的未完成任务；空任务 Enter 退出列表并移除假 checkbox。任务 marker 是非可见语法，不计入内容字符和写作单元统计。

## 会话、安全与验证边界

表格和任务复用统一 composition、revision、history、snapshot、markSaved、源码草稿与过期事务拒绝路径。composition 期间 Tab、Enter、工具栏与 checkbox 不提交结构事务，也不阻止输入法候选键。源码显式提交后重新派生表格/任务节点；可视/源码 no-op 不改原文、选区历史或保存点。

冻结 `docs/acceptance/tables-tasks` 只提供独立字节和语义 oracle。产品回归通过真实 `createEditorRuntime`、EditorView transaction、NodeView 控件、键盘事件及 main/Bridge snapshot 驱动同样的12个动作，并另测容器、缺格、额外格、Unicode、CRLF、剪贴板和 composition。矩形多格选择、合并单元格和复杂电子表格粘贴不属于本阶段。
