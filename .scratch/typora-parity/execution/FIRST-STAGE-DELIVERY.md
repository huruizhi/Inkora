# 首阶段基础功能：交付总表

## PR79与当前系统续验（最新状态）

用户2026-11-10明确“不验收14版本。继续推进”，本轮取消macOS14实机/VM专门验收；14+部署目标不变，版本未测不记通过。PR79精确head `12b402f942b3989c2295cc4e5b51f6c9991edbb4` 默认CI `42727183901` success后合main `a2b6211c387d2cd1b523b1c95bd088f55e6ede93`。新增当前系统验收决定并同步acceptance/testing/release/performance；无产品、测试、依赖或权限修改。

当前macOS27.2桌面预检通过，root持生产UI锁，仅操作冻结UITesting Release bundle与唯一scratch样稿。实际系统Open→任务checkbox→表格单元格→Python语言→两处alpha替换beta→单步Undo/Redo→Cmd-S→源码no-op→关闭/Open重开均已观察；186bytes与独立预期逐字节相等，SHA `09b3933fadd1bde1511c4b0621bfe1bba8821f51da0bbc239480f49a2a4f96c7`，原样本及冻结包未改。证据在main docs/evidence/INK-PLAN-109，是真实桌面自动操作，不是实体输入法。

`01-IME.md` 已定位Input here.后，并已向用户请求两次实体搜狗上屏；尚未收到操作结果，不标记IME通过。用户此前“稍后”的桌面延期已由本轮继续推进恢复；其他授权/书签/文件/AX/显示/可见性能门槛仍逐项保留。原后文最低系统阻塞是历史时点，不再适用本轮14专门验收。109分支/remote/clean及641文件tar/Git bundle已核验，tar SHA `2e44a207fbbdca92422f6cbf2bd650f503a561d652c34c4b10f49f9eec2a52fc`；当前不回收持有活动验收记录的109工作区，managed仍92。

## PR78交付记录

生产 main `1e1e4561c7c79b36bd081e04bc54b54e8beffc41`，整树与精确 CI 受检 `624a8652a0c8fe971b166dff7d5d4b241adb8279` 无差异。默认 CI `42695919576` success，非UI/Release-offline/light基线通过，UI/full-bench按参数skip。108仅增加组合测试与验收记录，产品源码、协议、依赖和权限均无变化。

新增 `WritingLifecycleTests` 用同一 BOM/CRLF/无尾换行文章串联正文输入、任务切换、表格单元格、代码语言、可视替换、Undo/Redo、源码no-op、NSDocument Save As和新文档/新WK重开；PNG/JPEG/GIF/WebP均经真实handler/NodeView解码，原文及图片迁移逐字节核对。完整Native188total/180pass/0fail/8旧性能skip、lint通过。初始两次失败只是测试误取代码许可链接，原始summary保留；不是产品红绿缺陷。OS目录选择是既有公共注入，不代表真实Sandbox授权。

108分支/remote/clean与635文件tar/Git bundle已核验，tar SHA `1b39b6b612990f07f7f45d26e5e641c180452455c7a29a4ae83759ec09b5dd83`；实际xcresult/log另归档，3601文件逐项SHA核验，archive SHA `e675ca89b5a1bbd392cffe5c24da37892c0dfbe83d6aad7e33b32552745a1a86`。本轮没有新增Paseo Agent，managed计数仍92。真实输入法/系统文件窗口/授权/AX/macOS14/可见性能预算仍按用户“稍后”保留；新增组合证据不等于首阶段通过。

108根worktree在以上校验后已回收，远端分支/commit、tracked tar/Git bundle与实际测试归档均保留。物理包的原manifest不改写；新增verification-main-1e1e456.json确认App/九个fixture SHA未变，PR78与PR77的app/editor/project.yml生产源码diff为空。没有将108新测试称为新bundle的物理验收。

## PR77交付记录

生产main c4fd38e2de57c8721057ed7c320ac6d3c1a10db1，PR77已在精确head545e3a94620599cedb5a35446187fbb4b05e4258默认CI42692283984 success后合并；root本地FF并整树diff为空、所有最后产品源码SHA与7305清单一致、main clean。checkout/setup/lint/non-UI/Release-offline/light基线通过，UI与full-bench明确skip。旧CI42690666114只是checkout443超时，失败记录未删除，工作流未改。

103完成本轮非UI生产交付：真正块/inline原文保护、单次parser依据/ledger、U与显式source-save、保存/选区/历史/工具面板接线；原096三红、18 oracle、105三P1、107 EOF Mermaid P1均有保留的独立红绿。最终editor766/766、Native179/0/8skip、Bridge14/15、lint/Release/offline通过。104 hard0/3 judgement、106限定0/0；105/107原文与后验分别保留于PARSER-REVIEW.md，没有跨轴改写。阶段物理通过仍未宣告。

本轮四位审查者和workspace均在逐文件tar/bundle/remote/clean核验后归档，managed累计92，无本轮活动Paseo助手。103根worktree已在最终629文件tar SHA63569cc644382f1b5b6b8808eb46aaf976435891017a922a51b2558c9b7d790b及Native/Bridge/WK实际产物多版本备份后回收，远端分支/commit保留。正式CI原始JSON/log另存。

