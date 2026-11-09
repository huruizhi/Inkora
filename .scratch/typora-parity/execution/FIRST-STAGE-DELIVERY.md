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
