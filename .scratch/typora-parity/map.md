# Inkora 对标 Typora：分阶段路线决策地图

Labels: wayfinder:map
Status: open

## Destination

形成 Inkora 对标 Typora 的完整分阶段路线：明确每阶段用户能力、验收标准、关键技术决策及真实依赖，使后续可以通过 to-spec / to-tickets 形成可实施规格。目标是日常技术文章与项目文档写作的体验和常用功能对齐，不要求界面像素一致。

## Notes

- 用户于 2026-11-08 确认：规划完整路线、分阶段实施；以中文技术文章与项目文档为主要验收场景；纳入公式、Mermaid、脚注、主题和导出。
- 继承仓库 AGENTS.md、README.md 和已接受 ADR：macOS 14+、App Sandbox、离线编辑、Markdown 保真优先、保护 IME/光标/选区/撤销历史；Developer ID 签名、公证后直接分发。
- 初始研究基线：main `3bc978e68ba63f48d4e743481be0fe5316ae17eb`。本轮路线讨论读取时，本地 main 已新增 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`（当时尚未进入 origin/main），需补充保护块实现对路线的影响核实；研究证据按提交区分，不能把旧现状描述当作新实现事实。
- 既有 [Inkora 1.x Roadmap](https://github.com/huruizhi/Inkora/issues/1) 是输入材料，历史勾选与实现的差异及更正见维护记录；这张地图跨阶段规划，不承诺所有内容属于 1.x。
- 本地图使用 wayfinder 默认的本地 Markdown tracker，尚未执行 setup-matt-pocock-skills。地图是本文件；子票据在 issues/；研究证据位于各票指定的独立研究分支 research/ 路径，以提交链接固定版本，不合并研究分支。
- 2026-11-08 用户授权整理旧路线：仅对旧路线图增加历史/重规划说明、链接本地图并纠正与子 Issue 状态不一致的勾选；保留已有 Issue 和实现记录。对账记录见 [INK-PLAN-002](../../docs/tasks/INK-PLAN-002.md)。研究中的旧勾选是更正前快照，不代表更正后的状态。新路线尚在决策阶段，未完成迁移前不关闭旧路线图或批量改动子 Issue。
- 子票据的 Type、Labels、Status、Assignee、Blocked by 是调度依据。Status 使用 open / claimed / resolved；依赖项 resolved 后才可领取；无依赖写 None。决策结论只写在对应票据的 Answer 中，地图只保留摘要链接。
- 继续本地图时先读 wayfinder；用户决策使用 grilling 和 domain-modeling；外部事实使用 research；交互验证使用 prototype。此阶段产出决策，进入实施前另行使用 to-spec / to-tickets。
- 本地研究和检查使用独立 worktree。UI 自动化执行遵循 docs/testing.md；测试存在、测试通过和人工体验验收分别记录。
- 用户已确认优先验证增量路线；下次推进优先处理相应原型票，再根据证据决定是否锁定架构。独立范围决策仍可在各自会话推进，原型代码与产品实现分别交付。

## Decisions so far

- [核实技术写作基线与既有路线图进度](issues/01-writing-baseline.md)：已建立十条写作流程基线并核实旧路线图与 Issue/实现证据的差异；阶段范围仍待用户决策。
- [核实编辑内核保真与复杂语法扩展的技术约束](issues/02-fidelity-feasibility.md)：已核实局部保真、未知片段和跨模式历史的缺口；候选路线及最小原型问题已列出，尚未选型。
- [确定首个可交付里程碑的写作闭环](issues/03-first-milestone.md)：用户确认单篇技术文档的首阶段范围及验收方向；高级语法片段混排和不自动整篇退出可视编辑是明确要求，技术路线待验证。
- [核实受保护原文块实现对保真路线的影响](issues/10-fidelity-baseline-refresh.md)：新基线已提供可复用保护块和预览，lint/构建及 111 项编辑器测试通过；完整局部保真和跨模式历史仍需原型证明。
- [确定局部保真与未知语法共存的实现路线](issues/04-fidelity-route.md)：用户确认先验证复用 ProseMirror 的增量候选路径及五项门槛；失败时调整或以同一判据比较原文主数据路线，最终架构尚未锁定。

## Not yet specified

- 后续各阶段的具体功能集合、先后顺序与退出标准，等待首阶段技术路线和质量门槛明确后分组。
- 文件树、跨文件搜索及多文档工作流的后续产品边界；首阶段的单篇文档导航范围见已解决的写作闭环票。
- 公式、Mermaid、脚注的方言范围、错误反馈及离线资源策略。
- 主题可定制程度、排版规则、导出格式与渲染一致性。
- 最低系统、真实输入法、辅助功能、大文件表现及发布质量门槛的具体证据要求。
- 暂不估算日期和人日；待关键技术路线、验收规模与依赖明确后再排期。

## Out of scope

- 本次地图不实施产品代码，也不把尚未决策的领域预拆为实施任务。
- AI 辅助、多人协作、跨平台、云端图床上传属于独立路线。
- Typora 界面的像素级复刻、Mac App Store 分发不在目标内。