当前生产物理验收包已冻结准备（真实Release测试bundle、签名校验、raw/BOM/EOL/图片及逐文件manifest），未启动App或窗口。详见PHYSICAL-ACCEPTANCE.md；只在用户主动恢复后分批执行。剩余真实输入法/文件窗口/Sandbox/AX/macOS14及可见性能预算按03/07结算，不以766绿灯缩减或终止“完成首阶段基础功能”目标。

以下均为过程历史；其中旧“待审/未合/当前”不能覆盖本节。

## 最新检查点：103 进入独立复核，尚未合并

生产 main 仍为 acf33923081e066812603269da6a332b7c8e02e3（PR76）。103 代码固定 47c0d54735c70b9e55268ad43f9f085f08ff4dd6：真正 inline atom、footnote/Wiki/HTML/comment、nested block、同次 delimiter/raw-unit provenance、U 候选规则、D 可视删除拒绝、统计/大纲与 main/Bridge 接线已经实现。旧 source-document D/U regex 后处理和 ledger emphasis 再解析已退出生产路径。冻结 18 oracle、真实 DOM 邻接输入/snapshot/proof/search/source no-op/UndoRedo 已跑；不是只排除已知红例的控制组。

固定代码实际结算：完整 editor 760/760；Bridge Web14/Swift15；Native187 total/179 passed/0 failed/8 existing perf skips；make lint、Release/offline、test-ci 均通过。模型 small/medium/large/large-crlf/mixed 5/5，输入中位数 medium62.7ms/large704.741ms/CRLF692.015ms；不是 paint/物理IME 或冻结性能预算通过。hostless WK 性能另结算，不覆盖实际窗口。未建 PR、未合 main，独立 Spec/Standards 与 EOF/metadata、Mermaid/S、未知 gap 等边界核对仍有实际工作，不能宣告 V2 或首阶段通过。

双轴遵照 code-review 技能新鲜上下文：104 Standards，Luna5.6 medium/default/full-access，Agent a16e56a5-dd79-429b-933f-1edae9626004 / workspace wks_87d8d6dda1b12eae；105 Spec，Sol5.6 high/default/full-access，Agent 395fb388-b28b-43b9-a958-9b46e5e82ecd / workspace wks_e8e883ae29a0e0a5。受检47c0d54，固定基线acf3392。profile列表为空，已明确采用默认档位；根不把760等外部证据冒充审查者自跑。

88个已管理 Agent/workspace 归档计数不变，新增两位审查者活动中。099/100根本地 worktree 已在分支/Git bundle/逐文件tar/实际Native产物备份后回收，不混入Paseo计数。103上轮块级检查点832fd32备份551文件，tar SHA23c69e06b6c03026bc28537f349209f97dd110ca87dacbd934ab35ee8cddc094；本轮稍后另存固定47c的证据与备份。物理验收继续按用户“稍后”保留，不开 App/窗口/NSAlert/面板/XCUITest/bench-full，不重新催问。

下方含旧时点的“当前/未实现”字样，均为过程历史；以本节及最终代码/证据SHA为准。

PR77已创建draft（https://github.com/huruizhi/Inkora/pull/77），head6a366f3dd41c3c4576953e5d05f486af089bf122；产品代码fab0bcc，后续docs与editor/src整树diff为空。默认CI42690666114绑定该精确head正在执行，ui-tests=false/full-bench=false，无重复触发或假定空jobs失败。固定fab重新完整765、Bridge14/15、Native179/0/8、lint/Release/offline/test-ci、model5及hostlessWK4向量全过。103最终619文件tar SHA e30975f636f3cbd92fe77aac4b52d1b00ea016fce710a679896150ce7e2a4a61。

104纠正后hard0/3 judgement；105三P1已修：new epoch/cache身份、Mermaid S005、EOF-only metadata。106限定Standards0/0已备份回收（累计91），107限定Spec仍执行。根未以765或旧47c性能冒充最终物理验收或独立Spec。原审查原文与根限定补正在PARSER-REVIEW.md分别保留，不跨轴改写。

**当前生产main `acf33923081e066812603269da6a332b7c8e02e3`，PR76已合。** 精确head0b64d62经CI42678426122 completed/success，默认非UI/Release-offline/lightbench通过，UI/full-bench按参数skip；root本地main与该受检head整树diff为空。100最终521文件tar SHA `7fa0e0a1f88f1e151ad425169c7774b4b4a93f1e2d0da52e9d78f5ceba2f79cf`，CI JSON/log另存，临时symlink已清理。099源码保存切片已交付不代表V2全完成。

103本轮额外公共保存检查发现水平线可解析/输入却不可保存；已在PR76受检代码0b64原样重放为红，确认预存而非新parser回归。账本按accepted hr token与PM nodeSize=1显式映射后保存转绿；NodeSelection删除又暴露缺少原生replace规划，补唯一局部删除并全doc.eq验证后单历史/dirty/UndoRedo控制绿。输入`---` EOF无换行的旧有效HR回归保留，元数据开始围栏要求已有行结束，同字节打开/输入一致；该边界明确记入任务而非入口特例。真正inline保护仍未实现，103尚未完成。

