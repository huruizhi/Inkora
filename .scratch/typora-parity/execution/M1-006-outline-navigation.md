# INK-M1-006：大纲定位与折叠空间

## 固定输入

基于task/INK-M1-005-panel-runtime-review的daec0f6（开始时核实完整SHA），承接3047c55产品面板及005真实App记录；不以main旧代码重新实现。AGENTS适用。用户授权开始下一步开发。

## 范围

允许改editor/src/document-analysis-panel.ts及.test.ts、editor/src/main.ts及main.test.ts、editor/src/style.css、editor/src/editor-runtime.ts及.test.ts；可新增editor/src/heading-navigation.ts及.test.ts作为纯映射接缝；文档docs/document-analysis-panel.md、docs/tasks/INK-M1-006.md。不改analysis/search纯模块、kernel/session/parser/schema/Bridge/Swift、依赖、原型或冻结材料。如接口不足须精确报告，不自扩范围。不得创建子Agent。

## 用户行为与契约

1. 标题行成为键盘可达的真实导航控件，按顺序区分重复标题，点击/Enter/Space把光标移到目标标题并滚动到可见；不按文本首次匹配猜测。标题里的marks、中文/emoji、Setext和容器内标题须正确处理。文字textContent安全渲染。
2. 导航请求绑定已分析快照(documentID/revision/raw)和heading原文范围；执行时同时核对当前文档、revision和raw，过期/切文档/重复load请求拒绝且不改变现有选区或焦点，不产生文档变更消息。main保留004拒绝load回归。
3. 增加最小runtime定位接口，不导出EditorView，也不引入实验ledger。结构化模式可采用当前raw的完整大纲与真实PM heading序列逐项验证(顺序、level、可见文本)后定位对应heading；只有可证明一一对应才允许。保护块伪标题/不一致时明确报告不能定位，不静默选其他标题、不强制源码模式。不得做通用raw offset→PM位置虚假承诺。
4. 源码模式使用当前原文UTF16范围，经显式BOM/EOL到textarea LF偏移映射后选择标题(或约定标题起点)，支持CRLF/混合EOL；只读bareCR可定位但不修改。映射不可证明时拒绝。不要改kernel文本或全量setText。
5. composition期间拒绝导航，不调用focus/updateState/setSelectionRange/重建DOM等干扰操作；用户缓冲、选区、历史保持。选区导航本身不改原文、dirty、保存点、revision、Undo/Redo深度或future；PM选区事务设addToHistory:false。允许成功导航主动焦点正文；失败路径保留当前焦点。不要让pointerdown先夺焦点导致composition提交绕过守卫。
6. 折叠后释放侧栏主要宽度，保留紧凑且可键盘使用的展开入口；窄窗释放面板高度。展开恢复内容与统计，不重建正文，不改变文档和历史。沿用INK-055内部滚动，页面不滚动，不遮挡正文，系统颜色。
7. 明确可见的局部失败提示，不弹全局错误、不阻断保存、不增加Bridge协议；不要为导航伪造stateChanged/revision。

## 验收

先覆盖真实runtime/PM及main DOM接缝，不只mock返回值。至少：重复同名标题点击第二处；ATX/Setext、嵌套quote/list、marks/entity/emoji；BOM/CRLF/mixed/bareCR源码偏移；编辑后旧面板/跨doc同revision拒绝；保护块含伪标题映射拒绝；composition拒绝无选区/焦点/内容变化；导航前后dirty/revision/history/future/保存点及Bridge消息数不变，成功焦点正文；拒绝load不清面板；收起root布局状态和窄窗CSS规则。jsdom不冒充实际布局/WK/IME。

只复用主仓锁定pnpm与依赖，不安装包，临时链接结束清理。不运行GUI/App/浏览器/UI测试。实际运行新专项、完整editor非UI、editor lint/build和git diff --check；符合条件可用make lint PNPM=主仓锁定路径。测试失败必须如实记录，不删有效测试或改固定oracle。提交英文Conventional subject<=72，push同名分支核对origin/clean。回报完成内容、文件、命令/结果、未完成、风险、branch/fullcommit。不开PR、不合main、不改Issue；管理者独立复核及实际UI点验，完成立即归档Agent，备份后归档workspace。
