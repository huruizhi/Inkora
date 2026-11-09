# 首阶段需求到实际证据的对照

本次核对生产main **c4fd38e2de57c8721057ed7c320ac6d3c1a10db1**（PR71至77已合入），其整树与CI受检545e3a94620599cedb5a35446187fbb4b05e4258一致。范围来自03、07、V1–V6及canonical支持矩阵；M0可行性由038关闭，不把旧原型物理证据当新生产验收。

最终产品代码7305b97实际editor766/766、Native179passed/0fail/8既有perf skip、Bridge双侧14/15、lint/Release-offline通过；精确最终head默认CI42692283984 success，non-UI/Release/offline/light基线通过，UI/full-bench按参数skip。SYN-S016已随PR75进入main；PR77完成本轮保护边界和源码资格生产接线。物理/最低系统/AX/正式性能预算未完成，测试数量不是整体完成证明。下方历史时点另有旧数字，不能用作当前状态。

| 用户能力 | 已执行的生产接缝依据 | 仍需闭合的证据 |
| --- | --- | --- |
| 新建/打开与UTF-8原文保真 | InkoraDocumentTests.testUnmodifiedMarkdownRoundTripsByteForByte、testUTF8BOMIsStrippedFromTextAndPreservedInEveryWrite；EditorWebViewTests.testUnmodifiedMarkdownSavesThroughBridgeByteForByte | 最新组合菜单/Finder/真实文件窗口、最低系统 |
| 正文/标题/列表/引用与marks | source-authority-runtime中的ATX→paragraph、local quote lift、cross-paragraph strong、list Enter/indent/outdent真实事务 | 最新生产物理中文、组合期操作与整体体验 |
| 链接创建/局部更新/移除 | Mod-K main真实DOM、collapsed owner、共享引用、rollback与Mod-Shift-K回归 | 实际WK字段/键盘/候选交互 |
| 代码及离线语言高亮 | source-authority-runtime的语言后续写/局部code conversion/真实Mod-Enter；code-highlighting的13语言/字节/XSS/缓存控制 | 旧047真实WK/保存重开证据保留；当前组合再集中点验 |
| 可编辑表格/任务 | tables-tasks-runtime完整黄金矩阵；root068/069表头/BOM/link owner及原生checkbox控制 | 最新WK控件、Tab/Space、AX与正式文件闭环 |
| 主动源码与跨模式历史 | 真实textarea/kernel input/apply/cancel、source no-op方向、dirty draft守卫；Native CRLF/BOM/bare-CR/UndoRedo回归 | 实体输入法、窗口焦点/组合提交与正式关闭重开 |
| 保护片段、U与邻接写作 | 冻结18例生产Session、真实main/EditorView/Bridge；脚注/callout精确块、Wiki/HTML/comment inline atom、nested quote、同次delimiter/range、S005含EOF Mermaid、旧epoch拒绝、GATE004与未解决意图控制；三轮红绿及双轴记录保留 | 最新WK真实选区/IME/键盘、整篇写作与文件闭环；不声称完整语法代数证明 |
| 大纲/统计/章节定位 | main/panel真实DOM、load epoch/拒载保持、CRLF/Unicode边界；heading-navigation测试 | 当前组合真实滚动可见、VoiceOver/窄窗 |
| 当前文档可视/源码查找替换 | 14例真实SearchPanel/main/runtime动作，完整owner/marks/字节；075/根内容版本旧结果拒绝，PR73已合 | 实际WK查询框原生Undo、焦点/候选、视口与文件保存 |
| 图片导入/展示/描述/删除 | 当前组合的真实image NodeView/alt/title/history、linked BOM CRLF table；LocalImageStore PNG/JPEG/GIF/WebP实际解码 | 真实WK各格式、目录授权/跨启动bookmark、系统拖放/剪贴板 |
| 首存/失败/重试/Save As资源 | InkoraDocumentTests.testFirstSavePublishesVerifiedImageBeforeMarkdownAndThenConfirmsManifest、testFirstSaveRejectsSnapshotThatStillOwnsDraftImageURI；runtime published retry/no-op；LocalImageMigrationTests平衡括号与reference迁移；canonical owner proof、provisional capability/ack rollback与精确receipt均已随PR74进入main | 最新系统面板取消/失败、实际授权、正式关闭重开 |
| 崩溃与pending意图恢复 | LocalImageStoreTests.testIndependentProcessSIGKILLLeavesRecoverableProductionManifestAndBytes、RecoveryStore启动discovery；LocalImageMigrationTests.testSIGKILLAfterPublicationIsDiscoveredByIndependentProcessState | 080已通过真实协调器/资源-only/确认handoff/放弃回归；真实启动恢复UI仍待验 |
| 资源授权与安全边界 | DocumentAssetBrokerTests.testSynchronousPreflightHoldsScopeLeaseAcrossDescriptorReadAndReleasesOnce/Failure、真实handler stop/generation/lease控制、非法路径/SHA/symlink拒绝 | 实际Sandbox面板、书签跨启动与当前受支持系统 |
| 真实文件生命周期 | InkoraDocumentTests save/snapshot取消/serialized saves/删除/外改/first-save failures；EditorWebViewTests revision/replay/save barrier | DocumentOpenUITests菜单/关闭取消保存放弃/冲突/只读/最近文件/Finder集中跑；不能借旧UI结果填本次 |
| 性能与支持范围 | 最终默认CI/light基线通过；fab0bcc参考模型5组及离屏WK四向量有输入/源码/bundle与原始分布，WK input→snapshot median medium109.734ms/large877.365ms/CRLF868.752ms，不重标为最后7305测量 | 实际paint/物理IME/最低系统、最终统一输入与15正式预算未冻结 |
| 键盘/AX/系统/显示 | 产品控件有真实DOM及AX名称控制；既有AcceptanceUITests测试入口保留 | AcceptanceUITests.testKeyboardOnlyOpenEditSaveCloseAndRecent/testEditorAccessibilityAudit、人工VoiceOver、深浅/放大字体、macOS14+实际运行 |

