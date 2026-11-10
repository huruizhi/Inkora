# INK-UX-123：原生入口、安静顶栏与宽度对照

## 授权与范围

用户确认“先补原生菜单与快捷键，再收顶栏”“先比较760/约900px，再定默认”。以`27ba9e07e7229fe13a2374c8c15be3f0c166e1c1`为基线；分支`task/INK-UX-123-quiet-chrome`，独立工作树`.worktrees/INK-UX-123`。实施[首片规格](../design/quiet-chrome.md)，不修改后置技术编辑、行内标记、图片资源策略或默认宽度。

遵循Matt implement/TDD：沿用上一轮计划的main/Bridge公共接缝；接口RED先于实现，完成后固定diff做Standards/Spec两轴复核。产品验证不要求用户重复物理输入法测试。

## 完成候选

- Native新增“插入”“显示”菜单及Edit查找，快捷键见规格；菜单项target为空，使用当前窗口响应者链。
- 菜单构造独立为`EditorCommandMenus`，生产与hostless测试共用；展开菜单queryState更新资格，执行前再查询同加载代际。
- Bridge可选能力协商扩展动作；模式/布局不增加revision，插表/有效源码提交按实际内容变化发布一次。新动作严格固定请求版本，不沿用历史命令的过期重试；reload取消旧命令。
- 原生插表另绑定queryState的有向raw选区，Web执行时比较；同版本caret已移动也拒绝，不把旧意图迁移到新位置。
- Native宿主收起常驻模式/插表按钮，删除叠加插图按钮及116px预留；普通顶栏改为不占整行的轻量入口。源码提交/取消、草稿与修复状态保留；无Native菜单的独立Web保留原操作入口。
- 提供当前窗口760/900px切换，不持久化、不改变文档、保存点或历史；新窗口仍760px，默认取舍等待阅读对照。

## 修改文件

生产：`AppDelegate.swift`、新增`EditorCommandMenus.swift`、`BridgeProtocol.swift`、`EditorBridge.swift`、`EditorViewController.swift`；Web `bridge.ts`、`main.ts`、`style.css`。

测试：`main.test.ts`、`BridgeProtocolTests.swift`、`EditorWebViewTests.swift`。

文档：`bridge-protocol.md`、第二轮计划确认记录、新增`quiet-chrome.md`与本任务。无依赖、lockfile、entitlement、保存层、schema或parser修改。

## 实跑记录（结算前）

- 首个真实main接口RED：原生`sourceMode`被旧decoder拒绝，未出现textarea；实现后原用例转绿，并证明BOM/CRLF原文、revision和历史不变。
- raw caret RED：旧选区插表被错误接受为stateChanged；补完整选区绑定后转绿，拒绝时没有表格或新revision。
- 原生main专项4/4通过，包含插表单次发布/Undo、stale/composition拒绝、dirty源码草稿显式取消。
- `make test-editor`：39文件767/767通过；Bridge Web14/14通过。最终Native结果单独追加，不把编译取消算测试通过。
- `make lint`、首轮`make build`通过；末次修改后的最终build和Native/Bridge结果待结算。保留既有Swift actor-isolation和Vite chunk-size警告。
- Native首稿测试因测试目标排除AppDelegate而编译失败，菜单构造提取至生产公共模块后解决。新双WebView测试首次过早请求snapshot，出现`InvalidTransition … failed(deinit)`；补与既有用例一致的实际editor ready等待后菜单流程走完。随后修正NSDocument剥离BOM的Bridge边界期望，保留最终磁盘编码BOM断言。临时阶段探针已删除；没有改生产保存实现。
- 引入插表selection参数时一轮Swift编译因参数顺序失败，已纠正；保留失败结果，不当作通过。

## 未完成与风险

尚未进行真实桌面菜单/快捷键/双窗口响应者链、系统图片面板或改后截图的人工视觉验收；hostless WK不代替这些证据。760/900px两档只是可供对照，用户尚未选择默认；不将当前宽窗布局或版本号当Typora整体对齐。没有启动或替换`/Applications/Inkora.app`，没有发布、PR或合并main。

两轴审查、最终门禁及提交SHA在本分支结算后追加；临时依赖均借用主仓锁定目录，没有安装包或修改依赖。


## 最终门禁（2026-11-10）

- `make test-editor`：39文件，767/767通过；最终Web代码含raw caret拒绝，之后未再改Web实现。
- `make test-bridge test-native`：exit0；Bridge Web14/14、Swift16/16；Native192 total / 184 passed / 0 failed / 8既有性能skip。两个xcresult摘要均为Passed。
- 最终`make lint build`：exit0；严格swift-format、TypeScript、Vite和macOS Debug构建通过；主JS931.81kB/gzip298.47kB，保留既有chunk-size提示。
- 新hostless WK用例经过真实Native控制器/菜单命令模块、两个生产WebView与实际布局，验证实际760/900px内容宽度、Native顶栏收起、源码往返、另一文档不受影响、Bridge正文与磁盘编码BOM/CRLF不变。它显式等待editor ready；临时阶段记录已清理。
- 未运行Release、test-ci、XCUITest、真实桌面菜单与系统文件面板，未要求重复物理输入；不宣称人工观感、响应者链键盘路由、最低系统或Typora整体对齐通过。


## 两轴复核与补正

- 固定`6c54534`：Standards 0 hard，1项judgement（`.history`承载非历史动作的命名误导）；已更名为`.editorCommand`，绑定策略不变。
- Spec发现P2：源码草稿只发布status，Native缓存的applySource资格未变化，直接提交快捷键会失效。根在main公共接缝重放RED；新增显式`observeCommands`订阅及无正文副作用的`commandsChanged`同步后转绿。旧客户端未订阅仍保留原入口，不发送它不认识的事件。Native真实WK也验证无需展开菜单即可启用提交，取消后源码模式快捷键恢复。
- 模式动作接受后将焦点交还相应编辑面；图片系统面板回调增加原document/epoch/revision复验，取消/过期不重新绑定导入。
- 新订阅用例增加至Web 768项（不含Bridge）；最终补正门禁在后续结算，不以此前绿灯替代。

- 快捷键冲突核对发现⌘⌥1/2已用于标题1/2；模式入口改为⌘⌥⇧1/2，保留原格式命令。Native菜单测试同步核对修饰键，不声称物理键盘已验。

- bd8b9eb限定后验又发现P2：视觉composition取消且无内容变化时，24ms稳定封口没有status通知，资格可能停在空数组。根新增main公共回归先红（取消后仍[]），仅在runtime真实settle的无内容分支补status通知后转绿；不增加revision/history、不改变既有IME分组/quiet window。NativeWK补synthetic取消后缓存自动恢复控制，不冒称物理输入。
