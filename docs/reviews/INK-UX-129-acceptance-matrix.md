# INK-UX-129：侧栏与标题行独立验收矩阵

本矩阵依据[实施契约](../design/typora-sidebar.md)及用户原图/追加四条交互建立。它是待执行的完成审计，不是测试结果，也不能用Agent“已完成”回报替代。当前审计基线为管理者分支`348d757`；130/131/132仍在实现，全部要求默认未证明。

## 证据使用规则

- 每项同时检查实际生产调用路径和对应的可观察结果；新接口只在测试中调用、生产仍走旧路径，视为未完成。
- 行为测试来自既有main/DOM、Bridge、真实临时目录、NSDocument公共接缝；不能以私有计数器、CSS类名存在或手工构造的成功JSON单独证明完整功能。
- 对动作前后的当前原文、BOM/EOL、revision、dirty、保存点、history/future、有向选区、活动输入DOM和焦点作相称断言。UI动作不得冒充正文提交。
- GUI、物理IME和macOS14专项不属于此次自动门禁。对标题行与布局可使用不显示的Native窗口/WK坐标和hit-test证据，必须明确未做屏幕实机观察。
- 精确最终HEAD只结算一次完整非UI/Bridge/Native门禁、Release离线检查和默认CI；发现新失败或后续改动才重跑相关项。禁止重复启动App/XCU来补证据。

## 逐项证明义务

| ID | 用户要求 | 必须检查的生产路径与反例 | 当前状态 |
|---|---|---|---|
| SB-01 | 最右按钮控制整个左侧栏 | 大纲/文档/搜索三个状态均可开合；不存在额外三横线角落按钮或角落模式切换；菜单/快捷键仍可达 | 未证明 |
| SB-02 | 侧栏顶栏和大纲 | 视图名/动作tooltip随状态正确，重复标题保留原index，搜索过滤后仍精确定位；组合草稿不参与过滤 | 未证明 |
| SB-03 | 文档列表 | 真实授权目录→卡片，嵌套同名文件、自然排序、扩展名淡化、当前文档标记；相同文件名不靠首次命中打开 | 未证明 |
| SB-04 | 授权和原始字节 | 仅文件授权不能枚举父目录；根/中间/最终symlink拒绝；读出的BOM/CRLF/Unicode字节与原件相等，目录lease持有到读完成 | 未证明 |
| SB-05 | 边界与外改刷新 | 大小、总量、深度、数量、无权限、编码、空目录可见；文件新增/移动/删除后索引安全更新；取消/换目录/销毁无scope泄漏或迟到旧列表 | 未证明 |
| SB-06 | 文件夹搜索 | Aa/整词/正则均真实执行，按文件分组且显示行号；字面特殊字符与正则开关可区分；非法/病理正则错误或超时可恢复，未完整结果明确提示 | 未证明 |
| SB-07 | 异步与输入 | 改选项但query相同、清空query、跨doc/相同raw重载、旧catalog/旧detached按钮/迟到open错误均有反例；候选IME不提前搜、不夺焦点 | 未证明 |
| SB-08 | 同窗口文档导航 | 先验证目标再关闭当前；dirty Save/Discard/Cancel、源码草稿、未解决意图、目标已开窗口均沿用真实NSDocument身份；取消不新开空窗或丢文档 | 未证明 |
| SB-09 | 精确搜索定位 | fileVersion绑定exact bytes；UTF-16范围包含BOM、CRLF、非BMP/ZWJ；文件变更拒绝旧位置；重复内容定位选中命中；保护区/源码位置明确提供选择 | 未证明 |
| SB-10 | 正文与侧栏隔离 | 侧栏输入持焦时Native Undo/Redo拒绝改正文，回正文后恢复future；所有来源composition守卫模式、导航、资源动作；无虚假stateChanged | 未证明 |
| SB-11 | 真实标题同行 | 原生文件名与工具在同一窗口标题行，不是正文H1；系统按钮安全区、Native拖动层hit-test、480px与宽窗、Native/standalone均有几何证据 | 未证明 |
| SB-12 | 默认隐藏和5秒 | 初始隐藏，移入即时显现，移出4999ms仍可见、5000ms隐藏；重入取消旧timer；menu/focus/候选保活；旧窗口destroy/reload不留timer | 未证明 |
| SB-13 | 统计选择 | 四项真实值与原统计模块同源；当前项checked，选择后摘要变化且菜单收起；鼠标/键盘AX可达，刷新/切模式仍保留所选口径和caret | 未证明 |
| SB-14 | 两阶段动画 | 正文先让位，侧栏内容后出现；关闭、快速反向切换、resize、窄窗、reduced-motion均达到正确最终几何，不只检查class；EditorView身份/选区/history稳定 | 未证明 |
| SB-15 | 完整回归与交付 | 各分支内容经管理者独立检查并组合；最新main祖先、精确HEAD CI成功、Release身份/资源校验；安装仅一份正式App且不强退作者文档 | 未证明 |

## 当前已有而不能外推的证据

