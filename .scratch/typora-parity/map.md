# Inkora 对标 Typora：分阶段路线决策地图

Labels: wayfinder:map
Status: open

## Destination

形成 Inkora 对标 Typora 的完整分阶段路线：明确每阶段用户能力、验收标准、关键技术决策及真实依赖，使后续可以通过 to-spec / to-tickets 形成可实施规格。目标是日常技术文章与项目文档写作的体验和常用功能对齐，不要求界面像素一致。

## Notes

- 用户于 2026-11-08 确认：规划完整路线、分阶段实施；以中文技术文章与项目文档为主要验收场景；纳入公式、Mermaid、脚注、主题和导出。
- 继承仓库 AGENTS.md、README.md 和已接受 ADR：macOS 14+、App Sandbox、离线编辑、Markdown 保真优先、保护 IME/光标/选区/撤销历史；Developer ID 签名、公证后直接分发。
- 当前事实基线：main `3bc978e68ba63f48d4e743481be0fe5316ae17eb`。既有 [Inkora 1.x Roadmap](https://github.com/huruizhi/Inkora/issues/1) 是输入材料，勾选状态需与实现和证据对账；这张地图跨阶段规划，不承诺所有内容属于 1.x。
- 本地图使用 wayfinder 默认的本地 Markdown tracker，尚未执行 setup-matt-pocock-skills。地图是本文件；子票据在 issues/；研究证据位于各票指定的独立研究分支 research/ 路径，以提交链接固定版本，不合并研究分支。目前不修改 GitHub 路线图或已有任务状态。
- 子票据的 Type、Labels、Status、Assignee、Blocked by 是调度依据。Status 使用 open / claimed / resolved；依赖项 resolved 后才可领取；无依赖写 None。决策结论只写在对应票据的 Answer 中，地图只保留摘要链接。
- 继续本地图时先读 wayfinder；用户决策使用 grilling 和 domain-modeling；外部事实使用 research；交互验证使用 prototype。此阶段产出决策，进入实施前另行使用 to-spec / to-tickets。
- 本地研究和检查使用独立 worktree。UI 自动化执行遵循 docs/testing.md；测试存在、测试通过和人工体验验收分别记录。

## Decisions so far

- [核实技术写作基线与既有路线图进度](issues/01-writing-baseline.md)：已建立十条写作流程基线并核实旧路线图与 Issue/实现证据的差异；阶段范围仍待用户决策。
- [核实编辑内核保真与复杂语法扩展的技术约束](issues/02-fidelity-feasibility.md)：已核实局部保真、未知片段和跨模式历史的缺口；候选路线及最小原型问题已列出，尚未选型。

## Not yet specified

- 各阶段具体功能集合、先后顺序与退出标准，等待写作基线和范围决策。
- 文件树、大纲、搜索、字数统计与多文档工作流的产品边界；先定义最小写作闭环，再决定如何组合。
- 公式、Mermaid、脚注的方言范围、错误反馈及离线资源策略。
- 主题可定制程度、排版规则、导出格式与渲染一致性。
- 最低系统、真实输入法、辅助功能、大文件表现及发布质量门槛的具体证据要求。
- 暂不估算日期和人日；待关键技术路线、验收规模与依赖明确后再排期。

## Out of scope

- 本次地图不实施产品代码，也不把尚未决策的领域预拆为实施任务。
- AI 辅助、多人协作、跨平台、云端图床上传属于独立路线。
- Typora 界面的像素级复刻、Mac App Store 分发不在目标内。
