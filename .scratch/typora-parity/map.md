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
- 用户已指定主 Agent 作为调度者/规划者，使用 Paseo 的 Codex 和 OMP 执行具体工作。当前 M0 原型已领取，分工与可恢复的 host/agent/workspace 指针见 [执行记录](execution/M0-dispatch.md)；产物与门槛结论待执行回报和核验。
- 用户要求执行完成的 Agent 及时回收；完成产物接收与核查后当轮归档，无需因等待未来任务或用户审阅而保留闲置执行会话。工作区和证据的保存/回收独立处理，运行中的任务保持执行。
- 用户要求按难度和成本选模型；普通执行优先 Luna/GLM，不默认 GPT-6.1-Sol。实际可用型号、思考档位与升级规则见[模型调度规则](execution/model-routing.md)。
- 用户已授权后续按管理者建议自主选择：产品/技术取舍记录为管理者在授权下的推荐决定，不再逐项询问，不伪造用户逐项答复。实际运行、系统输入法、最低系统和用户体验证据仍须真实取得，授权不能代替验收。

## Decisions so far

- [核实技术写作基线与既有路线图进度](issues/01-writing-baseline.md)：已建立十条写作流程基线并核实旧路线图与 Issue/实现证据的差异；阶段范围仍待用户决策。
- [核实编辑内核保真与复杂语法扩展的技术约束](issues/02-fidelity-feasibility.md)：已核实局部保真、未知片段和跨模式历史的缺口；候选路线及最小原型问题已列出，尚未选型。
- [确定首个可交付里程碑的写作闭环](issues/03-first-milestone.md)：用户确认单篇技术文档的首阶段范围及验收方向；高级语法片段混排和不自动整篇退出可视编辑是明确要求，技术路线待验证。
- [核实受保护原文块实现对保真路线的影响](issues/10-fidelity-baseline-refresh.md)：新基线已提供可复用保护块和预览，lint/构建及 111 项编辑器测试通过；完整局部保真和跨模式历史仍需原型证明。
- [确定局部保真与未知语法共存的实现路线](issues/04-fidelity-route.md)：用户确认先验证复用 ProseMirror 的增量候选路径及五项门槛；失败时调整或以同一判据比较原文主数据路线，最终架构尚未锁定。
- [核实 Sandbox 下本地图片访问与迁移约束](issues/13-local-assets-feasibility.md)：固定代码与 Apple 一手依据已交接，资源访问/导入/迁移需显式授权与策略；产品政策和实际 Sandbox 验证仍待后续决定。
- [确定本地图片与附件的文件生命周期](issues/06-local-assets.md)：用户确认新增图片旁置复制和未命名草稿保留；其余 Save As、迁移、冲突、授权与清理默认规则由管理者按授权采用，实际平台可行性待独立原型。
- [确定阶段验收与发布证据门槛](issues/07-quality-gates.md)：管理者按用户授权采用分层验收政策，区分可合并、阶段可交付与可发布；保真、真实IME、文件资源生命周期、辅助功能与最低系统证据不得用模型测试替代，性能绝对预算待真实路线测量。
- [确定自动保存与历史版本的职责边界](issues/09-autosave-history.md)：首阶段显式保存原件并完善独立恢复草稿；原文件自动保存与可浏览历史纳入后续文件工作流阶段，默认不开启自动写原件，具体平台方案另行研究。
- [核实原文件自动保存与版本历史的平台方案](issues/16-save-history-platform.md)：Apple系统版本浏览器、配置约束与主文档安全写契约已核实；系统/自建方案及资源、容量、位置/迁移未知项已分开，研究完成不等于平台实验或方案选型完成。

## Not yet specified

- 后续各阶段的具体功能集合、先后顺序与退出标准，等待首阶段技术路线和质量门槛明确后分组。
- 文件树、跨文件搜索及多文档工作流的后续产品边界；首阶段的单篇文档导航范围见已解决的写作闭环票。
- 公式、Mermaid、脚注的方言范围、错误反馈及离线资源策略。
- 主题可定制程度、排版规则、导出格式与渲染一致性。
- 暂不估算日期和人日；待关键技术路线、验收规模与依赖明确后再排期。

