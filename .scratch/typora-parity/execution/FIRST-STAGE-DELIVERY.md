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