- 交接前真实`SidebarCatalogTests`四项通过：目录基本枚举、BOM/CRLF打开、旧token与symlink、搜索与上限等有限样本。不覆盖Native授权、进程间来源、窗口切换或真实scope行为。
- 交接Web三文件为149 passed / 1 failed，失败为错误note丢样式；不能记作面板通过。
- C交付`348d75766209c683b4c19f5a38f53d9ae376b5d0`并报告tsc通过。管理者已fast-forward吸收该提交；在组合验收前，此处只记为作者报告，不冒称管理者重跑结果。
- A/B初次provider终止为Bad Request，工作树未改；已在原Agent原工作树恢复并收到真实检查回报，不另建重复执行Agent。没有据此缩小任务或取消证明义务。

## 结算方式

各Agent交付固定SHA后，将每行状态改为“已证明/未完成/证据不足”，填入实际命令、测试名称、结果和生产文件位置；保留失败与补正历史。任一必需项仍未证明，不宣告侧栏完整完成，更不以侧栏一片代替整个Typora体验目标。后置正文间距、节点工具密度等沿既有规划推进，不顺带并入本大改。

## A/B组合后的管理者自跑（生产窗口接线尚待C）

固定集成HEAD `d776cc1`吸收A的三个交付提交与B的`7af7f8b`；未改变main/安装版。

- `tests/InkoraTests/SidebarHostless.sh`：管理者实际运行，14/14，0 failure。编译当前生产Catalog/WorkspaceBridge两个源文件，另外只注入Bridge常量；覆盖真实临时文件、BOM/CRLF/UTF16、根身份/符号链接/替换、限制与取消、消息来源adapter、scope平衡、旧ctx/query/open错误与目录变化。日志`artifacts/delegation/root-sidebar-hostless.log`。这不是OS Sandbox授权或真实WK frame来源测试。
- `pnpm --dir editor exec vitest run src/main.test.ts src/sidebar-chrome.test.ts src/sidebar-library.test.ts src/sidebar-connection.test.ts src/document-analysis-panel.test.ts src/document-analysis.test.ts src/heading-navigation.test.ts`：管理者实际运行，7 files / 185 passed。日志`artifacts/delegation/root-sidebar-dom.log`。证明DOM公共事件/候选与旧请求守卫、5000ms虚拟计时边界和菜单行为；不外推为Native标题几何或像素动画。
- C报告已使用不显示的NSWindow/WK验证标题行顶对齐、右角hitTest与90px安全区，并发现NSDocumentController子类测试注入顺序问题；改为显式工厂后同进程组合四项转绿。当前只是作者回报，固定C提交和管理者自跑结果到达前不将SB-08/SB-11标为通过。
- 管理者源码核对确认旧`read(data)`不会设置diskVersion/修改时间/打开历史，已要求C消费A安全descriptor所得数据/metadata，建立版本依据并覆盖恢复原mtime的外改拒写。同窗口转交须重绑snapshot/recovery/image/epoch；不能靠原有canClose或界面切换间接推定完成。

## 固定组合与独立审查结算（未通过）

管理者在`d3edf880`实际运行lint、Web build与Native导航hostless四项，均通过；标题顶沿/右角命中及90px安全区获得有限证据。随后两个独立审查发现阻断，因此SB-05/07/08/09/14不得标为通过，SB-11仍缺完整窄窗/resize几何，SB-15尚未结算。

- Standards：1项硬偏离，完整`location.raw`走无v1信封/回执的独立入口；两项统计状态重复/原始字符串为judgement，不混作硬规则。报告`INK-REV-133-sidebar-standards.md`。
- Spec：1项P1（确认等待后目标版本失效）与3项P2（正文revision丢目录/搜索回包、dirty目标普通卡片限制、窄窗重叠）。两项真实后台反例及两项静态推导分别记录于`INK-REV-134-sidebar-spec.md`，不将probe退出0误写成产品通过。
- A安装线程修复吸收为`140438c`后，管理者专项15/15通过；仅补足Timer生命周期证据。
- 所有问题已分派原A/B/C执行Agent；待补正固定SHA与后验审查。正式main及安装版仍保持原状态，未占用屏幕。

## 窄窗补正及最终门禁准备

B独立补正`102a9a2`已吸收为`3ddfaef`，侧栏与正文使用共享宽度。管理者实际运行`pnpm --dir editor exec vitest run src/sidebar-chrome.test.ts src/document-analysis-panel.test.ts`：2 files / 21 passed，日志`artifacts/delegation/root-sidebar-width-fix.log`。CSSOM计算接缝证明1280/640/600/480/320px各宽度使用同一依据；实际WK边缘、反向切换及resize仍待C，不提前关闭SB-14。

已实际fetch远端main，仍为`30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`，当前分支包含它。最终补正SHA冻结后按`docs/testing.md`执行lint、`make test-non-ui`、`make release-bundle-check`及默认CI（`ui-tests=false`、`full-bench=false`）；不运行会启动App的`make test`/XCU/完整性能目标。

管理者另发现当前标题几何测试只在设置`INKORA_SIDEBAR_RESOURCE_BUNDLE`时执行，默认Native/CI会skip。已要求C保留CLI覆盖并默认使用测试bundle资源，避免专项绿而正式门禁未覆盖。此项未修复前，不能用默认Native总数证明SB-11/SB-14。