## Out of scope

- 本次地图不实施产品代码，也不把尚未决策的领域预拆为实施任务。
- AI 辅助、多人协作、跨平台、云端图床上传属于独立路线。
- Typora 界面的像素级复刻、Mac App Store 分发不在目标内。


## 当前 M0 执行入口

依据028委员会共识和029冻结契约，只推进一个隔离的030原文权威/PM投影原型，见[共识记录](execution/M0-source-authority-consensus.md)。已接收集成仍为ea63941；027仅保留部分证据，未采纳。11保持claimed，12依赖不解除；未宣告生产架构选型或M0通过。

030首轮6658185已交付但独立验收退回，原因是页面CRLF源码往返、草稿旅行和编辑后锚点错位；同一工作区限定修正中，见[独立验收](execution/M0-source-authority-independent-review.md)。自动矩阵通过尚不足以解除11/12门槛。

030最终493e2b7已修复并独立通过冻结范围自动验收（4条原始红回归、11页面组、10集成域）。执行Agent/workspace已备份归档；031固定宿主准备真实WK/物理搜狗验证，当前锁屏预检退出78，等待用户解锁配合，尚未启动App。M0/11未通过，12不采纳架构，008/main未合。

用户选择稍后再做并保留进度：031物理验收暂缓，保留构建/证据/分支；不启动窗口或新Agent，待用户明确恢复后重新预检。

用户随后询问锁屏期间继续开发：恢复架构无关的非UI实施，先做大纲/统计与原文字面查找替换两个纯模块，见[锁屏开发范围](execution/HEADLESS-DEVELOPMENT.md)。031物理验收仍暂缓，11/12等依赖不解除；新模块不接实验内核、不自动合main，完成后独立验收回收。

001大纲/统计与002查找替换纯模块已完成独立反例复核，组合分支task/INK-M1-003-module-verification的editor lint及179项非UI测试通过。尚未连接UI或合main，不是M1整体验收。两个执行workspace已备份回收，累计36；031真人验收已恢复，当前等待用户单独取消输入结果，M0门槛保持。

用户表示测试正确并要求继续。031部分真实WK/中文历史与普通源码检查已结束，自有宿主停止、锁释放，原始501条记录冻结于031分支；取消事件均为确认上屏、源码物理中文未执行等未证项保留，不宣布M0通过。下一步实施[004大纲/统计只读面板](execution/M1-004-analysis-panel.md)，不采纳新内核、不提前接可视替换或改写既有门槛。

用户授权开始下一批开发：004补正已通过200项干净非UI、lint/build及真实App计数/UndoRedo点验；005记录daec0f6，004代码3047c55，仍未合main。004的Agent/workspace已备份回收，累计37。当前并行仅两项：[006大纲定位与折叠空间](execution/M1-006-outline-navigation.md)实施、[007查找界面接入契约](execution/M1-007-search-integration-design.md)文档设计，均从005固定起点独立worktree，不启动UI、不改实验内核。M0当前仅H1/H2/H3剩余物理证据，U1已关闭，详见[当前收尾清单](execution/M0-CLOSURE-CHECKLIST.md)，不以地图上方历史暂缓记录覆盖当前状态。

当前更新：007经独立纠正文档后10a6e33接收并回收；006两红反例修复6f1dd77，独立3/3及干净216/lint/build通过，隔离App已构建但桌面锁定预检exit78未启动，滚动/布局待验。008本地续验记录1e3b509保留最终代码，006 Agent/workspace已备份回收，累计39。继续[009当前文档查找面板](execution/M1-009-search-panel.md)非UI开发，只有查询/结果/计数，不开放未就绪的定位/替换，不解除M0或006真实窗口门槛。