## 当前可以与不可以结算的事项

- 原文权威核心、表格任务和可视查找替换已实际进入main，不再写“只有模块/原型”。图片代码已随PR74进入main，仍不能把682绿灯叫V4整体验收完成。
- 077和080均已有root组合测试，实际恢复确认不再只是通知；083统一owner候选已独立回归；089捕获stale proof资源变更及静默拒写handoff两项，090正在补正。
- 078给出实际慢路径和失败样本；没有为make bench旧指标改绿或缩减首阶段功能。079/085已消除扫描热点并有重复分层数据，正式预算和最低系统承诺仍需后续验收。
- 物理/桌面验收按用户“稍后”暂缓，不启动App/UI、不重新催促。自动composition、jsdom、hostlessWK、scratch和真实授权/物理输入分别结算。
- 正式DeveloperID签名、公证和直接分发另属发布门槛；无Mac App Store路线。它们不替代上述功能/数据完整性/真实用户闭环。

## 2026-11-10增量证据

070/084当前cb54a96：容器引用代码、列表续段真实图片、BOM/CRLF/no-EOL经过公共编辑/source/history/savepoint往返10/10；原c21源码10/10红。组合Native179 total/171 passed/0fail/8perfskip；非Bridge587+Bridge14。080生产恢复确认已接回且两层回收。083仍在实现统一图片owner证明，原生扫描误读代码/公式不是已完成项。079中型响应改善已复现，1MB方向性<1s仍未达到。真实物理/最低系统门槛按用户稍后保留。上述均为集成候选，main仍0f93c4a，不据测试总数标记首阶段通过。

## 2026-11-10当前组合补充

070当前2fa3a9e，611完整editor/Native172通过0失败8性能skip/lint/模型五组通过。085分阶段严格解析与边界复用让固定1MB WK输入median约0.97s，但CRLF p95约1.049s；实际paint、物理IME、最低系统和正式预算仍未结算。086补正旧基线拒绝字素扩展输入，新增8项公共事务+1项真实hostless WK/BOM/Native history回归；新非法caret仍拒绝并保留原文/意图。083仍在实现统一图片owner证明，图片PR/main未因此完成。历史旧“性能超时/080实施中”段落保留作时间层证据，不代表当前状态。

## 2026-11-10 Owner proof独立审查

当前070本地d6c159b，root完整615/615、Native169通过/0失败/8性能skip。083候选删除原生Markdown owner scanner，snapshot、descriptor、保存和恢复改用accepted语义投影证明；但089两项Spec wrong尚未关闭，图片PR未建，不能标记V4整体通过。088 hard0/judgement1，089 wrong2，原文分轴保留。083/088/089已校验备份、两层回收，managed累计79；唯一实施worker090，root087同步补合法多行/容器引用定义与字段保真。旧“083实施中”及2fa测试数均为历史。

## 2026-11-10 引用定义补正

070远端已到49440e1（含087），完整679/679、Bridge双侧14/14、Native169通过/0失败/8skip及lint通过。合法多行/容器定义、转义label、空destination、BOM缩进和链接表单未改字段保真均有实际红绿；原始36项基线19红/17绿，官方26例各LF与BOM+CRLF另含HTML保护策略。087双轴091/092执行中；090仍处理owner proof两项。原生窗口、系统面板、物理IME/AX/最低系统及最终精确CI未由这些绿灯代替。

## 2026-11-10 PR74交付

PR74精确head0bc5e27默认CI42666505028 success后，按既定增量交付授权merge为main1568743；main整树diff与受检head一致。090闭合stale proof副作用与静默拒写handoff，087双轴091/092均0；managed累计82两层回收，当前无活动Paseo Agent。图片进入生产main不代替真实Sandbox/物理IME/文件窗口/AX/最低系统的阶段验收。审计发现SYN-S016裸URL/邮箱仍plain text，root093正在同一公共接缝补齐。

## 2026-11-10 自动链接候选

093代码04b7f18、证据3e8b8e9，完整711、Native179/0/8、Bridge14/15、lint/Release-offline/test-ci及固定commit五组Node模型通过。覆盖SYN-S016及与表格/任务、Mod-K、查找替换、有向选区、源码/历史和synthetic composition的组合；原尖括号oracle不改。094/095双轴复核执行中，尚未进入main，不宣称S016交付完成。当前main仍1568743/PR74，实际物理与最低系统门槛仍未执行。

## 2026-11-10 PR75与V2实证缺口

PR75 e20065c经精确CI42672764590 attempt2成功后合main11773c6；S016完成非UI生产接线，713项通过，物理门槛不变。096公共SourceAuthoritySession核查4项3红1绿：脚注定义被reference gap隐藏、callout吞普通lazy行、Wiki所在整段无法直接编辑；未闭合frontmatter及源码修复为绿控。原“高级保护片段生产接线”不能代表canonical边界全部满足，下一步V2需统一accepted opaque span/诊断与真实inline atom，不能降低D/U目标或只剩UI待验。冻结原件在task/INK-REV-096@5dbe618；两名委员会正在只读规划。
