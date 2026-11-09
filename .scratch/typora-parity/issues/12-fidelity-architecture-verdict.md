# 依据原型证据确定保真架构是否采用

Type: grilling
Labels: wayfinder:grilling
Status: resolved
Assignee: root
Blocked by: 11
Parent: ../map.md

## Question

依据[增量路线原型](11-incremental-fidelity-prototype.md)的实际证据，是否采用复用 ProseMirror、受保护原文块和最小补丁的架构？哪些适用边界必须进入规格，哪些失败或未验证项要求继续修正或比较原文作为主数据的路线？

## Resolution criteria

用户审阅原型证据后确认采用、继续验证或转向比较；必要门槛缺证时不宣告最终选型。若产生难逆转、存在真实替代方案的架构选择，记录对应 ADR，并将有效限制交给后续交互与实施规格。

## Answer（2026-11-09）

在用户已明确授权后续按推荐选择、测试正确并继续推进的上下文中，管理者采纳028共同推荐和029原型证明：唯一当前原文权威、派生语义解析、带provenance/affinity的PM投影；保留PM/锁定工具链，settle仅为接受事务内部协议。不是继续放宽旧doc.eq闸门或堆staged入口特例，也不更换UI框架。

原五项门槛与真实物理H1/H2/H3/U1已实际闭合，EOF正常续写反例修正并独立复核，详见11/当前M0裁定。ADR-0004和V1可实施规格已在 task/INK-ADR-038-source-authority @271922e 推送；采纳的是文档边界，不是原型代码直接获生产验收。旧候选/未测项保持历史，不倒填通过。

后果：039生产V1迁移统一原文/投影/历史/源码/Bridge快照与既有写作辅助；V2–V6继续保护交互、表格任务、图片、代码高亮和可视搜索。常用格式EOF继承、全语法映射、真实NSDocument/资源生命周期、最低OS、性能、AX均在生产交付门槛中，不能拿M0替代。总目标仍是完整首阶段写作闭环。
