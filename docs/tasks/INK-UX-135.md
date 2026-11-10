# INK-UX-135：侧栏集成补正恢复与固定交付

## 来源与归属

本分支为 `task/INK-UX-135-sidebar-integration-recovery`，组合基线为
`cb1428850ba639b5ace9c9f303411d2a1a9be5a3`。管理者预先应用原C未提交的精确binary patch：
SHA256 `7367dca931cdecf416cdcee657aa064ea42e96d70cf03100cde245a2c92149ef`，
原C HEAD `e18d8d0e9bee72282b0668c5c645ae355a64f4b6`。
初始10个tracked修改、819增/101删均为继承成果，不是恢复Agent新实现。
原工作树未修改；未搬其依赖。旧任务132和审查133/134首稿未改写。

产品固定提交：`b5cf9f011513d612eceb25011eaaf4494c08addb`。
本次除核读继承实现外，仅整理main定位函数缩进、移除隐藏WK冗长临时诊断打印，
明确实际EditorView DOM非空及身份断言、补全动画测量注释。没有重写目标或混入A/B产品文件。

## 固定内容与审查对应

- 生产 `navigateSidebarFile` 在关闭审查后消费 `file.revalidatedForNavigation()`，
  已开目标的异步snapshot后通过 `finishSidebarNavigation` 再消费一次；最后转交无await。
  A票据验证root/file descriptor身份、exact bytes、当前doc/context/catalog/navigation/revision和lease。
  外改/删除、源doc切换、取消open票据均保留源窗口/会话。
- 普通卡片不强制目标snapshot等于磁盘，复用真实NSDocument/窗口和dirty/源码草稿。
  有hit才要求实时snapshot匹配原始BOM+UTF-8字节，再复核票据后定位。
- 删除完整raw的 `window.inkoraPresentation` 旁路。标题/范围走正式v1命令
  `setDocumentTitle` / `revealRange`，双侧绑定requestID/docID/revision/accepted loadRequestID，
  `presentationApplied`明确回执；Native处理超时、拒绝和reload取消。范围仅UTF-16坐标；
  不能映射时提供显式源码选择，不产生正文提交，不改revision/history/dirty/保存点。
- canonical `docs/bridge-protocol.md` 明确新增命令、回执、绑定、拒绝以及目录UI通道限定例外；
  目录通道只有capability、索引摘要/命中元数据，不允许成为第二条当前正文、事务或保存通道。
  此为原Standards S1的实现与正式契约补正，独立复审裁定由管理者安排。
- 默认Native几何资源使用环境覆盖或 `Bundle(for: Self.self)`，不再缺环境即skip；
  hostless runner要求8项。1280/600/480、稳定resize、快速反向和reduced-motion fixture均使用真实不可见WK。
  同JS turn断言reserving及内容opacity=0，终态用标准Web Animations.finish测实际矩形，
  不手改class。原始自然等待0.3秒currentTime停0的red保留；终态不证明实际屏幕paint或墙钟动画时长。
- A/B取消协议已在base，本次不重吸收。C的生产Bridge票据测试验证取消open review后保留源窗。

## 修改文件

产品只包含继承归属的10文件：
`app/Sources/{BridgeProtocol,EditorBridge,EditorViewController}.swift`；
`editor/src/{bridge.ts,bridge.test.ts,main.ts,main.test.ts}`；
`tests/InkoraTests/{SidebarNavigationTests.swift,SidebarNavigationHostless.sh}`；
`docs/bridge-protocol.md`。本任务另新增本记录及 `docs/evidence/INK-UX-135/`。
未修改SidebarCatalog/SidebarWorkspaceBridge/connection/library/style/panel/UI测试或依赖清单锁文件。

## 本次自跑（当前组合源码）

日志位于 [evidence](../evidence/INK-UX-135/README.md)，不是原C借用结果。

| 命令 | 结果与边界 |
|---|---|
| `make editor-build` | 退出0，tsc与离线Vite build通过；965.79kB chunk体积提示保留 |
| `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/main.test.ts src/bridge.test.ts src/sidebar-connection.test.ts src/sidebar-library.test.ts` | 4 files，137 passed；未跑全量Web |
| `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/main.test.ts src/bridge.test.ts` | main缩进整理后2 files，127 passed |
| `tests/InkoraTests/SidebarNavigationHostless.sh` | 最终8 tests / 0 failures，00:13:25–33；真实生产源码编译、不可见NSWindow/WK，无App/系统面板展示 |
| `xcrun swiftc -typecheck ...`（完整命令见evidence） | 退出0，生产sources加既有BridgeProtocolTests/EditorWebViewTests，未执行两套测试 |
| `xcrun swift-format lint --strict`（限定4个Swift修改文件） | 退出0，无输出 |
| `git diff --check` | 通过 |

第一次自跑继承版8项亦通过。随后显式加强DOM身份时，恢复Agent误用了后代选择器
`#editor .ProseMirror`，导致6个断言失败；源码 `editor-runtime.ts` 将view.dom自身id设为editor，
因此改为 `#editor.ProseMirror`，要求非空并持续保持相同DOM，最终8项通过。
该次失败是测试选择器错误，不是产品重挂载证据；保留 `geometry-selector-harness-red.log`。

## 借用证据与保留

`artifacts/inherited-INK-UX-132/`完整保留管理者复制的checkpoint/sidebar/INK-UX-132。
选取原始三份红证据、原C最终8项和137项日志，逐字复制到本任务evidence的 `inherited/`，
另附SHA256清单。这些仅为原C作者证据，不称恢复Agent或root独立实跑。
原C最终Native记录为00:05:24–33；Web为00:05:46、14.83秒。

## 未验、风险与交接

本任务限定补正已固定，仍须管理者独立两轴复审和精确最终HEAD门禁。
未执行全量Native、全量非UI、Release、CI、安装、App启动、显示窗口/面板、CUA/browser/XCU、
物理IME、macOS14专项或屏幕像素验收；不得由本记录推断SB-15或整体产品交付已通过。
Native编译保留既有InkoraDocument actor isolation及Any? coercion警告，未越界修改。
未setup/install或增加依赖；仅自建临时 `.tools`、`editor/node_modules` 链接借用主仓锁定依赖，
交付前unlink这两个链接，保留真实依赖、worktree与artifacts供复审/两层备份回收。