最新补充：100双轴完成，101 hard0/judgement1、102 Spec三类0；两报告原文见SOURCE-SAVE-REVIEW.md。101/102均备份核验并Agent/workspace两层回收，managed累计88，已无活动Paseo Agent。root提取重复证明构造为0b64d62，定向17绿、lint/build通过，将进入精确提交CI；此前完整720、Native179/Bridge14/15/Release/test-ci仍绑定a526，不重标新SHA。

103独立task/INK-M1-103-canonical-protected-parser（基线e00）正在接parser-owned token evidence：脚注规则红先转为可见opaque，公共ledger归属检查又捕获同字节仍被definition-label/href重复拥有；账本消费同次accepted tokens/reference provenance后两条脚注控制绿，原720保持。callout在首个非引用物理行结束，原红转绿。inline atom仍未完成；新工作文件尚有已知失败，不把排除该工作文件的基线控制称为完整全绿。main仍11773c6，阶段与物理门槛未完成。

用户已将当前目标设为“完成首阶段基础功能”。范围以03写作闭环票为准；不能用辅助模块合并、原型或非UI测试代替完整闭环。

当前生产 main：`11773c66a6beef63b40f1f9191c7ef8656a27ad2`。PR #71核心、#72表格/任务、#73可视查找替换、#74本地图片生命周期、#75 GFM自动链接均已merge。PR75精确head `e20065c5e6e9f2f45567644d47d98959a5c6c624` 默认[CI42672764590 attempt2](https://github.com/huruizhi/Inkora/actions/runs/42672764590) success；editor713/713，默认非UI/Release-offline/lightbench通过，UI/full-bench明确skip。首轮GitHub在生成job前失败，未改工作流，同SHA重跑成功。096另实证V2保护边界3缺口，不能只等物理验收或据绿灯结束阶段；下述旧“当前/执行中”均为历史。

| 能力 | 当前状态 | 交付前剩余事项 |
| --- | --- | --- |
| 原生新建/打开/保存/另存/关闭/恢复保护 | 已有生产实现 | 与新编辑内核及图片资源联动验收 |
| 正文/标题/列表/引用/基础格式/代码/链接 | 原文权威核心已合 main | 新生产组合的物理 IME、NSDocument 保存/关闭/重开集中验收 |
| 大纲/统计/章节定位 | 已合main | 新内核兼容、真实滚动/键盘/辅助功能点验 |
| 当前文档查找替换 | PR #73已合main；075及root内容版本补正、568/568/精确CI通过 | 真实UI、物理IME、文件闭环验收 |
| 可编辑表格/任务列表 | PR #72 已合 main，完整 editor 485/485、精确 CI success | 真实控件/物理输入/文件生命周期与 AX 验收 |
| 本地图片 | PR #74已合main；canonical proof、恢复receipt、资源发布/迁移与真实hostless WK PNG解码均已回归 | 最新系统面板/跨启动bookmark/拖放粘贴/物理输入/文件窗口与最低系统验收 |
| 代码高亮/语言选择 | 已合 main；有真实 WK 语言选择、字节及正式保存重开证据 | 新组合回归与最终集中验收 |
| 高级语法保护混排/异常安全 | 部分生产接线；096公共审计3红1绿 | 脚注定义显示、callout精确边界、行内片段旁正文编辑须V2补齐，异常/修复及物理回归继续 |

M0 有界可行性门槛已按 038 裁定通过，ADR-0004 已采纳；这不代替新生产组合的真实 WK/中文输入、文件与资源生命周期、键盘/AX及发布门槛。物理验收按用户“稍后”暂缓，不启动 GUI、不反复催促。导出、文件树、跨文件、主题及高级完整渲染仍后置。总目标保持 active。

## 最新：PR75交付与V2核查

PR75已按既定增量授权合并，main11773c6。修正095后e20065c通过713项及精确CI；最终494文件tar SHA `27732f56cc3637dc0bf96f7d60b4d68c7aaec874b3014e88bc71a46f7bb1063e`，CI JSON/log另存archive，临时symlink已移除。094/095均已两层回收，累计84。

096独立公开会话审计已提交5dbe618（只报告/冻结测试，产品仍156）：footnote定义没有opaque节点、callout吞lazy continuation、Wiki整段冻结正文；未闭合frontmatter/source repair控制通过。root096最终454文件tar SHA `6701860564cfa7d4eee38d74390e92c06ad23bbb35092aaa297519a0387f1705`。099在main117另复现GATE004：主动源码把$x$改$y$并提交后，原文已准确但仍无法保存；实证1红，单独冻结。

097/098委员会独立与cross-check均收敛parser-owned accepted边界，PM block/inline atom与ledger共同消费，不采用独立range pass；D完整可视删除按现canonical仍拒绝；GATE004以内容状态保存来源证明与结构化资格分开，保留诊断。Sonnet额度403立即归档，098在同工作区替换为Luna high后完成；失败不当有效评审。两路结果和原始输出已纳入099，18项独立literal oracle（数据自检、不是产品通过）冻结于42ded5e，原16例及规则编号修正保留。

097/098现均Agent/workspace两层回收、removedDirectory=true，managed累计86，无活动Paseo Agent。两工作区各454文件，tar SHA分别 `cf383e36ebfae6b09c6bc7d073317f99548383ec3e84130b951f17063c563ca1`、`df4482ea142ecbcc23cf05742f8d999d28bf29f3516b8e2d5192e6cd7bef199d`。

