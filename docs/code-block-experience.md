# 代码块体验

Inkora 的可视编辑器离线提供代码高亮和代码块语言选择。高亮只是一层
ProseMirror Decoration，不会把 highlighter 生成的 HTML 写入编辑 DOM，也不会修改
Markdown 原文、选区、撤销历史或 dirty/revision。

## 支持的语言

应用静态打包 highlight.js core，以及 Bash、CSS、Go、JavaScript、JSON、Markdown、
Python、Rust、SQL、Swift、TypeScript、XML/HTML 和 YAML。常用别名（如 `js`、`ts`、
`py`、`sh`、`html`、`yml`、`md`）可高亮，但不会被自动改写成规范名称。未知语言和
未指定语言按纯文本显示，不执行自动检测，也不访问 CDN 或网络。

## 语言选择与原文保真

每个围栏代码块上方都有键盘可达的“语言”选择器。主动选择会通过真实
ProseMirror 事务修改围栏 info string 的首 token；其余选项、空白、BOM、EOL、围栏
字符、代码正文和邻近正文都由原文权威层保留。重复选择相同语言是 no-op。

缩进代码块没有可持久化的围栏 info string，因此选择器会禁用并显示原因，不会静默
改成围栏代码块。若原文权威层拒绝语言事务，选择器恢复当前值并在代码块内显示错误。

编辑器或 EditorView 处于中文输入法 composition 时，代码块工具条不会夺取焦点、
提交候选或发送语言事务。工具条事件与代码正文隔离；代码正文仍由 ProseMirror 的
`contentDOM` 管理。

## 许可与分发

highlight.js 11.12.0 使用 BSD-3-Clause。完整 notice 位于编辑器产物的
`THIRD_PARTY_NOTICES.txt`，代码块工具条提供可见入口；Vite 构建会将该文件复制进
应用的 `build/editor` 资源目录。
