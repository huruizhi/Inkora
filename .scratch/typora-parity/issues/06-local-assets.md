# 确定本地图片与附件的文件生命周期

Type: grilling
Labels: wayfinder:grilling
Status: claimed
Assignee: root
Blocked by: 13
Parent: ../map.md

## Question

离线 Sandbox 内，本地图片采用引用原路径、复制到文档旁资源目录还是其他用户可理解的策略？未命名文档、拖放/粘贴、Save As、文件移动及缺失资源分别如何处理，如何保留 Markdown 路径？

## Resolution criteria

用户确认资源归属、路径及错误恢复规则；查明所需系统 API 事实后再决策。保留离线原则，排除云图床上传。

事实输入由[本地图片约束研究](13-local-assets-feasibility.md)提供；研究不代替用户的资源策略决定，也不越过 M0 原型门槛提前实施完整图片功能。

## Comments

### 第一轮策略问题已发出

1. 建议新增拖入/粘贴图片默认复制到文档旁的“文档名.assets”目录，写入相对路径；已有 Markdown 图片引用保持原样。
2. 建议未命名文档先在沙盒恢复草稿区保存导入图片，首次保存后落到目标资源目录；取消或失败保留草稿与图片。

上述为待用户选择的提案，不是已接受的默认政策；尚不实施图片资源代码。需要的目录授权、保存一致性和恢复边界已有研究事实，后续按用户选择细化 Save As/移动/清理。
