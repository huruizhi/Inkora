# 首阶段基础功能：交付总表

用户已将当前目标设为“完成首阶段基础功能”。范围以03写作闭环票为准；不能用辅助模块合并、原型或非UI测试代替完整闭环。

当前生产main：`48258a93b3fc4a75df21a22ac0d175e01943b744`（写作辅助PR70已合，干净315测试、27独立控制、默认CI通过）。

| 能力 | 当前状态 | 交付前剩余事项 |
| --- | --- | --- |
| 原生新建/打开/保存/另存/关闭/恢复保护 | 已有生产实现 | 与新编辑内核及图片资源联动验收 |
| 正文/标题/列表/引用/基础格式/代码/链接 | 生产基础实现 | 统一原文权威与局部补丁，补齐源码/可视往返和全部常用结构混排 |
| 大纲/统计/章节定位 | 已合main | 新内核兼容、真实滚动/键盘/辅助功能点验 |
| 当前文档查找替换 | 源码导航/替换已合main | 可视原文映射与受保护片段策略、整体历史接线及真实UI |
| 可编辑表格/任务列表 | 待生产实施 | 增删改/勾选、局部原文字节、选区/Undo/保存重开 |
| 本地图片 | 平台协议部分原型已验 | 实际授权、书签、WKbroker、拖放/粘贴、编辑器与NSDocument资源闭环 |
| 代码高亮/语言选择 | 待生产实施 | 常用语言离线渲染、选择语言不改无关源范围、保存重开 |
| 高级语法保护混排/异常安全 | 有界原型证据 | 生产接线，公式/Mermaid/脚注不导致整篇自动源码；含混保存阻断与修复 |

M0与架构采纳票不虚报完成；阶段结束还须真实WK/中文输入、文件与资源生命周期、键盘/AX及相应发布门槛的实际证据。导出、文件树、跨文件、主题及高级完整渲染仍后置。

## 当前执行

### INK-PROT-032：图片授权和WK加载宿主

父票14依赖06已解决，可独立推进；不是正式图片编辑器。基线资源原型 `e7d9425b074be084883e2cf531299d22d8ed4121`，分支 task/INK-PROT-032-sandbox-asset-host，workspace wks_e36fcbf9dd426ee8，Agent 38e3d3bd-150c-4531-a047-3d18ffed6b84，Codex GPT-5.6-Sol/medium/default，host srv_MEqRNkRW6fSx。

只新增 prototypes/local-assets/native-host/ 和父README入口；签名Sandbox原生宿主、唯一scratch、目录面板授权、bookmark跨启动和文档隔离tokenbroker，明确无GUI编译/模型检查与实际OS/WK授权的证据差异。不读真实用户文件，不启动GUI，不改旧协议/证据或生产，不以普通文件读取假装授权成功。

### INK-SPEC-033：完整实施规格草案

基于生产48258a9，GLM-5.3/low完成两份文档，commit `45349758c8bfb9eba349c58524e338ea7a8d0551`。分支task/INK-SPEC-033-first-stage-production-draft；草案不是架构ADR/正式可执行规格，待管理者独立审阅及M0/12决定。Agent ece18f45-2835-4d43-8d73-4dec23ac3e92 和workspace wks_ac0bf57541dacdb5 已及时归档回收，228文件tar和bundle校验通过，累计完成workspace回收47个。

原稿和恢复材料位于归档 ink-spec-033-first-stage-draft 前缀；无产品代码或测试变更，不重复315测试。草案列完整能力与少量纵向依赖，禁止把整个prototype目录直接复制为生产架构。

### INK-PROT-034：集中补齐M0真人证据

用户明确现在可配合，desktop preflight通过，生产UI锁由管理者独占。固定页面仍为source493原型产物：sourceSHA4b8a2a3d51071ce6a5e6456f48c86f65f88d0786253f4959c768bddfc2ceca99，bundleSHA7aaa2e7f7ff79104c01bf378dd79c959a084ba7a14ce480f82a978e26c23c807，observerSHA073c1a46640c0855d7ca2c73068299519cc1faac9403de4536b7f4b906556950。

