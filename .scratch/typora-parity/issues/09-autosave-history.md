# 确定自动保存与历史版本的职责边界

Type: grilling
Labels: wayfinder:grilling
Status: open
Assignee: None
Blocked by: 03
Parent: ../map.md

## Question

在现有独立恢复草稿和显式保存的基础上，哪些阶段需要原文件自动保存及可浏览的历史版本？三者如何分别处理未命名文档、外部修改、只读、保存失败及关闭时用户选择，避免把恢复草稿误当文件已保存或已有版本历史？

## Resolution criteria

用户确认各能力的职责、启用规则、冲突/恢复行为与阶段归属；系统版本 API 或自建方案涉及的事实不足时再建立研究票。沿用保真和原生文件状态规则，结果不构成自动更新或云同步承诺。

## Evidence

[技术写作基线研究](01-writing-baseline.md) 已核实现有恢复草稿、关闭的 autosavesInPlace 与缺失的版本浏览入口。
