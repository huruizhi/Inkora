# INK-UX-129：侧栏与标题行独立验收矩阵

本矩阵依据[实施契约](../design/typora-sidebar.md)及用户原图/追加四条交互建立。建表时审计基线为管理者分支`348d757`，130/131/132仍在实现，全部要求默认未证明。下表保留该初始审计，后续固定提交、失败和实际证据按时间追加，最新结算见末节，不能用Agent“已完成”回报替代。

## 证据使用规则

- 每项同时检查实际生产调用路径和对应的可观察结果；新接口只在测试中调用、生产仍走旧路径，视为未完成。
- 行为测试来自既有main/DOM、Bridge、真实临时目录、NSDocument公共接缝；不能以私有计数器、CSS类名存在或手工构造的成功JSON单独证明完整功能。
- 对动作前后的当前原文、BOM/EOL、revision、dirty、保存点、history/future、有向选区、活动输入DOM和焦点作相称断言。UI动作不得冒充正文提交。
- GUI、物理IME和macOS14专项不属于此次自动门禁。对标题行与布局可使用不显示的Native窗口/WK坐标和hit-test证据，必须明确未做屏幕实机观察。
- 精确最终HEAD只结算一次完整非UI/Bridge/Native门禁、Release离线检查和默认CI；发现新失败或后续改动才重跑相关项。禁止重复启动App/XCU来补证据。

## 逐项证明义务

| ID | 用户要求 | 必须检查的生产路径与反例 | 初始状态 |
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

A后续`f9f73a1`已吸收为`8e64424f2fd8b0c54faf449b418551d1761a8551`；管理者实际重跑`tests/InkoraTests/SidebarHostless.sh`：21/21，0失败，日志`artifacts/delegation/root-sidebar-ticket-fix.log`。普通typing与目录完成解绑、open仍要求即时revision，受限导航票据保持root/file及请求守卫。已请求原Spec审查者从该固定SHA复核原scan/search反例；C仍须消费二次验证API才能关闭导航P1，不能用A专项替代生产转交证据。

Spec独立后验报告`1bb5a3f`已原样吸收：固定`8e64424`的6个Foundation公共正反例通过，原发现2在有限范围关闭；600/640px静态宽度分歧关闭，WK几何及原导航发现1/3仍待验证。

管理者随后发现Web的`cancelSearch`只清本地ID。A用固定`8e64424`真实Web发送路径加生产Native公共接缝复现：取消前后发包数均为2，Native延迟`mayOpen(true)`仍打开一次、旧导航票据仍有效；真正新search则能使其失效。这是A实际运行的反例，根仅核读回报，不冒称自跑。已授权A/B增加目标requestID绑定的取消消息，保留catalog/watch，不让迟到取消误伤新请求；C在转交前消费失效票据。SB-07/08须等待此跨层闭环，不能只忽略旧open错误即判完成。

A取消补正`61325b5`吸收为`cb14288`，B真实传输`1799561`已吸收为`4cb1d30`。管理者自跑原生专项22/22、Web四文件31/31，并执行真实当前Connection序列化→当前Native receive的两个跨层probe：pending模式取消后打开0次；ticket模式重验拒绝；两者均撤销completed-search旧hit，全部退出0。日志`artifacts/delegation/root-sidebar-cancel-{native,web}.log`及`root-cancel-cross-layer.log`。该probe的TS转译仅用于执行锁定源，`--noCheck`不作为类型检查；既有lint/最终tsc另结算。C真实关闭协调器的组合结果仍待固定交付。

B的`746a63e`有效UI测试维护已吸收为`7ffa0b2`，根独立Swift strict格式通过；作者另有完整Swift6文件typecheck。真实XCU未执行，不能将编译通过写成hover/AX实机通过。原有查找、字节、保存/重开断言保留。

## 合并前固定结算

集成恢复产品`b5cf9f0`吸收为`44087d0`，作者记录`82bda31`吸收后固定组合为`caab97a9b3a03bf2dbc6bcecf66d27d201eccd87`。两名独立审查者从git archive冻结该SHA，Standards原硬偏离及Spec原四发现已在各自报告注明范围关闭。原始红证据和首稿均保留。

