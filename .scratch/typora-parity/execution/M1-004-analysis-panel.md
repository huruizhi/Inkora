# INK-M1-004：大纲与统计只读界面

用户表示“测试正确的 继续推进”。031本轮已结束，日志保留实际通过与未证项；不再请求重复真人取消操作。推进与M0架构无关的只读产品界面，基于已接收两纯模块的组合验证分支，不改实验原型或自动采纳新内核。

## 固定输入与范围

基线 `6831c2eae005fbc841fb651399453af40c705f2d`，其中001大纲/统计、002原文查找替换已通过独立反例及组合179项非UI测试。本任务只使用大纲/统计；查找模块保留，不提前接入可视替换。

允许修改/新增：

- editor/src/document-analysis-panel.ts、document-analysis-panel.test.ts
- editor/src/main.ts、main.test.ts
- editor/src/style.css
- docs/document-analysis-panel.md、docs/tasks/INK-M1-004.md

不修改analysis/search纯模块、editor-runtime/session/kernel/codec/schema/Bridge协议或Swift，不改依赖、冻结原型/证据与已有有效测试。若无法只读接入则精确报告接口缺口，不自扩范围。

## 用户行为

1. 打开文档即显示大纲、内容字符数及字数，并能用有明确名称的按钮收起/展开面板；正文编辑保持既有路径。列表按层级缩进，重复标题保留，空文档说明清楚。
2. 本轮大纲是只读章节列表，不渲染无效的跳转按钮；章节定位仍是后续集成/首阶段必需能力，不把显示列表冒称定位已完成。
3. 字符按已接收模块的content.characters；字数按content.writingUnits。以用户能理解的提示说明“中文逐字，英文/数字连续串按词计；标点和表情不计入字数”，字符计数说明“组合表情算一个字符，不计空白”。不把raw统计或内部契约术语直接冒充正文统计，不承诺完整Typora语言计数一致。
4. 文档加载、正常编辑、粘贴、Undo/Redo和保存点更新后，显示匹配最新文档；composition期间保持上一份稳定结果，不显示半拼音，不为更新统计调用updateState/setText或移动焦点。
5. 切换文档/重复load时取消旧计时任务，旧文档分析结果不能覆盖新文档；同revision不同documentID同样隔离。退出/销毁无残余listener/timer。
6. 内容和标题只通过textContent等安全DOM API显示，不执行HTML或加载资源。错误局限在面板，以明确状态显示，不使Bridge把正常文档误报非法，也不阻断保存或编辑。

## 接入不变量

- 主入口保留既有runtime与协议调用顺序。可增加独立编辑宿主子节点和面板，但不能在每次更新时重建/移动活编辑器DOM。loadDocument原有销毁/新建行为可保留。
- 快照来自现有runtime.getText()，revision/documentID来自已有stateChanged消息，不增加第二套编辑内容真值，不制造协议查询/虚假revision。executingCommand期间的runtime回调不能造成重复Bridge消息；显式Undo/Redo完成后仍刷新面板。
- 分析可以合并/延迟更新，但读取/分析不得在composition进行时打断它；取消组合后原文没变时可保留旧统计。无异步网络/Worker或新依赖。
- 收起/展开、分析更新或错误不得改变getText结果、dirty、canUndo/Redo、保存点、revision、selection/焦点；面板不执行任何替换计划。
- 保持INK-055滚动约束：页面不滚动，编辑区与面板各自滚动；宽/窄窗口不遮挡正文/控制；暗浅色沿用系统色，可键盘操作展开收起及合理AX名称。自动DOM检查不冒称真实WK/VoiceOver验收。

## 验收

先建立真实接缝测试：真实analysis模块+真实DOM组件，以及实际main/Bridge/runtime路径的集成测试，不只mock返回值。覆盖初始加载、真实编辑/粘贴、原生Undo/Redo命令、markSaved、快速跨文档、同revision异docID、source/structured模式、composition守卫、恶意标题、解析错误隔离、收起展开的文本/焦点/selection/history不变。分析失败可在单独组件seam注入，但主集成要走真实实现。

