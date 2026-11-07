# 块级编辑行为

## 命令与键盘

- 标题命令在 paragraph 与 1–6 级 heading 间确定性转换；`Cmd+Option+0…6` 直接选择目标类型/级别。
- `Cmd+Shift+7/8` 分别创建有序/无序列表；列表中的 `Enter` 续写 item，空 item 再按 `Enter` 退出列表。
- 列表中的 `Tab` 嵌套当前 item，`Shift+Tab` 提升当前 item；无法执行时返回 `false`，不制造非法结构。
- `Cmd+Shift+.` 创建引用；通用 lift 命令退出引用。
- code block 中 `Enter` 插入普通换行、`Tab` 插入 Tab 字符、`Cmd+Enter` 退出并创建后续 paragraph。普通文本块的 `Tab` 不被吞掉。
- 文本块开头 `Backspace` 使用 ProseMirror 的 join/select-node 规则；相邻 paragraph 会合并。
- 分隔线作为块级叶节点插入；相邻 paragraph 由后续 Enter/光标命令创建。

## 输入规则

支持 `#`–`######` 标题、`>` 引用、`-`/`+`/`*` 无序列表、`N.` 有序列表、三反引号代码块（可带 language）以及 `---`/`___`/`***` 分隔线。规则使用 ProseMirror input-rules 插件，因此 composition 期间不会执行，并可通过输入规则撤销恢复源文本。

## 粘贴

Schema DOM 规则解析 `<blockquote>`、`<ol start>`、`<ul>`、`<li>`、`<pre><code data-language>` 与 `<hr>`。解析结果必须通过递归 `Node.check()`；不满足 list item 或 code block 约束的结构不会进入文档模型。

完整 Markdown parser/serializer、全局 history 和 textarea 到 ProseMirror view 的切换仍分别属于 Issue #9、#11 及后续集成阶段。