管理者在该组合实际执行`make lint test-non-ui release-bundle-check`，退出0：Editor 42文件795项、Web Bridge16项；Native222项中214通过、0失败、8个既有性能skip；Swift Bridge16项。两个xcresult均为Passed。结果树逐项确认SidebarNavigationTests八项实际执行、全部通过，默认资源路径没有新增skip。Release离线资源、双架构和codesign严格验证通过；日志保留既有Swift/Vite及Xcode诊断，不隐去。自跑摘要与原始日志在`artifacts/delegation/root-final-{summary.json,non-ui-release.log}`。

| ID | 当前实现与后台证据 | 合并前结论/证据边界 |
|---|---|---|
| SB-01 | main/Panel公共DOM检查唯一最右侧栏开关，Native菜单模式入口保留 | 实现及非UI回归通过 |
| SB-02 | 原index过滤、候选守卫、旧按钮拒绝；P3上下文AX/tooltip随后由B `2252032`修复 | 根组合面板+main126/126及tsc通过；默认大纲文案保留 |
| SB-03 | Native真实目录→catalog→Web卡片；自然排序、摘要/扩展名、当前标记及分组命中 | Catalog/Bridge/DOM回归通过；未操作真实授权面板 |
| SB-04 | 明确目录capability、descriptor根/file身份、BOM/CRLF/Unicode、symlink负例、lease生命周期 | 后台文件/生命周期检查通过；不是OS Sandbox授权交互实测 |
| SB-05 | 上限/取消/partial错误、外改轮询、typing后完成、跨doc/context失效 | 根22项原生专项及独立6例后验通过；有界轮询开销见130 |
| SB-06 | Aa/整词/正则、行号/片段、非法/病理正则限制、按文件分组 | Native搜索与真实DOM回归通过 |
| SB-07 | 旧query/options/catalog/load拒绝；completed search和pending open按目标ID跨进程取消 | 根真实Connection→Native两模式通过；迟到旧取消不影响新请求 |
| SB-08 | review后/target snapshot后/最终转交前受限重验，dirty及源码草稿目标普通卡片复用 | 默认Native/独立后验通过；系统Save/Discard/Cancel面板以注入选择验证，未实际展示 |
| SB-09 | exact bytes/fileVersion、原始UTF-16/BOM，严格hit snapshot及load身份，保护范围显式源码选择 | 原反例与stale/raw/range/reload负控制通过；无全文定位旁路 |
| SB-10 | 侧栏持焦拒绝正文历史命令；输入/草稿/composition守卫，UI不提交正文事务 | 完整main/runtime/Bridge回归通过；未重复物理IME |
| SB-11 | Native fullSize标题行、90px系统安全区、hitTest；正式标题/范围请求及回执 | 实际不可见NSWindow/WK通过；无屏幕像素观感结论 |
| SB-12 | 初始隐藏、enter、4999/5000ms、重入及菜单/focus/composition保活、销毁清理 | 公共DOM虚拟时间边界通过；无新的物理操作 |
| SB-13 | 四口径同源、menuitemradio/checked/键盘、刷新及caret保持 | Panel/main回归通过；真实AX呈现和VoiceOver未重验 |
| SB-14 | 同JS turn reserving+opacity0、宽窄/resize/快速反向/reduced fixture、实际EditorView DOM身份不变 | 默认Native隐藏WK实际矩形通过；Web Animations.finish证明终态，不声称实际paint或墙钟动画时长 |
| SB-15 | 最新main祖先30e2f5f；上述组合完整门禁通过，最后P3另有126项/tsc | 精确最终HEAD CI、合并及安装结果由[PR #87](https://github.com/huruizhi/Inkora/pull/87)和交付回执结算，本文不提前宣称通过 |

本次仍保留原先已确认的正文排版、900/760阅读宽度、原生菜单、查找/替换分离、公式/Mermaid/脚注离线显示及图片政策。完整Native结果树中技术预览、写作生命周期（含四种图片及重开）、字节保真保存与布局回归均Passed，不能只用侧栏专项替代这些既有要求。未扩展完整Typora克隆、主题/文件树或后置独立决策的行内标记编辑。
