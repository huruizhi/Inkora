# 节点工具与技术内容导航

基线`main@d5d434e37ed7be8f1719614a3a642c2e458a73c6`。延续[第二轮计划](typora-ui-round2-plan.md)第3项剩余核对及第4项，PR #88已经完成表格工具与局部标题间距。本切片不扩大为局部TeX编辑、行内数学、主题、导出或行内分隔符显隐。

## 固定事实与实施边界

当前代码工具含语言select、status和一个常驻第三方许可anchor；许可打包要求与入口实际可用性须分开核对。图片NodeView每次render重建描述表单，描述按钮当前常驻；未授权/缺失/损坏与成功图片态必须分别报告。当前脚注导航按label查询第一个匹配DOM，返回没有记录真实来处；公式成功与失败均只有“请在源码中修改”的文案，尚未在此入口绑定精确位置。

这些是源码事实，不等同于已证明的全部用户缺陷。实施者先核对生产接缝和可证伪的最小反例，再提出有限接口；未证明的几何、真实授权和物理输入不冒称通过。主会话不把保护节点变成可编辑原文，也不允许按文本第一次出现猜测位置。

## A：INK-UX-142 代码工具与图片态核对

第一阶段只做有界事实/反例与接口建议，回报主会话后再实施。核对代码许可是否可从当前真实WK离线打开、焦点返回和正文状态不变；提出语言为主、许可次级且键盘可发现的最小界面。不得仅把失效链接藏进菜单，也不删除许可资源。

使用真实生产图片资源路径核对成功图片态的描述控件占位和键盘入口，分别检查未授权/缺失态授权定位持续可达。检查描述表单取消、composition、重新render和旧意图是否已有可信边界，有限反例成立就立即报告，不先修改图片资源策略。没有成功解码的图片不能称成功态几何证据。

可拥有code-block-view.ts、image-view.ts及对应测试，可新增独立同域CSS；不改table/writing-surface/style.css/parser/ledger/Native/Bridge。runtime与context-tools接线必须先协商，避免与B并改。不新增依赖或泛化弹层框架。先核对后固定独立产品提交，不把图片未定决策默默丢掉。

## B：INK-UX-143 技术修改入口与准确返回

第一阶段核对现有canonical/provenance、公开runtime/source选择路径与预览DOM；用同label至少两处引用证明当前返回来处问题，核对公式成功/非法两态是否存在真正可执行入口，提出精确source范围与生命周期绑定接口，先发主会话，不直接编辑runtime。

实施目标是在已有保护边界内使公式/脚注的安全源码修改入口可发现、可键盘到达，并定位当前接受原文的精确范围；脚注从任一引用跳到定义后可准确返回本次真实来处。预览不成为owner，不使用DOM文本或substring首次匹配重定位。导航/返回/取消不发布正文、不增加revision、history或dirty，原选区按明确策略保持/恢复，composition不被额外调度打断。跨load/destroy、同raw新epoch、旧detached按钮、范围/原文/选区变化要明确拒绝或关闭，不改投新文档。

只调用既有主动源码草稿、提交/取消和保存资格路径。保护raw仍只读，完整删除仍按canonical拒绝，GATE-004不改。进入源码时精确选择范围；取消可回可信位置，提交保留范围外字节。若现有接缝无法证明这些绑定，先提出小接口设计，不用更宽的扫描器或放宽doc.eq。

可拥有technical-preview.ts、protected-preview.ts与对应测试/独立样式，以及经主会话确认后的editor-runtime.ts最小接线；main/schema/context-tools接口先协调。Mermaid只核对已有异步取消与代码入口，只有实际复现问题才修，不重写渲染器。无Native/Bridge/依赖变化。

## 总体范围及验证

代码许可、成功图片态及技术内容导航都是总体目标中的待收口项；本轮先核对再实施，不以其中一项容易完成替代其余项。图片表单若发现独立缺陷，主会话明确安排后续归属，不靠删控件避开。行内标记原型及局部公式编辑仍在独立决策前沿。Sandbox/系统面板/人工VoiceOver/屏幕paint的历史证据边界不改标通过；用户取消的macOS14专项与重复物理IME不复做。

统一禁止App启动、显示窗口/系统面板/CUA/browser/XCU/物理IME/macOS14专项及新子Agent。允许不可见NSWindow/WK和公共runtime/DOM接缝，禁止以JSDOM替代几何。只暂借主仓锁定.tools与editor/node_modules链接，不setup/install/改依赖锁。先有限真实反例和定向检查，完整非UI/Release/默认CI由管理者在最终组合集中结算。

中文任务/evidence独立记录，必须区分作者与自跑证据、隐藏WK与实际paint；英文Conventional提交并push/核对remote与clean。产品归属接口先确认，禁止改其他worktree。工作树和临时证据保留至管理者独立两轴审查、两层备份后回收，不自行PR/merge/安装。

## 第一阶段证据后的接口裁定

A142的不可见真实WK证明：生产broker校验并解码的PNG可显示；许可点击请求新窗口而现有Native返回nil；描述草稿在descriptor刷新后失去DOM/焦点，composition期间提交被现有guard拒绝，但未composition的detached旧form提交仍可修改原文。B143公开runtime/DOM反例证明：第二脚注引用返回第一处、两种math均无实际修改入口、源码定位取消改变原选区。以上是各作者实跑，管理者核读源码与日志，不转称为管理者自跑；隐藏WK/DOM不证明paint、物理输入或Sandbox授权。

据此批准两Agent进入实现。A独占code/image NodeView、同域测试/独立CSS及context-tools.ts最小image识别/F10接线；runtime仍由B唯一维护。许可采用现有打包许可全文的离线只读次级面板，不用fetch/iframe/新窗口，不改变CSP或Native。图片使用稳定草稿表单、不可变expectedNode、alive/openEpoch/connected守卫及明确取消，descriptor更新不拆composition；不以stopPropagation绕开全局保存/模式资格。成功图片控件候选先用有尺寸已解码图片验证选择/焦点可达及不占正文流，失败授权定位保持明显，不直接隐藏唯一键盘入口。若确需runtime输入资格接口，A先提案，由B按管理者协调接线。

B的TechnicalTarget/ReturnContext保持runtime私有，绑定同runtime/load、exact raw、version/epoch、唯一canonical范围及expected node/getPos；preview只接展示回调。captureProtectedRanges会合并相邻范围，不能用作节点精确owner。确有必要时允许B在source-authority.ts增加最小只读技术target capture/validate方法，复用已有canonical parse/provenance，不改parser/ledger/事务或普通源码取消。技术取消在绑定仍有效时恢复原PM和有向raw选区，dirty取消也恢复入口前位置；成功apply含no-op后清理返回上下文。过期上下文不得自动取消新草稿或复活旧文档。main/schema新增接口仍须先协调；状态通知使用既有status路径，不新造UI旁路。

两者保留第一阶段坏行为证据，再以预期正确行为锁住真实RED→GREEN；“断言坏行为成功”不记为产品修复通过。新增接口均服务已复现问题，不扩为通用编辑状态框架。