运行新专项、editor lint、完整editor非UI测试和editor build；实际命令/结果及失败要记录。禁止桌面/App/UI测试、安装依赖或更改M0门槛。依赖只读复用主仓锁定工具链，临时自建链接/文件清理。完成commit/push核对远端/clean，不PR不合main不改Issue；管理者独立复核、再决定实际WK检查与回收。

## 调度

profiles为空，核实OMP provider可用且实际模型为zhipu-coding-plan/glm-5.3后，采用medium/full。执行Agent `a8507558-5fa9-4f0e-8be8-b38af7ff05f2`，workspace `wks_0c68cfedb19731f3`，host `srv_MEqRNkRW6fSx`，分支 `task/INK-M1-004-analysis-panel`，目录 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-004-analysis-panel`。已取得running回执，notifyOnFinish=true。当前仅此一项执行任务；完成后独立验收、备份与Agent/workspace两层回收。

## 交付与独立复核

首稿f62ae15仅改7文件，管理者实际重跑197非UI/lint/build通过。独立真实main/Bridge/root公共接缝两反例证明拒绝stale/duplicate load仍清空有效面板，已退回同workspace限定修正，原Agent立即归档。接续Agent a1f40774-4ea2-4555-9780-c1c78d8b4c9d，GLM-5.3/low，profiles/provider已核实，无新workspace。

补正3047c55dbe6f2ad071584accfc5da99dd7f9e54c：只在合法stateChanged接受load后才重置面板/分析代际。管理者独立原2红转绿，干净完整套件14文件200项、lint/build通过；执行者202口径含临时根反例2，不相加夸大覆盖。补正Agent已归档。真实产品布局仍待管理者检查，不宣称WK/VoiceOver通过。

流程偏差：接续执行者曾向只读根RED输出追加green。管理者保留混合文件为PANEL-REJECTED-LOAD-WORKER-APPENDED.txt、按明确分隔符恢复红前缀，另独立运行绿色结果到PANEL-REJECTED-LOAD-GREEN.txt；详见root-m1-checks/PANEL-REJECTED-LOAD-PROVENANCE.md。原预期/断言未变，此追加不当作独立证据。

本地验证目录 `/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-M1-004-VERIFY`，分支task/INK-M1-005-panel-runtime-review，基于3047c55，不登记新Paseo侧栏。现准备使用隔离bundle ID及独立defaults suite做真实产品窗口检查；004代码尚未合main。

## 真实产品 App 点验与回收（当前状态）

管理者已在3047c55上构建独立bundle `com.huruizhi.Inkora.PanelReview`，持项目UI锁和desktop preflight前台运行；原生Open打开本轮临时Markdown。真实WK大纲含两级标题，字符/字数13/8；插入标点→14/8，Undo→13/8，Redo→14/8，再Undo还原，焦点保持正文。展开/收起后统计恢复。Cmd-Q正常退出，wrapper exit0；进程消失、UI锁释放、磁盘fixture SHA不变。未测磁盘保存、真实搜狗、VoiceOver、窄窗或暗色。收起目前仅隐藏面板内容、不回收侧栏宽度，明确记布局限制；大纲定位仍未实现。

验收文档已提交推送：task/INK-M1-005-panel-runtime-review @ daec0f6，见本地验证目录docs/tasks/INK-M1-005.md。主分支未改变。004的208个常规文件已tar逐字节SHA核对、分支Git bundle验证并再次核对live origin3047c55；之后归档workspace wks_0c68cfedb19731f3，回执确认两Agent归档且原受管worktree移除。累计37个完成workspace已回收。保留本地验证checkout和恢复包，不留执行Agent侧栏窗口。root-m1-checks/INK-M1-005-native保留本轮日志。

本任务接受为大纲/统计显示界面的有界交付；不宣称章节跳转、M1整体或M0架构门槛通过。后续可先补大纲定位接缝，再接查找替换界面；可视替换必须服从当前生产编辑器保真与安全限制，不能提前采纳030内核。
