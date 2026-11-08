# 确定局部保真与未知语法共存的实现路线

Type: grilling
Labels: wayfinder:grilling
Status: claimed
Assignee: root
Blocked by: 02, 03, 10
Parent: ../map.md

## Question

在 Markdown 保真要求保持不变的前提下，如何演进现有内核，使未编辑范围保留原文、未知语法可安全共存，并支持必要的源码编辑？应优先采用哪条候选路径，哪项不确定性需要原型证明？

先读取[首个里程碑范围](03-first-milestone.md)中的用户决定，再评估候选路线。当前代码和研究中描述的整篇源码回退是既有行为，不代表它满足首阶段的目标体验。

## Resolution criteria

用户依据研究确认候选路线、失败回退与必须验证的风险；必要时新增独立原型决策票。通过真实替代方案选择产生难逆转决策时记录 ADR。

## Comments

### 2026-11-08：实现基线发生变化

本地 main 新增 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`，当前 `origin/main` 仍为旧研究的 `3bc978e`。新增保护块模型、原文块范围提取、raw 序列化和保护预览路径，直接影响旧研究的现状描述。规划分支不合并该代码提交，也不推送本地 main；技术建议需补充新基线评估。

已建立[新实现基线核实票](10-fidelity-baseline-refresh.md)，作为本轮路线判断的事实前置。

用户待回答的首个问题是：是否先验证局部字节保真、高级原文片段混排、跨模式历史/选区及真实 WKWebView 中文输入，再展开完整功能。尚未选择路线或宣布原型通过。
