# Markdown Codec 与规范化规则

`editor/src/markdown-codec.ts` 使用 `prosemirror-markdown` 和 CommonMark 模式的 `markdown-it`，完成当前 schema 支持范围内的 Markdown ↔ ProseMirror 转换。

## 结构映射

- paragraph、ATX/Setext heading、blockquote、horizontal rule；
- 有序/无序列表、起始序号、`.`/`)` 分隔符、`-`/`+`/`*` bullet 与 tight/loose 状态；
- 围栏/缩进 code block、language、围栏字符与长度、未闭合围栏；
- strong、em、strike、inline code、link；
- soft break 作为文本中的 `\n` 保留，hard break 作为独立节点；
- Unicode 文本不做 NFC/NFD 等归一化。

## 确定性输出

- 文档块之间使用稳定空行，序列化结果不自动添加文件末尾换行；
- 保留解析得到的 ATX/Setext、列表 marker/delimiter/start/tightness、围栏/缩进代码风格；
- hard break 统一输出反斜杠形式；新建结构使用 `# `、`- `、`1. ` 和三个反引号默认值；
- 围栏代码仅当内容包含可被误认成 closing fence 的独占行时增长，永不因普通行内 marker 增长；
- 原输入为未闭合 fence 时，序列化不会凭空补 closing fence；
- link destination 中的括号和引号按 CommonMark 要求转义。

以上是结构化 codec 的规范化规则。当前应用仍通过 textarea 保留未修改文件的原始字节；codec 不声称单独提供 `FID-001/FID-002` 的源范围保真。未知/延后语法的检测和保存阻断由 Issue #10 完成，在该闸门接入前不得用 codec 覆盖任意输入文件。

## Golden fixtures

`editor/test/fixtures/markdown/` 中每个 `.input.md` 对应一个 `.expected.md`。仓库文件按惯例以换行结尾，测试读取 expected 时仅移除这个存储换行；codec 的实际输出仍按“不自动添加末尾换行”断言。

每个 fixture 同时验证：

1. 输入规范化结果与 expected 完全一致；
2. Markdown→Doc→Markdown→Doc 的 ProseMirror 结构相等；
3. 已规范化输出再次规范化不发生变化。