新本地独立worktree .worktrees/INK-PROT-034 / task/INK-PROT-034-m0-remaining-acceptance（基于031的52cfa06），只为宿主emit增加自身Sandbox缓存日志，不改控制器/页面/observer；build/verify/codesign通过。桌面工具拒绝Terminal，未换其它终端绕过限制；改为直接打开已构建的FidelityHost并由宿主写原生日志。

当前只做H1/H2/H3。H1基线已记录 artifacts/H1-before.json：epoch3，version2，past0/future1，原文含“正文。/测试/保护公式/After protected block.”；光标位于英文段落中间的安全原文位置31。等待用户用搜狗输入quxiao候选后Esc，仅真实composition事件与原文/历史状态作为证据。切勿在等待中操作窗口或伪造输入。

日志位于容器 Caches/InkoraM0Closure/0E1B9C06-4B35-45FB-B018-A5FB8A0F0D4D.jsonl；保留准备阶段记录，不能把CUA fixture/ASCII输入当真人中文。准备时源文末尾换行后的raw43映射到末段PM33，直接输入X被安全拒绝；重开并实际点击段内raw31后X编辑/Undo正确。该现象尚需按有界契约分类，保留原始记录，不藏为全通过，也不未经分类自动扩张M0门槛。

H1/H2/H3结果取得后才更新M0清单及票11/12；不能用用户“现在可配合”代替结果。Handoff期间窗口/锁保持，验收结束由管理者退出自有宿主并释放锁。

## 最新复核记录（2026-11-09）

032 交付 e7930fe8，Agent/workspace两层均已回收，累计48个；238文件归档校验通过。build/check/16项模型断言为执行者证据，管理者独立构建及实际面板/书签/WK验收尚未完成，父票14保持未完。

033 管理者修订稿在 task/INK-SPEC-033-production-draft-review @5962e74ad4fed7890b365b942accec5b90018c74。已补 V6 可视查找替换、真实生产源码历史能力、历史UI证据适用边界，并明确 V1 实施须先通过12。仍为草案。

034 H2/H3 本机物理搜狗证据通过；H3保留用户先删除后输入的真实变体及原追加断言失败。H1报告与事件不一致，确认按键来源为Mac本机实体键盘，正在增加宿主原生键码及NSTextView对照，尚未认定根因。详见M0-CLOSURE-CHECKLIST最新记录。首阶段完整功能与架构采纳状态不变。

## 当前并行（034结束后）

- 034@90d6135：取消/替换/源码物理项已闭合，运行时证据和独立EOF红例已提交推送；自有窗口关闭，UI锁释放。
- INK-REV-035：图片沙盒宿主独立非UI验收，固定e7930fe8；agent fad5f014-cd55-4bed-8e96-ca85f1291ab8 / workspace wks_259957138a4f7ff2，Sol5.6/medium/default。只评审/实际build-check-verify，不用桌面。
- INK-PROT-036：EOF原文锚点续写限定修正，固定90d6135；agent 2b9aef1a-9216-445e-9c9d-901f68668c7f / workspace wks_9d9a4df07dc4108c，Sol5.6/medium/default。与035共两名执行者，完成即独立验收、归档Agent并备份回收workspace。
- 目前没有配置的Paseo profile，使用已实时确认可用的模型/普通速度，未使用6.1处理例行实现。

## 当前生产迁移起点（2026-11-09）

M0按原04/029限定门槛通过；11/12 resolved。ADR-0004、术语、M0逐门槛裁定与V1可执行规格在 task/INK-ADR-038-source-authority @271922e，尚未合main。新内核并未因M0自动进入生产。

036初稿27213dd被独立语义反例退回：原文a+LF+X而PM投影aX。管理者在 task/INK-PROT-036-eof-review 补正d3ee3f0，保留输入意图证明但建立真实softbreak语义，自动与真实WK复验通过。034真人/036新WK按各自bundle分层，未伪称新bundle全面物理测试。

