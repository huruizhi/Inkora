# Spec

受检 HEAD：`d3edf8803c661d1fb2dbebf9e8abdd826720f69d`；基线：`30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。独立分支 `task/INK-REV-134-sidebar-spec`，初始工作区 clean，基线可解析。初始 HEAD 执行且仅捕获一次 `git diff 30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53...HEAD`，36 文件，+3314/-27；报告提交不属于受检产品。捕获、复现代码及命令见[任务记录](../tasks/INK-REV-134.md)。产品未合 main。

## 主发现（少于400词）

1. **P1 / 实现错误：关闭确认后仍消费过期目标。** 契约第7条（`docs/design/typora-sidebar.md:19`）要求“文件已变化时拒绝旧位置并刷新”，矩阵 SB-08/09（`:24–25`）要求先验证目标。`SidebarWorkspaceBridge.swift:262–270`验证后进入`EditorViewController.swift:264–307`异步关闭审查，回调直接读取旧`file.data`，未重验文件/导航请求。独立不显示窗口反例：等待期间外改目标，确认后错误为 nil、源窗口已转交，编辑器仍打开旧内容；须在真正转交前重新验证目标和请求代际。

2. **P2 / 部分实现：正文编辑令目录/搜索永久等待。** 第4/5条（`:16–17`）与 SB-05/07（矩阵`:21,23`）要求可用的安全刷新及异步隔离。`SidebarWorkspaceBridge.swift:281–313,366–368`先清 catalog、停 watcher，再以正文 revision 过滤完成；`:228–232`搜索同样静默返回。独立 Foundation 反例：扫描后 revision 0→1，仅收到 ready；手动刷新恢复；搜索后 revision 1→2 无结果也无错误。正文编辑不应使独立文件夹索引失活，应完成或明确重试。

3. **P2 / 未要求的限制：已开且有编辑的文档卡片无法导航。** 第6条（`:18`）与 SB-08（矩阵`:24`）要求复用目标身份。`EditorViewController.swift:289–300`无条件要求目标 snapshot 等于磁盘索引字节，连没有位置的普通卡片也被拒绝；目标有未保存编辑/源码草稿时无法到达`:319–325`的复用。仅搜索定位需要版本匹配；普通卡片应保留目标会话并切至其窗口。此项为生产路径静态推导，未执行目标窗口反例。

4. **P2 / 实现错误：窄窗最终布局仍遮挡正文。** 第12条（`:27`）及 SB-14（矩阵`:30`）要求正确最终几何。`editor/src/style.css:621,865–867`的侧栏宽为 min(280px,82vw)，上限45vw；正文仅让位 min(240px,45vw)。600px 窗推导为270px与240px，稳定后重叠30px；640px重叠40px。应共享布局宽度。属于明确 CSS 数值推导，未冒称像素实测。

上述源码未带目录的 Swift 路径均在 `app/Sources/`。结论：Spec 不通过；1项P1、3项P2。两项独立反例已提前通知父会话。除第3项新增限制，未发现需要单独报告的功能范围扩张。

## 逐项追踪与证明边界

| 契约 / 矩阵 | 生产接线及本次判断 |
|---|---|
| 1–2 / SB-01/02 | main.ts:374–396→DocumentAnalysisPanel；重复标题使用原 index，候选不提前过滤。侧栏按钮仍固定“大纲”tooltip（panel:198–199），文档模式文案不够准确；非主阻断。当前位置高亮未见实现，契约为条件要求，不推定为必交缺陷。 |
| 3–4 / SB-03/04/05 | Native chooser→FolderAccess→descriptor walk；Catalog 的 O_NOFOLLOW、root身份、UTF-8校验、限制、SHA版本、lease均接通；sendCatalog:371–378按当前URL标卡片。不把文件授权当父目录授权。外改 poll→invalidated→Web refresh 接通，但受发现2影响。 |
| 5 / SB-06/07 | SidebarLibrary 发真实 Aa/整词/正则选项，Native搜索分组位置；Connection 的 request/context/catalog 守卫、cancelSearch及重载connect可达。查询/选项/跨doc迟到响应有作者测试；本次独立发现同doc编辑导致无回复，未以作者绿测代替。 |
| 6 / SB-08 | main.ts:403–438提供草稿提交/放弃/返回，未解决意图先源码处理；Native reviewSidebarNavigation→canClose→prepareForClose→snapshot→super.canClose可追踪。生产转交重绑snapshot/recovery/image及epoch，取消前不转移窗口。本次注入延后review验证转交后果，没有执行系统Save/Discard/Cancel面板。既有新增NavigationTests:122–134也注入yes/no，不能独立证明实际保存失败/取消链。发现1/3阻断。 |
| 7 / SB-09 | Catalog原始UTF-16包括BOM/CRLF，Web定位先减传输时剥离的BOM，再检查raw/revision；navigateRawRange无法映射时main.ts:475–496明确提供源码选择。初次版本验证和保存前外改拒写存在，但不能替代发现1的转交前重验。 |
| 8 / SB-10 | main.ts:312–329,395–400,949附近守卫正文/查找/链接/侧栏composition和侧栏输入持焦Undo/Redo；UI状态不写Bridge正文。静态未见新增正文事务；未独立重跑所有history/IME不变量。 |
| 9 / SB-11 | fullSizeContentView+透明hidden Native标题，Web filename与tools同header，90px安全区；Native publishDocumentPresentation按doc绑定。NavigationTests:7–37仅固定窗口顶沿/hitTest，不能外推480px、展开侧栏和resize完整几何。 |
| 10 / SB-12 | SidebarChrome:9–30有5000ms、重入清timer、menu/focus/composition保活、destroy清理。既有DOM边界测试可读，仅作为外部证据。 |
| 11 / SB-13 | panel.ts:328–377按原分析模块生成四值；menuitemradio、checked、键盘选择和稳定menu DOM，selectedStat跨更新保留。切doc短暂empty清菜单后重建；本次未发现口径状态丢失。 |
| 12 / SB-14 | SidebarLayout预留空间→内容淡入、反向计时清理与reduced-motion均接通；未重建EditorView。发现4为最终几何错误；已有class/timer测试不能证明布局正确。 |
| SB-15 | 最终main祖先、组合门禁、Release和CI由父会话负责；本次不重复运行、不宣告产品交付。 |

## 不变量与证据来源

保留规范：`GLOSSARY.md:7–20`的当前原文/位置依据/保存点/草稿/组合会话；`docs/adr/0004-source-authoritative-editing.md`的source-authoritative与禁止首次同文猜位；`docs/document-save.md:7–25`的成功才markSaved、关闭取消和外改拒写；`docs/bridge-protocol.md`的Revision不变量及executeCommand资格；`docs/save-barrier.md:9–14,20–25`的原子snapshot/保存点。未因新增侧栏而降低这些要求。

**自跑证据**仅为任务记录中两段临时公共接缝probe：当前生产源编译成功，进程退出0，断言确认不良行为；导航窗口始终不可见。它们是反例，不是产品通过测试。**借用证据**为task130/131/132、既有tests与docs/evidence日志，以及矩阵中父会话历史自跑记录；本次均仅阅读，未独立重跑，不累计作者“通过数量”。

按授权未做GUI/App启动/CUA/浏览器/XCU/实际面板/物理输入/全量Native/Release/CI，未安装依赖、未修改实现或有效测试。截图像素、物理IME、macOS14专项不单列为缺陷；相称后台证据尚不足的范围已逐项说明。

## Post-fix：固定8e64424限定后验复核

本节追加，不改写以上固定`d3edf880`首稿。后验产品完整SHA：`8e64424f2fd8b0c54faf449b418551d1761a8551`。仅从该commit的`git archive`冻结副本核读/编译A/B文件，不读动态根工作树，不审尚未完成的C导航文件。复核范围与有限公共probe源码/命令/输出见[任务记录后验段](../tasks/INK-REV-134.md#post-fix固定8e64424限定后验复核)。

| 原发现 | 后验裁定及依据 |
|---|---|
| 2：typing导致scan/search无回包 | **该缺陷在本次限定公共接缝范围关闭。** 冻结`SidebarWorkspaceBridge.swift:203–205`接受不超前revision，`:407–408`的完成匹配保留document/context而不再绑定正文revision；scan/search自身generation仍参与过滤（`:265–267,348`）。独立编译冻结生产Catalog/Bridge，scan及search分别在请求后、MainActor完成前将revision 0→1，均收到原请求对应的catalog/search；search返回真实文件中的1个命中。各自另跑跨doc、跨context负控制，旧完成均未回包，重新ready后的catalog可达。共6个有限情形通过，非全量门禁或真实WK来源验证。 |
| 4：600/640数值分歧 | **原静态宽度分歧已消除；SB-14实际WK证据仍未关闭。** 冻结`style.css:171,324,617,624,868`统一使用`--sidebar-width`，窄窗定义为`min(240px,45vw)`。600/640px时侧栏与正文让位均240px，480px均216px；不再是首稿270/240与280/240。`:870–872`将稳定态resize与切换动画区分。仅核读声明及静态数值，不声称测得WK最终几何、resize/快速反向或像素动画通过。 |
| 1：关闭确认后过期目标 | **仍未关闭，等待C补正与独立复核。** A新增ticket仅是可用接缝：冻结`SidebarCatalog.swift:104–118,319–325`提供基于原catalog capability的再次读取及守卫延续；Bridge`:297–303`包装document/context、revision、navigation generation、catalog、lease身份。仅核读，不运行ticket新测试，不据此宣称C在每个异步门后消费ticket。未读取动态C旧路径或重复报旧缺陷。 |
| 3：dirty目标普通卡片无法复用 | **仍未关闭，等待C补正与独立复核。** 本次未审导航集成，不对尚未完成的C动态代码作新判断。 |

本次实跑只含1个Foundation/Bridge hostless可执行文件的6个情形，编译与执行均退出0，无窗口/App/系统面板/GUI/新Agent/依赖安装；没有复跑首稿导航窗口反例或全量门禁。原发现1/3与WK证明边界继续保留，不能把本次A/B限定复核外推为产品Spec整体通过。

## Post-fix：固定caab97a9最终独立复审

本节只追加；`d3edf880`首稿和`8e64424`后验全文保留。固定产品：`caab97a9b3a03bf2dbc6bcecf66d27d201eccd87`，全量`git archive`冻结于`/tmp/ink-rev-134-final-caab97a9`。所有产品核读、离线构建和限定测试均来自该副本，不读动态根产品文件。[任务记录](../tasks/INK-REV-134.md)附自跑命令、选择器、补充控制源码与实际输出。

### 主结论（少于400词）

- **原1关闭（有限导航范围）**：契约§6/7（design:18–19）、SB-08/09（matrix:24–25）。`EditorViewController.swift:271–280,303–329`在关闭review后与snapshot后重验ticket，转交无await；独立外改/删除反例现均拒绝并保留源窗。跨doc及同doc reload也拒绝旧review。
- **原3关闭**：§6/SB-08。`:298–308`只对有hit的已有目标snapshot，普通卡片保留dirty/未提交源码会话；自跑确认不snapshot、草稿内容及DOM身份保留。补充不同原文snapshot反例被拒，匹配snapshot后外改也被拒。
- **原4关闭于阶段/终态几何范围**：§12（design:27）、SB-14（matrix:30）。实际隐藏WK覆盖1280/600/480、稳定resize、快速反向及reduced-motion，验证reserving隐藏内容、panel/workspace边界与真实EditorView身份。`Animations.finish()`仅证明阶段状态与终态矩形，不证明实际paint/墙钟时长/macOS14。原2沿用上次6/6限定关闭，本次不重复跑。
- **取消链接通**：§5/8及SB-07/10。Library:109/171→Connection:44–55→WorkspaceBridge:289–317→C:280/329；独立DOM、Native取消review及targeted Foundation控制通过，旧cancel不撤销新ticket。
- **残余P3**：SB-02要求动作tooltip随状态正确（matrix:18），但`document-analysis-panel.ts:198–199`在文档/搜索视图仍称“展开/收起大纲”；这是首稿已注明的文案偏差，宜改为“侧栏”。未发现新增P1/P2或无关功能扩张。四项原阻断在注明范围关闭，不等于SB-15或整体产品交付通过。

本节省略目录的Swift文件位于`app/Sources/`；design指`docs/design/typora-sidebar.md`，matrix指`docs/reviews/INK-UX-129-acceptance-matrix.md`。残余P3为静态核读，未单独新增GUI反例。

### 完整契约复核及证据边界

| 条款 / 矩阵 | 固定产品路径与后验判断 |
|---|---|
| 1–2 / SB-01/02 | main→DocumentAnalysisPanel；单一右角侧栏开关、视图/搜索顶栏、原index过滤与候选守卫仍在；首稿的顶栏文案偏差保留为P3。没有把条件式当前位置高亮变成新增必交功能。 |
| 3–4 / SB-03–05 | Catalog安全descriptor读与版本、scope捕获、currentURL卡片标记、poll→invalidated→refresh仍接通。原2保持既有限定关闭；本次不重复目录上限/权限/symlink全套。真实Sandbox授权与OS面板没有本次独立证据。 |
| 5 / SB-06/07 | Aa/整词/正则、分组行号、部分索引提示、旧query/options/catalog过滤仍在；真实DOM清空/返回现在发送带目标身份的cancel，Native只撤销匹配意图，不清catalog/watch。独立1项Foundation覆盖旧context/catalog/请求取消及新意图保留。 |
| 6 / SB-08 | 当前文档review仍走InkoraDocument.canClose→snapshot→super.canClose；源码草稿/未解决意图先在main明确处理。原1/3及cancel控制已自跑；既有Save/Discard/Cancel真实系统面板不在本次范围，注入reviewer不能冒称三条系统流程均自跑通过。 |
| 7 / SB-09 | 原始BOM/CRLF UTF-16继续来自Catalog hit；C扣BOM，已有目标hit严格snapshot比较，异步门后再验证ticket。正式revealRange不带raw；DOM精确重复命中/语法源码选择和旧doc/rev/load/range拒绝已自跑。非BMP/ZWJ完整集合沿用既有外部证据，未本次重跑。 |
| 8 / SB-10 | 本次真实main定向测试验证侧栏持焦Undo/模式命令与composition阻断；UI动作使用metadata回执而非正文stateChanged。GLOSSARY当前原文/草稿/保存点、ADR-0004及save-barrier继续作为不变量，未降低保存资格。 |
| 9 / SB-11 | 正式setDocumentTitle绑定accepted load；真实隐藏Native顶沿/右角hitTest/90px安全区及宽窄tools边界自跑。standalone同header在DOM自跑确认；未声称standalone独立像素布局已测。 |
| 10–11 / SB-12/13 | SidebarChrome的5000ms、focus/menu/composition及destroy逻辑；四统计值同源、radio选择/键盘及selectedStat跨更新保留仍在。既有DOM虚拟计时/统计菜单测试只核读，未借本次7项Native数量证明这些项全部实跑。 |
| 12 / SB-14 | 上述真实WK阶段/终态断言通过，EditorView非空且身份稳定、revision=0、dirty=false。未用class存在代替矩形；没有实际屏幕paint/墙钟动画/物理IME/macOS14结论，亦未把这些禁跑项单独报为缺陷。 |
| SB-15 | root并行lint/test-non-ui/release offline属于外部证据；本次未核实其结果，不写通过。精确HEAD CI/Release身份/正式安装与整个Typora目标未由本复审裁定。 |

正式Bridge v1补正见冻结`docs/bridge-protocol.md:229–267`：title/reveal的requestID/doc/rev/accepted load/ack与超时/取消，目录通道限定例外。自跑`EditorBridge` load确认、错误load ack、超时、同doc reload迟到ack控制；核读`EditorBridge.swift:345–400`与`editor/src/bridge.ts:505–519`，两侧绑定一致。原`window.inkoraPresentation`及完整raw定位旁路已移除，不将目录摘要当当前正文或保存依据。该协议补正属于既有需求的集成收口，没有扩张到文件树/重命名/删除/主题/全量偏好。

**本次独立自跑**：冻结`make editor-build`通过（保留965.79kB chunk提示）；6项既有公开Native测试加1项自写负控制，7/7无skip；1项targeted Foundation取消测试通过；8项定向DOM通过、113项未选择。没有运行全量Native/全部Web/Release/CI。Native资源显式使用由冻结源码构建的bundle；默认测试已改为`Bundle(for: Self.self)` fallback并强制unwrap，不以缺资源skip算通过。

**外部借用**：冻结`docs/tasks/INK-UX-135.md`、`docs/evidence/INK-UX-135/README.md`及日志仅是恢复Agent/原C证据；本次只把实际重跑的具体用例记为独立自跑。根正在执行的门禁和上次8e64424的6/6限定结果不混入本次通过计数。没有App启动、显示窗口、真实系统面板、GUI/CUA/browser/XCU、依赖安装或新Agent。