root100已在独立task/INK-M1-100-explicit-source-save（.worktrees/INK-M1-100，起点099/42ded5e，含main117）实施GATE004纵向切片。已实际先红后绿：source save资格、非法Unicode/bareCR草稿保留、main错误阻断提示、no-op源码确认按钮；model source-proof/history/后续编辑/重载/组合/草稿/过期事务控制，真实textarea→Apply→Bridge snapshot/markSaved→UndoRedo通过。最初main夹具显式移除了BOM，其失败不计产品红；校准为真实原value局部替换后才捕获真实状态提示错误。固定代码a526136上完整720/720、lint/editor build、Bridge14/15、Native179passed/0fail/8既有性能skip、Release-offline/test-ci均通过；实际sourceSHA对git blob已核验。当前101/102新上下文双轴评审中，main仍117，尚未开PR/交付；脚注/callout/inline atom统一边界还需后续V2切片，不宣告首阶段通过。

## 历史执行状态（2026-11-10）

当前 main为 **1568743**，PR74已合；root验证其整树与精确CI受检head **0bc5e27**一致。root组合完整editor **682/682**（含Bridge）、Native **186total/178passed/0fail/8skip**、Bridge双侧14/15、lint/Release-offline/test-ci通过。另新真实hostless WK PNG scheme→NodeView解码专项1/1；最终默认CI覆盖新增测试后精确head并success。UI/full-bench按政策skip，未据此宣称首阶段通过。

- **079**：1e63a505，owner/range索引与严格raw/doc/projection上下文缓存，已接回/独立回归/两层回收。旧1MB整组超时、优化后约1.25s输入等分阶段数据原样保留。
- **080**：3ef26139，生产恢复/稍后/放弃、fresh selection确认、snapshot→持久handoff、schema3审计与安全放弃已接回；386文件tar SHA `79312a4b6403697a1b9b423c7c42acf01c96ea8d109ee3c41dc0f3e1a92b4b54`，实际日志/xcresult备份，workspace removedDirectory=true。累计managed workspace回收 **76**。
- **081**：3ef716f，引用定义first-wins、destination escape/entity解码，已接回。实际Native18/18及NSDocument保存控制2/2保留资源先发布、Markdown字节和SHA强断言。
- **082**：ac2c757，root公共接缝发现Native误识别缩进代码/公式内图片字面量；另两种容器映射拒绝由084修复。Native3红1绿/Web2红2绿及PM JSON/原件冻结，不误归因079。
- **084**：cb54a96，容器前缀provenance、嵌套code顺序映射、reference通过parser env传递而不向slice追加伪空行。原c21源码10/10红→修后10/10绿，已接回/校验备份；没有放宽PM等价。
- **085**：3a29720，单项同raw纯解析复用与完整字符串按需字素边界查询，实际Node/WK分阶段及noisy数据均保留。最终WK medium/large/CRLF输入→精确快照median133.14/970.91/964.83ms，CRLF p95仍1048.63ms，不冻结全分位数/paint/IME预算。已接回/校验备份，414文件tar SHA `ddf8bf56eaaeeaa04a27cc2c1fb00b14c5feac6e043d8078df723ae808729490`。
- **086**：实现25370d9，与085组合4991cb7，证据最终2fa3a9e。原基线8条7红1绿→修后8绿；仅淘汰raw/visual同属新字素内部、parse与PM精确相等的旧anchor，新caret/BOM/CRLF/代理对仍完整验证。校准Native BOM夹具后的旧代码明确返回grapheme错误，修后真实WK普通Unicode插入/Native UndoRedo通过。421文件tar SHA `76553fb18d6d477a92e12590cf021afa2a2c3661bc675c756b870e9e3ea293bc`，实际红绿xcresult/日志保留。085/086本地worktree已清临时symlink，不计managed回收数。

**083/088/089均已备份并两层回收，managed累计79。** 083最终d6c159b，423文件tar SHA `216a2e42f85ab8593460d26eabded06dad9bdd7479983b8f56c6299dd2635e1a`；088最终56f0b24，425文件tar SHA `4a2739c96e448c83eb6be6ab010cc96d795f879fdc9c09f88672ec1a878a0eb3`；089最终17f41a3，425文件tar SHA `b26f46c9579dfdebcbb81f25ef4f66da6d414fd60b1e6b81689f57bcaa3ba036`。实际083测试产物另存。两轴原文分开保留于 [Owner proof审查](V4-OWNER-PROOF-REVIEW.md)：Standards hard0/judgement1；Spec wrong2，不跨轴重评。