035审查894839a发现032启动缺陷、symlink诊断分类和模型替身漂移风险；Agent/workspace已243文件校验归档回收。036执行者也在360文件校验备份后两层回收，累计50个完成workspace。

037原生宿主补正56b5d31已推送：显式启动delegate、只读书签、WK ready队列、stale刷新作用域；真实macOS27.2 Sandbox中取消面板、文件授权→邻接图EPERM、目录授权→SHA/WK加载、退出重启书签恢复、目录移动后stale/刷新/实际读均通过。只使用唯一临时fixture，已撤销授权/删除fixture并正常退出、释放锁。symlink分类和实际并发接缝、拖放/保存迁移/最低OS仍未完，14保持未完。

**当前唯一执行Agent**：INK-M1-039，生产V1（不是新原型），基线271922e；Codex GPT-5.6-Sol/high/default（高难度内容/历史迁移），agent ad39f8d5-bff8-4ddb-8368-0abbcae9bd6a / workspace wks_b54923516c66c54d / task/INK-M1-039-source-authority-core。范围editor/src真实runtime/main/Bridge接线及对应测试文档，禁止import prototype/装依赖/GUI/新Agent。非UI交付后管理者独立复核和真实WK/NSDocument点验，完成即回收。

首阶段剩余V1–V6完整范围不变，main仍48258a9。表格/任务/图片/高亮/可视替换未完成，不能结束总目标。

## 并行补齐与后续表格规格（2026-11-09）

039生产V1继续执行。管理者已提醒canonical markdown-support旧自动整篇source规则与用户/ADR目标冲突，实施时须更新规则和对应分类测试但保留FID/ENC/EOL字节oracle；任务/图片/表格现有SYN-S009/S010/S014为目标，绝不能为当前缺实现降成D。Bridge逻辑revision与内部原文版本分别处理。

040只修补既有图片平台宿主剩余实际验证：基线037@56b5d318653cf5666db63a6d372c67848849ab7d，branch task/INK-PROT-040-asset-handler-validation，agent ad78db46-cfba-4481-9314-ef4aef74bf7f / workspace wks_642d59b1cc7f4bac，GLM5.3/high/full，notifyOnFinish。范围中间symlink ENOTDIR正确分类及实际handler/broker的stop/generation/单次回调/lease接缝；禁止平行模型假通过、GUI或改037冻结实测资料。与039共两名执行者，完成分别独立验收并回收。

041由管理者独立准备V3功能规格和12份前后字节oracle，branch task/INK-SPEC-041-tables-tasks @929dd60（前一规范提交710863e）。verify.py 12例100项字节/推导通过；锁定markdown-it table规则独立对照8份表格语义通过；24个Git blob SHA与manifest一致，.gitattributes -text保证BOM/CRLF/无尾换行。没有运行产品或宣称表格/任务已实现，不影响039实现范围。官方GFM只用于语法核对，交互与最小范围为项目决策；实施必须真控件/PM动作而非manifest手供patch。V3接线依赖V1公共会话/映射接口。

## 042真实产品验收准备

上一轮041规格与独立golden已产生可复核产物，属进展。本轮以main48258a9创建独立task/INK-UI-042-writing-tools-runtime，make build（UITesting bundle ID、锁定pnpm）和严格签名校验通过，25标题/重复标题/24定位/100+查询匹配的临时长文已准备。desktop preflight实际exit78锁屏，未启动App或调用CUA，没有伪报滚动/焦点/键盘验收；自有锁自动释放。详细docs/tasks/INK-UI-042.md和artifacts/ink-ui-042/readiness.json。

039与040两个确切Agent handle在2026-11-09约09:54UTC各核验一次：均running，无pending permission、无attention；保留同一任务等待完成通知，未重启。可独立开发和验收准备仍推进，锁屏不是整个目标阻塞。完成后仍须及时Agent/workspace两层回收。

## 最新状态：生产候选独立反例与补正（覆盖上方执行中历史）

