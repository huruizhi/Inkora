# 编辑器 Schema（阶段一）

Issue #8 建立最小 ProseMirror 文档模型，节点固定为 `doc`、`paragraph`、`heading`、`text`、`hard_break` 与 `horizontal_rule`。Issue #7 在不改变节点集合的前提下增加 `strong`、`em`、`strike`、`code` 与 `link` marks。

## 结构约束

- `doc` 至少包含一个 `block`；空输入恢复为包含一个空 `paragraph` 的文档。
- `paragraph` 与 `heading` 只能包含零个或多个 `inline` 节点。
- `heading.level` 仅允许整数 1–6。
- `hard_break` 是不可选择的行内叶节点；`horizontal_rule` 是块级叶节点。
- 任何从 JSON 加载的节点都会递归执行 `Node.check()`；根节点错误、未知节点、非法嵌套或非法属性统一恢复为空文档，并返回固定原因码，不携带正文。

## DOM 规则

段落对应 `<p>`，标题对应 `<h1>`–`<h6>`，硬换行对应 `<br>`，分隔线对应 `<hr>`。行内 marks 对应语义化的 `<strong>`、`<em>`、`<del>`、`<code>` 与 `<a>`；粘贴时也通过同一组规则解析。本阶段不实现 Markdown parser/serializer。

## 与支持矩阵的关系

当前 Schema 覆盖 `SYN-S001`–`SYN-S004`、`SYN-S010`、`SYN-S012`、`SYN-S013` 与 `SYN-S015` 所需的基础节点和 marks。列表、引用和代码块由 Issue #6 扩展；Markdown 双向转换由 Issue #9 实现。Schema 尚未接入当前 textarea 文件路径，因此不会把尚未建模的 Markdown 转换后保存。
