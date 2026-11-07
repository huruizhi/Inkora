# 编辑器 Schema（阶段一）

Issue #8 建立最小 ProseMirror 文档模型；Issue #7 增加 `strong`、`em`、`strike`、`code` 与 `link` marks；Issue #6 增加 `blockquote`、`code_block`、`ordered_list`、`bullet_list` 与 `list_item` 块节点。

## 结构约束

- `doc` 至少包含一个 `block`；空输入恢复为包含一个空 `paragraph` 的文档。
- `paragraph` 与 `heading` 只能包含零个或多个 `inline` 节点。
- `heading.level` 仅允许整数 1–6。
- `hard_break` 是不可选择的行内叶节点；`horizontal_rule` 是块级叶节点。
- 引用包含一个或多个 block；列表包含一个或多个 list item，每个 item 必须以 paragraph 开始并可继续包含嵌套 block。
- 有序列表起始值必须是正整数；代码块只含无 marks 的文本，可保存可选 language。
- heading 保存 ATX/Setext 来源风格；列表保存 marker、delimiter 与 tightness；code block 保存 fenced/indented、fence、language 与是否闭合。这些属性只影响 Markdown codec，不改变 DOM 语义。
- 任何从 JSON 加载的节点都会递归执行 `Node.check()`；根节点错误、未知节点、非法嵌套或非法属性统一恢复为空文档，并返回固定原因码，不携带正文。

## DOM 规则

段落对应 `<p>`，标题对应 `<h1>`–`<h6>`，硬换行对应 `<br>`，分隔线对应 `<hr>`，引用/列表/列表项/代码块对应语义化 HTML 节点。行内 marks 对应 `<strong>`、`<em>`、`<del>`、`<code>` 与 `<a>`；粘贴时也通过同一组规则解析。本阶段不实现 Markdown parser/serializer。

## 与支持矩阵的关系

当前 Schema 覆盖 `SYN-S001`–`SYN-S008`、`SYN-S010`、`SYN-S012`、`SYN-S013` 与 `SYN-S015` 所需的节点和 marks。Issue #9 已提供结构化 Markdown 双向转换；Schema/codec 尚未接入当前 textarea 文件路径，因此不会把尚未建模的 Markdown 转换后保存。