**090已接回并回收**：`33a0085708364a7109b977ea9b712bb6105eb69f`，root合并eb84ae2、消费路径测试/证据0bc5e27。完整proof在Native构建provider前与Web消费点复验；capability provisional/commit/rollback与真实草稿回读receipt闭合089两项。root实读diff并重跑公共回归；无新鲜第三轮双轴审查的冒称。425文件tar SHA `620b1a1e61cde8ac3345041374df37bb5463bbcd190df5d278bd73847c3c6ff5`，真实artifacts tar SHA `cd96a5d27f6c791a9d5b8521db4a5cffb5d46ad0d9384c52e8bf2ab7a97b0183`。执行者遗漏远端推送，root发现后代推并成功保留同SHA，再归档Agent/workspace。
**root087已提交/推送/接回070**：`49440e1b3bd7ea70974a5d671680c34f5b5c75d1`，原始起点d6c159b。实际单变量证据依次为多行合法定义被gap拒绝、仅修gap后正文引用降为字面量、修语义后ledger保存资格失败；现已接入parser接受时的字段provenance。起点新36项实际19红/17绿，修后全绿；新增官方CommonMark 0.31.2引用定义27例（26例各LF/BOM+CRLF语义比较+1既有HTML保护策略）、9项字段/历史/图片owner回归及真实main表单no-op保真。BOM+CRLF例193又捕获BOM被当成缩进空格，修后完整679/679、Bridge双侧14/14、Native169passed/0fail/8skip、lint通过。440文件tar SHA `bab8be237eec5a3e62c921d22f7222e864ce98174d77c1720548cee372c1a389`，真实测试产物另存sha `5d2d5e50be11919ac13325389c69cc1b0ea1305c8645f231dc0b542e56c2fb08`；本地worktree已清临时symlink，不增加managed回收数。

**087双轴091/092均完成且两层回收**：固定d6...494；[两轴原文](REFERENCE-REVIEW.md)。Standards hard0/judgement0，Spec缺失/范围扩张/wrong均0。091 `03b9c18`，442文件tar SHA `b88e3d94e9b583781739dc431345aab061189afff6e6cda834b6f1c925f1542d`；092 `b48ccbd`，442文件tar SHA `7746c87a48462bbfef1ae84f879e7fb3a4c8eb8edb34957bd6cd8ba05f70230c`。连同090，managed回收累计 **82**；该轮已无活动Agent，随后094/095见下。

**root093非UI候选已推送**：branch `task/INK-M1-093-gfm-autolinks`，代码 `04b7f18a26cdff156f85ed2800cdca127120e0d2`、证据最终 `3e8b8e95e348d9f9a62c274f037cc21f0afeb5cb`；起点494，已组合main1568743。SYN-S016由同一匹配器贯通parser/ledger/大纲统计、bare owner、属性编辑/移除/标签替换、native局部修改、表格/任务邻接、反向选区和synthetic composition。实际红绿包括parser0链接、owner缺失、mail目的地、属性转换caret、显式label中的URL吞外层边界；旧尖括号可视替换oracle完整保留。官方GFM6.9的14例离线oracle通过；完整editor711/711，固定代码提交后Bridge双侧14/15、Native187total/179passed/0fail/8skip、lint/Release-offline/test-ci及五组model均通过。1MB/CRLF Node输入median936.90/925.05ms、CRLF p951012.66ms；不当作WK/paint/物理IME预算。pre-silent数据及dirty源码SHA另保留，最终report commit/sourceSHA已对git blob核准。

093候选489文件tar SHA `f748f1d3572cf0a4b6b30d0ffd0ffdb482304b6aad61921f5ba273a3ed680a13`，临时symlink清理、worktree clean；未建PR/合main，等待下述独立复核。070最终450文件tar SHA `77230f07334881c5ce2dd670683606054fca9ce4e23683206b60b68c98388bc3`、最新真实artifact tar SHA `3086438e07bc2e5a3819eb06185f112bd2687a160fec94b16697de0a9b2544fd`；临时symlink清理，不增加managed回收数。

**093双轴094/095均已完成并回收**：固定 `1568743...04b7f18`，Standards hard0/judgement0；Spec wrong1/P2，邮箱及mailto/xmpp缺共同起点边界（missing/partial0、scope creep0）。两轴原文分开保留于[GFM审查](GFM-AUTOLINK-REVIEW.md)。094最终8df46e5，tar SHA `b11e49bc55869f03696adfb385a679da1b7a682b85650531b18705154629cb25`；095最终ffcc25f，tar SHA `3a8820787101f303f038583531c62488d78f0bd8f284429c9e78205f9b46eb4e`。两层归档已核实，managed累计84，当前无Paseo实施者。root在093实际先红后绿修正边界，公共会话+14官方控制28/28，完整测试进行中；尚未建PR/合main。
物理验收仍按用户“稍后”，不启动App/窗口/系统面板、不反复催问。hostless WK、普通DOM文本、synthetic composition、scratch与真实SIGKILL分别结算，不代替物理中文、当前Sandbox/bookmark/系统拖放粘贴、真实AX、窗口文件生命周期或macOS14。总目标active，main未因本轮变化。

## 最新交付（覆盖下述历史）

