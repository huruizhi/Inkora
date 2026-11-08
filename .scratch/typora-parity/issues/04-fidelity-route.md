# 确定局部保真与未知语法共存的实现路线

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: None
Blocked by: 02
Parent: ../map.md

## Question

在 Markdown 保真要求保持不变的前提下，如何演进现有内核，使未编辑范围保留原文、未知语法可安全共存，并支持必要的源码编辑？应优先采用哪条候选路径，哪项不确定性需要原型证明？

## Resolution criteria

用户依据研究确认候选路线、失败回退与必须验证的风险；必要时新增独立原型决策票。通过真实替代方案选择产生难逆转决策时记录 ADR。
