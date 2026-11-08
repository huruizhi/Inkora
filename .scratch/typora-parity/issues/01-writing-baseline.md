# 核实技术写作基线与既有路线图进度

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: research_writing_baseline
Blocked by: None
Parent: ../map.md

## Question

Typora 官方资料所描述的哪些完整用户流程应成为本地技术写作对标基线？Inkora 当前 main、GitHub 既有路线图及相关任务的状态是否一致，哪些能力已有实现/运行证据，哪些只是目标或待验收？

## Resolution criteria

提供带官方来源、代码位置与当前提交的流程对照；核实旧路线图勾选及相关 issue 状态；明确文档目标、代码接入、自动化执行、人工验收的区别。研究不代替用户选择首个里程碑。

## Evidence

研究文件：`.scratch/typora-parity/research/01-writing-baseline.md`，位于独立分支 `task/INK-PLAN-001-research-baseline`。研究分支提交后，在 Answer 中固定证据提交链接，不合并研究分支。

## Answer

事实研究完成：列出十条端到端写作基线，覆盖文件、中文基础编辑、粘贴链接、表格任务、本地图片、长文导航、公式图表、排版、导出和恢复。首个里程碑范围仍由用户决定。

GitHub 旧路线图将扩展项勾选完成，但对应六张实际 Issue 均 open，验收条件未勾；冻结支持矩阵的表格、图片、任务列表承诺与当前 schema / 源码回退策略不一致。不能继承勾选作为实现或发布通过的依据。核查限于固定 main 与所述 Issue，未覆盖未合并分支、当前完整 CI 或人工验收。

证据：[固定版本研究](https://github.com/huruizhi/Inkora/blob/b96075f3a44dad86e33db9678729c5c1dd3ae314/.scratch/typora-parity/research/01-writing-baseline.md)。独立研究 worktree 尝试 `make test-editor` 时缺少 pnpm，退出 2，未进入构建/测试；文档 diff 校验通过。上一轮主代理在同一产品基线运行的 lint、编辑器构建及 105 项测试结果仍是独立证据，不能替代原生/UI/人工验收。

研究暴露的自动保存与历史版本职责，已拆为「确定自动保存与历史版本的职责边界」决策票。
