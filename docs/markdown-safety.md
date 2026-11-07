# 未知 Markdown 检测与保存闸门

`analyzeMarkdownSafety` 在结构化解析前扫描当前文本，返回固定风险码、支持级别、1-based 行列和字符范围。结果不包含正文片段，可直接用于 UI 状态与无敏感正文日志。

## 当前风险码

- 尚未建模：GFM 表格、任务列表、图片、GFM 裸链接；
- 延后但可识别：脚注、原始 HTML、front matter、Wiki link、Obsidian callout；
- 不支持或边界不稳定：自定义容器/指令、MDX/JSX/ESM、模板表达式、数学候选。

扫描会先保护围栏/缩进代码、行内代码、CommonMark link destination/title 和尖括号 autolink。保护范围内的 `|`、`[ ]`、HTML、`[[...]]`、花括号等只作为字面文本，不触发风险。

## 保存决策

`prepareMarkdownSave(original, current, mode)` 只返回决策和完整输出，不直接写盘：

1. 文本未修改：始终返回原字符串，策略为 `unchanged`，即使包含未知语法；
2. 源码模式：返回完整当前缓冲区，策略为 `source_buffer`，不经过 codec；
3. 结构化模式且存在风险：阻断，提供 `switch_to_source` / `cancel`；
4. 结构化模式无风险但 codec 会隐式规范化：仍阻断并建议源码模式；
5. 只有无风险且已经是稳定 codec 输出时，才允许 `structured` 保存。

因此未知结构不会通过结构化 serializer 覆盖原文件，保存失败也不会改变调用者持有的编辑缓冲区。原子磁盘写入和原生提示由后续 NSDocument 保存流程负责。

## 已知边界

这是保守检测器：遇到可能属于多种方言的候选时优先进入源码模式。Issue #26/#27 实现表格、任务列表或图片后，应删除对应风险码并增加 parser/serializer golden fixtures，不能只放宽正则。
