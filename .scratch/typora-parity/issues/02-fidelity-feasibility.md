# 核实编辑内核保真与复杂语法扩展的技术约束

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: research_fidelity
Blocked by: None
Parent: ../map.md

## Question

现有 ProseMirror、Markdown codec、源码回退与 revision Bridge 的设计，在引入表格、任务列表、本地图片、源码切换及公式图表后，对局部字节保真、IME、selection 和 Undo/Redo 有哪些已知缺口？官方 API 和现有代码能支持哪些候选路径，哪些必须通过原型验证？

## Resolution criteria

引用 ProseMirror 官方 API/源码及仓库实现、保真规范，区分已证实事实与推断；列明候选路径、代价及最小验证问题，不自行降低保真要求或决定更换内核，不引入依赖。

## Evidence

研究文件：`.scratch/typora-parity/research/02-fidelity-feasibility.md`，位于独立分支 `task/INK-PLAN-001-research-fidelity`。研究分支提交后，在 Answer 中固定证据提交链接，不合并研究分支。

## Answer

事实研究完成，技术路线尚未选定。当前 dirty structured snapshot 会整篇序列化，缺少 FID-002 要求的原文范围映射与最小补丁；未知语法整篇回退，跨模式的 selection/history/dirty 尚无契约。`prepareMarkdownSave` 的工具函数不能证明实际 snapshot 路径已执行同一闸门。

现有 ProseMirror 仍可作为候选。下一轮比较“PM + 原文范围补丁”和“原文权威 + PM 投影”，先证明局部改动、未知片段、任务单字符切换和撤销历史；研究不替代原型验收，也未决定换内核或引入依赖。

证据：[固定版本研究](https://github.com/huruizhi/Inkora/blob/9a171f6482d1df12e8dc699f37c0e47d79f1289d/.scratch/typora-parity/research/02-fidelity-feasibility.md)。官方 API 来源及未验证项见研究文件。本票仅运行文档 diff 校验，未运行产品测试、构建或真实 IME 验收。
