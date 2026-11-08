# 核实受保护原文块实现对保真路线的影响

Type: research
Labels: wayfinder:research
Status: resolved
Assignee: refresh_fidelity_research
Blocked by: None
Parent: ../map.md

## Question

新本地 main `57aeaac18e41c7191b1be851b284aae8c1b1bbae` 相对初始研究 `3bc978e` 的保护块、原文块范围、raw 序列化与预览路径，已经提供哪些可复用能力？相对已确认的首阶段要求，还缺哪些范围保真、历史/选区、主动源码编辑及异常保存保护？

## Resolution criteria

引用固定提交源码，区分现有实现、实际非 UI 检查结果、未验证风险；限定在新提交影响范围，不推送或合并本地 main，不擅自选择最终路线。核实原型候选如何复用保护块，而不把它当作完整保真层。

## Evidence

研究文件 `.scratch/typora-parity/research/04-fidelity-baseline-refresh.md` 位于独立分支 `task/INK-PLAN-004-research-refresh`；完成后以固定提交链接引用。

## Answer

新基线保护块、preview 和 raw 回写已经实现，可作为增量路线的复用起点；其边界未覆盖所有高级语法，表格保护预览也不是单元格直接编辑。dirty 时仍整篇序列化，完整原文范围、普通正文词法、块间空白及跨模式 history 尚未证明。当前自动源码回退与已确认的首阶段体验存在差距。

在固定新基线的独立 worktree 实跑 `make lint test-editor PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm`，lint、编辑器构建和 9 个文件的 111 项编辑器测试通过。未运行原生、Bridge 专项、UI、真实 IME、完整跨模式历史或全域范围/空白验收。

证据：[固定版本刷新研究](https://github.com/huruizhi/Inkora/blob/248b74250da5c1535e792f796f0be22cc46a372f/.scratch/typora-parity/research/04-fidelity-baseline-refresh.md)。研究分支已推送，未合并；规划分支仍只改文档，最终路线由用户确认并经原型验证。