040执行者候选7a48160已独立check；管理者补上永久PathCheck、WKSchemeTaskOutlet底层task生命周期及原errno捕获、收口等待/唯一scratch清理。最终 task/INK-PROT-040-asset-handler-review @44000811c89f6a2a71f95310a752a114188aa626：model16 + handler49 + path9、签名/静态离线校验通过，handler/path再连续三轮通过。037旧Support在同PathCheck接缝准确复现唯一中间symlink分类失败。原“在途task已释放且同址复用”风险在默认强持有适配器中未证实，未据此强加token重设计；任意外部同步callback重入也未宣称安全。父14仍缺拖放/粘贴、保存迁移、生产联动和最低OS实机。

039生产候选09376154dea90b26843780630efda096722e46aa已推送。管理者完整editor独立325/325通过；随后真实EditorView.dispatch新增5/5红：strong/em/code添加格式与paragraph→heading命令均被事务层拒绝；compositionend稳定timer后同会话晚到final导致2次document回调。故V1候选暂不接受、不合main。固定报告 task/INK-M1-039-core-review @6c4f737，冻结测试/红日志在归档root-m1-checks/INK-M1-039/，不可改原件以取得通过。

039执行Agent和workspace已238文件SHA及bundle校验备份后两层回收。040也已253文件同样备份回收。044规范审查02317d0无书面hard违反、6项判断类发现，报告与240文件/bundle备份后两层回收。累计完成workspace回收53个，已完成Agent不占侧栏。

当前两名执行者：

- INK-REV-043规格轴独立审查，固定0937615对照271922e；Sol5.6/medium/default，agent c704c947-6b6f-4c71-b3c4-ac8a2dca7f55 / workspace wks_9a5c523dfa8e6f1e，branch task/INK-REV-043-source-core-spec。只审查和有限真实反例，不修改产品。
- INK-M1-045生产补正，基线0937615；Sol5.6/high/default，agent c3648b68-c0bf-44c0-a226-565548073ce3 / workspace wks_22cc6b61dc94c2ce，branch task/INK-M1-045-source-core-corrections。恢复原先已声明基本格式/结构命令，协调runtime/main/Bridge逻辑composition发布，不用整篇serialize或放宽保真守卫。根5红必须复现转绿并纳入真实生产回归。

main仍48258a9，M0有界门槛保持通过；本轮新生产接线失败不回写旧真人材料或冒称原型无效。首阶段V1–V6范围不变，完整表格/任务/图片/高亮/视觉替换及NSDocument写作闭环继续推进。

## 当前交付与接续（覆盖上方执行历史）

043规格审查572f2bf另发现3项实际失败：无效markSaved在协议拒绝前污染保存点、::: note自动整篇源码、source no-op丢caret。报告已与044规范轴原样分开保存在root039复核分支c72d7eb，未以规范通过掩盖功能失败。043已239文件/bundle校验备份及两层回收。

045候选e92b6f489721401ae9bf0dc3734fe1e1046e02b3恢复格式/结构命令、回执先校验再副作用、未知片段混排及source selection；执行者360测试通过。管理者原5条冻结反例独立5/5绿，但加“最后发布值=当前最终raw”断言后4绿1红：唯一document回调仍发布azh，而实际已是中文。故V1继续待验。045已239文件/bundle备份并两层回收，累计完成workspace回收55个。固定新红材料root-m1-checks/INK-M1-045不可更改；根报告task/INK-M1-045-core-review @d7b74ba。

042从main48258a9真实WK已验：可视第二重复标题24定位、折叠释放空间、查找cap100/大小写、query持焦CmdZ正文不变、回正文Undo/Redo/future正常。源码大纲/查找视口不随setSelectionRange显露，保留真实失败记录5b9f353。只读/窄窗/VoiceOver未全验，不扩张通过结论。