075已接回071，root额外公开接缝复核捕获“编辑→Undo回同字节接受旧结果”，以session内容版本绑定补正，未增加Bridge字段；导航和替换各自负例+6嵌套/link控制，完整568/568、lint/build、14/132通过。PR73最终head `ca797b8448a31ee296d10501d2cb062343db26dd`，默认[CI42636348772](https://github.com/huruizhi/Inkora/actions/runs/42636348772) completed/success（UI/full-bench按参数skip），已merge为当前main0f93c4a；整树diff已验证一致。首次merge连接器断连经重新查询确认未合后重试成功，不重复提交。

075的367文件/tar/Git bundle校验备份后两层回收，累计73；tar SHA `22405fb484b58157568342844ba63f7023ed719d463cb94affc3be79b7fb92c9`。唯一Paseo实施者为077，仍固定a58处理图片四项；root078独立补性能测量（模型新入口+离屏WK接缝），原版WK专项实跑exit65，尚未冒称修复或预算通过。物理验收仍稍后。

## 最新执行指针（2026-11-09，覆盖后文历史）

- PR #71 已合入 main `1e68608`；包含 059/061 链接/代码命令、root 062 表单默认行为保护、root 063 属性修改后的 caret provenance。最终默认非 UI CI [42621826345](https://github.com/huruizhi/Inkora/actions/runs/42621826345) success；物理步骤未冒称通过。
- PR #72 已 merge，精确 head `c50133e1353aa0339f5aaf396e47b234b42e7161`，main 为 `0edb13d` 且整树与其一致。068 补正表头插行索引/BOM 表格账本，069 补正表格链接 owner/共享引用计数；完整 **485/485**、lint/build 通过。最终 [CI 42626828782](https://github.com/huruizhi/Inkora/actions/runs/42626828782) success，覆盖非 UI、Release 离线与轻量基准；UI/full-bench 按参数 skip。旧 b30b368 checkout 超时及重跑成功、24fcf9f CI 成功只作历史分层，不替代最终 head 证据。
- 060 合并最新 core/V3，HEAD `fc18f78da7dc6a6000e6aca2a67d9345e0396806`，完整 editor 511/511；11 个冻结 replace-all 正例及 140 处真实面板单历史批替换通过。root 066 新造 7 项控制为 5 红/2 绿，暴露 code owner caret、跨 marks 替换和字面 Markdown 输入问题，故 V6 仍未交付。
- 066 已交付 `c6845c7a741b092ee48f0aa68bbdd610442758dc`。作者完整 545；root 将冻结原件按 SHA 不变复制重跑，**7/7** 全绿，随后在 `task/INK-M1-071-visual-replacement-integration` 接回 main，初始完整 **550/550** 通过。root 新造同一 autolink 两次命中真实红例，修复 owner 全范围补丁冲突及批替换续写的锚点归属；以真实 `deletedAcross` 区分已删除位置，保留表格删除语义与未编辑 gap/affinity。最终 **552/552**、56 项表格/owner 控制、make lint、production build 通过。完整 14 面板动作已核对，无 manifest 补丁执行路径。
- [PR #73](https://github.com/huruizhi/Inkora/pull/73) draft，已推进文档同步 `c9e247defa790db399f6286f8e83086b736bfd4d`（产品代码仍为c0），base为main `0edb13d`。原精确c0默认 [CI 42630358139](https://github.com/huruizhi/Inkora/actions/runs/42630358139) **success**；最终补正后另跑精确CI。双轴固定 `0edb13d...c0b3756`：[审查原文](PR73-REVIEW.md)分别保留072的一处文档规则背离/judgement和073的两项Spec缺口：同内容新runtime可接旧epoch结果、合法嵌套strong/em可搜不可替换。073实跑2/2红，PR继续draft，不以CI绿绕过Spec。
- 075实施：Sol5.6 high/default，Agent `0e96521f-fc3a-4de1-892b-952238bc2c13` / workspace `wks_c8831901210f29b8` / branch `task/INK-M1-075-search-epoch-nested-marks`，固定c9e247d。只修073两项，先真实红绿，保持root071原文/marks/owner/caret/批次历史与安全拒绝，不合图片或改冻结oracle；无新Bridge/Swift字段。完成后root接回071和070并独立核对。
- 055 图片候选 `056f74fa` 已校验备份并回收 Agent/workspace。根实际读取 Native xcresult：148 total / 141 pass / 0 fail / 7 性能 skip；BridgeNative 12/12。此为候选非 UI 证据，不是图片授权、拖放、剪贴板或生产窗口验收。
- 原055双轴报告见 [V4 审查原文](V4-IMAGE-REVIEW.md)：064为0hard/judgement，065为3P1+2P2，原候选未直接合入；五项已由067修复并接回070，仍待下述组合复审，不改写旧报告制造通过。
- 067 已交付 `96703899dbd29d170316aa31b8e86320b5056e7e`，固定055起点五修：首次保存publish/confirm分离与真实owner snapshot屏障、CommonMark标签迁移、持久selection意图、journal重启只读核验、显式grant/真实read后ready。root已读取候选xcresult并单独保留：Native152/0/7、BridgeNative13/13；非物理授权证据。执行Agent/workspace已312文件/tar/Git bundle校验备份回收。
- 070最新 `a58b8ba1edddb7863856214b9c36f0893030bf11`（branch `task/INK-M1-070-image-core-integration`），产品代码与实际受检9e952ff完全一致已gitdiff证明。core/V3/V6/067组合 **570/570**（含WebBridge14）；root独立Native **159 total / 152 pass / 0 fail / 7 skip**（含NativeBridge13）。最终 make lint、release-bundle-check（Release+offline smoke）、test-ci均exit0；既有Swift/JS chunk警告保留。descriptor先ack后副作用、epoch/selection/跨控件composition联合守卫保持。未合图片PR、未做物理授权/显示/输入/保存关闭重开，不代表V4完整验收。
- 070组合双轴复审固定 `c9e247d...a58b8ba`（仅V4 overlay），[两轴原文](V4-INTEGRATION-REVIEW.md)完整分别保留。074 Standards `f962ea3`：无hard，安全读文件语义重复等judgement；076 Spec `c671c6d`：首存失败后无Undo重试/异目标锁死、Bridge接受前pending manifest缺启动发现入口、括号图片URI截断、命名图片同步预检缺scope lease。非UI通过不能抵消这四项。
- 077实施：Sol5.6 high/default（无命名profile），Agent `a71a5803-135a-454c-bfdf-4a32d955306d` / workspace `wks_b6433d1df099cb22` / branch `task/INK-M1-077-image-retry-recovery-scope`，固定a58b8ba。四项分别实际红绿、公共保存/恢复/broker接缝，保持owner/历史/selection/授权失败保护；不合075，不开GUI，不新加Agent或依赖。
- 067、072、073、074、076均已校验备份并两层回收，累计完成 workspace **72**。074备份381文件/tar SHA `1a9889e3c984e08b2b9fc2f82a9fc84c88cb94648bcac4c391f089e4a4fa1246`；076备份381文件/tar SHA `0eb29db643fdae77e1b8c8bd74f576060d59223f4465f4090033430134d69f01`。当前两名实施者仅075与077，root负责独立接收、组合和性能覆盖核查，不保留空闲Agent。
- 性能票15的旧12依赖已解决；实际核查现有Node轻量bench仍调用旧InkoraEditorSession/整篇serializer，不能代表新source-authoritative runtime输入、模式或snapshot。root将在独立078分支新增实际生产路径测量，保留旧指标与样本，不将Node/离屏WK/桌面物理混为同一层或提前承诺最低系统预算。

本节为进度文档修订，不因此重复未改产品测试或把待执行检查记成通过。

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

054 可视查找替换契约/独立 golden 已推送到 task/INK-SPEC-054-visual-search-acceptance（主产物88f1dee）。14 对 input/expected、132 项标准库 SHA/字节推导校验、28 个暂存 Git blob SHA 一致，含跨 marks、链接同字目标/标题排除、实体/转义、代码定界符、表格/任务、保护片段邻接、140 个全替换、Unicode/no-op/epoch。它们是实施前判据，不是已执行的产品测试；后续 V6 必须真实 SearchPanel/PM 入口和整批单历史事务通过，不许把“只计数/不可定位替换”当最终状态。

050与053各确切handle在本轮核对仍running、无pending permissions/attention，没有重启或新增第3名Agent。Native的7个skips已逐项核对为5项PerformanceBaselineTests和2项PerformanceWebViewTests的按需基准，不能称121全过或最低OS/性能已验。

## 当前：原生回归收敛与图片正式实施

053@8c973626018e5dd5a858e043ce4c3b44ed2b897b 候选已交付。根检查修改：CRLF源码走真实入口/input/apply/snapshot，mixed可视与bareCR只读分开，composition迁至真实PM DOM且保持revision/recovery/blur/selection/UndoRedo强断言，reload要求新页面token与版本化snapshot；未改产品。实际候选Native xcresult 114通过/0失败/7跳过，Bridge9通过；Agent先归档，299个tracked文件及Git bundle与实际xcresult/log备份后workspace回收，累计58。

整合分支合入053后根独立 make test-native 同样121项114通过/0失败/7性能跳过，强断言保留。Release离线检查、完整BSD副本、严格签名、CSP/脚本及14部署目标通过；本地UITesting Release有get-task-allow，仅是CI资源构建，不是DeveloperID可分发产物，不将其冒称发布签名通过。证据及当前任务状态在047@93a3b5933b8ca2ae221681bb5afc480e83bb247d，main仍48258a9。

055本地图片生产实现已正式启动：基线7d20ed4，task/INK-M1-055-local-images-production，agent 6ce1aa7e-d799-4a97-a40a-f63fd80c52aa / workspace wks_28e2b6ca347d9098，Sol5.6/high/default，无配置profile。必须真实插入/图片投影/拖放/粘贴/未命名持久恢复/首次保存路径内容事务/资源先发布Markdown后提交/SaveAs原引用不改/Sandbox broker及失败负例；不能整目录搬原型或只交模块。禁止GUI和新Agent；与050表格/任务两名执行者并行，完成后逐项验收回收。

已通过GitHub连接器建立草稿 PR #71：https://github.com/huruizhi/Inkora/pull/71 ，head93a3b59、base最新main48258a9（fetch和祖先验证已执行）。内容为V1/V5/导航与其证据，不把V3/V4/V6规格当实现，也不解除用户暂缓的物理IME步骤。默认CI手动触发中（ui-tests=false，full-bench=false）；仍需CI/独立审查，不启用自动合并、不提前宣告首阶段完成。

workflow_dispatch 已实际返回 run 42611845164：https://github.com/huruizhi/Inkora/actions/runs/42611845164 。随即按分支列表尚为空，属于索引延迟；保持确切run handle查询，不重复触发，不把此时CI记成功。Paseo两执行者继续；根临时.tools已清理，UI锁未持有，未启动新的App。

## 当前覆盖：PR71审查与V3独立集成

CI 42611845164 已实际 completed/success，受检 head 为93a3b5933b8ca2ae221681bb5afc480e83bb247d；默认非UI、离线Release与轻量基准通过，UI及完整基准按参数跳过。PR71仍是draft，不能把CI绿灯当成规格审查通过。

057 Standards@927bde00c16bff16eb8781f29e2ff9f134b3364d：0条hard、5组judgement，不阻塞。058 Spec@c9a57a0d3380ad6697b9498ac3ce77773a0ad5af：2项P1，生产Mod-K创建链接入口缺失、多块内转代码/Mod-Enter退出被拒并阻断snapshot。两轴保留各自报告，不合并评级。两Agent已归档，分别303 tracked文件SHA/tar/Git bundle校验备份后工作区回收；累计61个完成workspace（含050）。

050@eb703563ea1e7367e5446a1ff62a021600114804已交付表格/任务候选，291 tracked文件及实际Bridge Native9证据备份后两层回收。根在独立task/INK-M1-056-tables-tasks-integration（.worktrees/INK-M1-056）合入050并保留049/051封口逻辑；组合基线451测试通过。真实input.click()检查又复现取消默认激活使checked与raw不一致、状态字符补丁误绑正文anchor导致第二次切换失败，以及isComposing Space/Tab被消费；单变量修复后8项新接缝和完整459测试通过。原12例100字节/8语义oracle保持，native/lint/build仍在本轮验证。不是WK/物理IME/完整阶段验收。

当前实施Agent仅055图片（原handle保持）与059链接/代码块补正：task/INK-M1-059-link-code-commands，基线93a3b59，Sol5.6/high/default，无配置profile，agent6c42e3f5-fd39-4682-854a-d3b669f3e1b1 / workspace wks_95b8e9310529800a。059须真实生产DOM/keydown入口、过期与composition守卫、局部补丁、字节/选区/UndoRedo，不开GUI、不改055/050、不新建Agent。用户物理输入继续按“稍后”保留，main仍48258a9，总目标active。

056本轮已完成非UI集成：修正1a8fbb5、最终9e169500d57c64d5d60a7c8f8ab2f592897d794c已推送，local/origin一致且clean。完整459、lint、Release离线资源通过；实际根Native xcresult为121 total/114 passed/0 failed/7按需性能skipped，含Native Bridge9，Web Bridge12在全量editor内。临时.tools链接已删除，未占桌面；正式表格/任务文件保存重开和物理/UI仍未验。056保留独立，等待059修正后再次组合；PR71仍受原两项Spec阻断，不把独立V3绿灯混入旧PR受检head。

## 当前覆盖：链接补正再审与可视搜索实施

059@4a76ce61379484f88e70d21d1a262fee0a1a3a65已交付414项非UI候选，但管理者真实DOM/Bridge复核另造4红：collapsed caret更新现有href无实际修改；链接框composition点击Cancel毁候选；链接框持焦Native Undo撤销正文；flag-only composing Cmd-Z被消费。冻结main-red.test.ts/RED.log在root-m1-checks/INK-M1-061，SHA分别5eafd7c359ea2532099043fe64d12fd6ee48cb8c77f9dae2c69895cf08246e87与137904850fc7b5a036a2372c3fe8b6a074c3f3ad9ab3ec83f4428253147cd029。059 Agent归档、303tracked文件/bundle/tar校验备份后workspace回收（累计62），候选尚未合PR71/main。

061在实际059树上先提交根四红70b586f，再由Sol5.6/high/default接续限定修复；无配置profile。task/INK-M1-061-link-input-guards，agent adc30f4a-c0e6-4572-aa0f-ebf1c3e5d47e / workspace wks_0576bc8f76bbce80。要求真实ledger link-owner而非同href盲合并、原子选区恢复，以及链接字段/候选/Native命令/跨load/导航统一守卫。禁止GUI、新Agent和依赖；与055图片保持两实施者并行。

根060在独立.worktrees/INK-M1-060、task/INK-M1-060-visual-search-replacement接回054冻结判据并实施前两个切片：真实SearchPanel改搜PM可编辑内容，准确排除href/title/info/工具栏，跨marks连续但不跨paragraph/cell；索引定位真实PM选区且query持焦、源码精确原文选区、零Bridge/history变更。旧6vs3计数和无定位按钮均先红后绿；全量26文件477 passed，lint/build及冻结132检查通过。仍未实现原子替换，不能宣告V6；详细进行中清单docs/tasks/INK-M1-060.md。14例现在只核对input内容计数，不冒称expected替换字节已过。物理/UI继续按用户稍后，main48258a9、PR71 draft。

## 2026-11-10 Source-save候选独立审查

固定main117...a526136。101 Standards：Luna5.6 medium/default，agentf9fddad0-30d9-4440-b616-3edfabb78531 / workspacewks_b95f76f02369eb98；102 Spec：Sol5.6 high/default，agent76e6355e-332c-498a-ba47-32cad9cd8d71 / workspacewks_314acf2f5014fe3c。实时profiles为空，inspect后按既定成本fallback。只审不修、禁止GUI/新agent/安装/全量；完成立即备份并回收。主目标active，当前main117，物理按用户稍后。
