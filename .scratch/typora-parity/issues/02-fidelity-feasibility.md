# 核实编辑内核保真与复杂语法扩展的技术约束

Type: research
Labels: wayfinder:research
Status: open
Assignee: None
Blocked by: None
Parent: ../map.md

## Question

现有 ProseMirror、Markdown codec、源码回退与 revision Bridge 的设计，在引入表格、任务列表、本地图片、源码切换及公式图表后，对局部字节保真、IME、selection 和 Undo/Redo 有哪些已知缺口？官方 API 和现有代码能支持哪些候选路径，哪些必须通过原型验证？

## Resolution criteria

引用 ProseMirror 官方 API/源码及仓库实现、保真规范，区分已证实事实与推断；列明候选路径、代价及最小验证问题，不自行降低保真要求或决定更换内核，不引入依赖。

## Evidence

研究结果写入 ../research/02-fidelity-feasibility.md；完成后在 Answer 中记录结论和边界。