009最终e3fc05e通过管理者冻结9项及干净256项/lint/build非UI接收，010续验记录50584f3保留最终代码和隔离App；实际desktop预检仍锁屏exit78，未启动App。真实键盘/IME/布局未验，不合main、不宣告查找替换整体完成。009的三Agent/workspace完成备份回收，累计40。当前仅[011源码与只读查找导航](execution/M1-011-source-search-navigation.md)执行中，可视raw↔PM映射及替换继续后置，M0门槛不变。

011最终ae143f5经独立冻结13项及干净276项/lint/build非UI接收，012续验记录58c5c3a保留最终代码/隔离App；desktop仍exit78锁屏，滚动/键盘/IME待验。011两个Agent/workspace已备份回收，累计41。当前仅[013源码模式原子替换](execution/M1-013-source-replacement.md)执行，结构化PM与bareCR只读不开放替换，不采纳新内核、不解除M0/006/009实际UI门槛，不合main。

当前收束：013最终0f17f22独立19控制、干净303、lint/build通过；两个Agent/workspace备份回收，累计42，当前无功能执行Agent。已形成[草稿PR#70](https://github.com/huruizhi/Inkora/pull/70)，集成head6ad325b；[默认非UI CI](https://github.com/huruizhi/Inkora/actions/runs/42568188093)实际success，UI/完整启动基准按参数skipped。main未合，真实窗口因锁屏未验，M0/阶段门槛不变。[集成与后续集中点验](execution/M1-014-integration-ci.md)为当前入口，不再以此前“执行中”历史段落覆盖本状态。

用户经 ask-matt 选择后续推进路线并要求执行：先做[写作辅助双轴审查](execution/M1-015-016-pr-review.md)，仅两个只读审查 Agent（GLM Standards、Sol Spec）。本轮预检仍锁屏 exit78，未启动 App；M0 只保留 H1/H2/H3，不新增门槛。依 docs/testing.md，普通 PR 可凭最新 main 基线和默认非 UI CI 合并，真实 UI 待验须准确披露，不能将阶段真人验收误加为普通合并门禁。审查收敛后再推进 PR 收尾；架构票仍待 M0 证据，之后交 to-spec/to-tickets 形成生产迁移的纵向任务。

当前已完成收尾：[写作辅助PR#70](https://github.com/huruizhi/Inkora/pull/70)经双轴审查和HTML/CRLF两项修正后，[最终默认CI](https://github.com/huruizhi/Inkora/actions/runs/42576854657) attempt3实际success，受检b294e6b；已squash合入main **48258a93b3fc4a75df21a22ac0d175e01943b744**，本地主工作区已快进且合并树与受检树一致。干净315项/独立27控制及lint/build通过，4位Agent/workspace回收，累计46；临时CI传输设置已恢复。详细证据见[集成当前状态](execution/M1-014-integration-ci.md)。此前“草稿/未合并/执行中”段落仅为历史；实际UI、M0三项物理证据和首阶段常用结构/图片等功能缺口仍保留。

用户目标更新为“完成首阶段基础功能”，当前统一按[交付总表](execution/FIRST-STAGE-DELIVERY.md)推进。032图片Sandbox/书签/WK宿主正在独立开发；033完整实施规格草案4534975已交付、待独立审阅，Agent/workspace回收（累计47）。用户现在可配合，034在同一固定7aaa页面补H1/H2/H3真人证据，UI锁仅管理者持有，后台禁止GUI；当前等待H1候选Esc取消结果，不预填通过或架构采纳。


**当前状态（2026-11-09，覆盖上方历史）**：M0五门槛与物理H1/H2/H3/U1已闭合；036 EOF续写/语义反例经管理者补正d3ee3f0并真实WK验证。11/12 resolved，038@271922e记录ADR-0004与V1规格，05转claimed执行实际生产交互。039生产原文权威核心已派Sol5.6/high/default，当前只有此执行Agent；已完成035/036 Agent和workspace校验备份回收（累计50）。037图片Sandbox实际面板/书签/移动目录/WK证据已补，14仍保留明确缺口。main48258a9，首阶段表格/任务/图片/高亮/可视搜索与完整保存重开尚未交付，总目标保持active。详细看execution/FIRST-STAGE-DELIVERY.md。