047由管理者实际生产修复（不是新原型）：task/INK-M1-047-source-range-visibility @206aeed，已merge045并保留其删除旧fallback；新增不可见排版镜像只计算textarea.scrollTop，4条真实导航接线；查找结果改正常流及有界内滚动，解决“目标已滚动但被浮层盖住”。8项几何/真实runtime接缝、完整368editor、make lint/build/codesign通过。最终二进制c92b3f28…289f6真实WK：只读首尾大纲、查找Start可见且query保焦、可编辑source首标题返回可见。源码查找最后输入遇CUA用户焦点变化，未计通过；窄窗/AX待集中复验。退出时自有只读样稿曾弹保存提示，未归因、不虚报该项；丢弃自有会话后进程已退，UI锁释放，三份fixture磁盘SHA不变。核心IME发布内容过早仍由049修复，047测试绿不替代它。

当前仅两名执行者：

- 049生产composition稳定发布/快照：基线e92b6f4，task/INK-M1-049-composition-publication，Sol5.6/high/default，agent a90f5416-8d9f-4c72-b714-1159be04d071 / workspace wks_064a4154f3aab7d5。根最终值红已复现，要求正确稳定边界而非压次数，中间拼音不得成为稳定快照，最终统计/查找必须更新。
- 046生产离线高亮/语言选择：基线0937615，task/INK-M1-046-code-highlighting，workspace wks_b5798bc3c9c84636。GLM5.3因真实429额度终止，Agent已归档；8份未提交文件逐项SHA归档后同workspace由Sol5.6/medium/default接续，agent c5e42c80-33e8-469b-8ecf-a4a61bdf9441。唯一声明依赖highlight.js exact11.12.0（registry与官方源核实、BSD-3-Clause），静态离线语言、PM装饰与语言真实patch/undo，不改其它核心；许可证须随产物分发。

main未变，下一整合点是047接回049/046后独立运行核心/辅助/代码体验与NSDocument闭环。V3表格/任务、V4图片和V6完整视觉替换仍必须实现，不因本轮UI或辅助交付缩减目标。


## 最新：高亮集成与V3实施（2026-11-09）

046@ce77485a6056ede7ea88e14b6abac19f3d25a0fa离线13语言/选择器候选已交付。管理者核对实际Native Bridge xcresult为9/9 Passed、原版BSD LICENSE完整包含于notice且源码/build/App拷贝一致，246 tracked文件SHA与Git bundle备份后归档Agent和workspace，并删除干净worktree，完成workspace回收累计56。046通知末尾“未运行Native9”与证据矛盾，以实际xcresult为准；不把非UI当真实WK/IME。

047集成046时保留045核心/逻辑revision和047reveal，手工保留双方runtime/tests，完整editor含Bridge 22文件398/398、tsc通过。集成1360f54，接入041冻结规格/oracle后HEAD f30ef346a35d1bee790abdb257e642db219f03d9，已push；尚未合main，当前正在构建集中UI候选。

当前两名执行Agent：049保持原handle，负责IME最终值/一次稳定发布与snapshot barrier；050实际生产表格/任务列表，基线f30ef346，Sol5.6/high/default（无配置profile），agent 2a381265-4405-4055-8d90-3781dbc50b49 / workspace wks_2c898384256215db / task/INK-M1-050-tables-tasks。050须真实cell编辑/增删行列/对齐/checkbox/键盘/字节/history/保存接缝，不得手供oracle补丁，不改冻结12例、不新增未声明依赖、不使用GUI。完成即独立验收与两层回收。

main仍48258a9；M0有界门槛保持通过。V1最终IME发布未闭合，V3/V4/V6及正式保存重开仍缺完整交付，目标active。

## 当前覆盖：真实高亮与发布边界补正

046/047 组合在真实 WK 中验证了颜色、语言菜单、alias/unknown 字面值和脚本形代码的字面显示。Python→Swift 的 Undo/Redo 正确；正式 Cmd-S 后只反向替换语言 token 即与初始 SHA 相同，BOM 与 22 处 CRLF 完整，关闭重开仍为 Swift。临时代码编辑的 CUA AX 选区出现偏移，未将此计为精确选区替换通过，仅丢弃自有 fixture 的该临时会话。源码长文从文末查找 Start-042 后正文可见、查询持焦，原未执行项已补齐；042 三文件磁盘 SHA 不变，隔离 App 已退出并释放该轮 UI 锁。047 的证据记录在 82e2919。

049@50cdf2c 已交付候选。Agent 立即归档，240 文件与 Git bundle 校验备份后 workspace 回收，累计 57。根在真实 runtime/EditorView 接缝另造选区-only事务反例：2 红 1 绿，compositionend 后同步选区移动就发布 azh；单改 runtime 后发布正确但 Undo 仍回 azh，证明 session 的无 meta 选区也拆开历史。根 051@250a7cf 在两层仅让 docChanged 启动/结束输入单元，永久 4 项及完整 406（含 Bridge）、lint/build 全绿，红绿日志保留。原 049 与旧冻结原件不改，不据作者全绿直接宣告验收。

组合 047 HEAD b80a968 已包含 049/051，隔离 UITesting App 构建及严格签名通过。新窗口 IME Production 051.md 在自有 fixture 上已打开，光标在 Input here. 后，基线字符 49、字数 9；通过 async 问题请用户实体搜狗分两次输入中文/测试，尚未收到结果，绝不预填通过。UI 锁属于 root（pid59240，exec40421，FIFO /tmp/inkora-051-ui-hold），本轮配合结束后必须关闭自有应用并释放；当前不能在此物理输入期间让其他 Agent 启动 GUI。

当前功能执行只有 050（V3 表格/任务列表），未轮询或重启。新 production IME、NSDocument 完整保存重开仍待集中验收；V4 图片和 V6 可视替换未实现，main 未变，总目标 active。

用户选择本轮物理输入“稍后”：051 集中验收仅暂缓，整体开发继续。已实际确认自有 IME Production 051.md 正文仍为 Input here.，正常退出 UITesting 应用，CUA inventory 不再含该测试 bundle；唯一 fixture SHA 与初始一致，构建、分支、样稿保留。持锁进程已经 FIFO 正常退出，UI 锁释放；不维持等待窗口，也不误记物理输入通过。待用户明确恢复再重新预检和定位，不重复催促。

## 非 UI 接续：图片生产规格和原生回归

052 图片生产实施契约 744c0141f5ffb0c6fcb0b7c2d6761efbce0be973 已提交推送并接入 047，组合 HEAD 00cce96489fb50558ca014c3a4d74e112ea22b52。只新增 docs/design/local-images-production-v4.md 和任务记录；依据实际生产 image_ref、Bridge、NSDocument、Recovery、CSP，及 021/037/040 分层证据与 Apple 官方文档。规定真实导入/显示/拖放/粘贴、未命名恢复、首次保存路径内容事务、资源先发布/Markdown 最后提交、Save As 原引用不改、broker 授权/取消和完整失败矩阵。它是实施契约，图片代码尚未因此完成。

管理者对 b80a968 实跑 make test-native：实际 xcresult 为 121 项，108 passed / 6 failed / 7 skipped。六项均在 EditorWebViewTests，涉及旧 textarea/fallback 假设、CRLF 源码编辑、reload、bareCR conversion 及 composition recovery 的生命周期错误。不能仅因旧假设就忽略错误，也不能为了测试退回整篇源码；原 xcresult、完整日志、baseline Swift 和 SHA manifest 冻结于 workspace-archives 的 root-m1-checks/INK-REV-053。

已派 053 基线744c014（产品树与b80相同）独立复现/补正，Sol5.6/medium/default，无配置profile；agent e6b473a5-eba9-40ab-8265-d08cff3b093f / workspace wks_0ed404817c93ab1c / task/INK-M1-053-native-core-regressions。范围先是原生 headless WK 测试，若产品缺陷须先报告红例与最小范围；不删/skip有效断言，不开App/UI，不改050。两个执行者为050与053，完成须分别独立验收及Agent/workspace两层回收。

图片实际实施安排在该原生阻断修正后接续，保持两执行者上限。物理输入暂缓；main仍48258a9，V1原生绿灯与首阶段完整功能都未闭合，不合并失败候选或提前标完。
