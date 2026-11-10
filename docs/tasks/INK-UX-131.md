# INK-UX-131 Web 侧栏交付证据

分支：`task/INK-UX-131-sidebar-web`，固定交接基线 `bf8f7e5d45292223d7f26db209639384ba31728b`。

## 已完成

- 保留错误态既有断言并修复 `analysis-panel-error`；大纲过滤保留真实索引，候选阶段不提前过滤；旧按钮、候选阶段和宿主拒绝均不能导航，拒绝原因在面板可见。
- 统一大纲/文件视图顶栏和上下文搜索；文档卡片淡化扩展名、摘要、当前文档状态；搜索按文件分组显示行号/片段，点击携带原生签发的可选 `hitID`。
- 连接层校验 document/context/request/catalog，消费当前响应；旧查询/旧选项/旧打开错误、跨 load 重连回包均拒绝。返回/清空通过正式 `cancelSearch` 撤销对应 Native 搜索/打开意图（见后续补正）。目录 `invalidated` 只接受当前 catalog 并刷新。
- 真正可选的阅读时间/行数/词数/字符数摘要：`menuitemradio`、选中标记、键盘方向/Home/End/Escape；选择后关闭菜单，保留正文焦点和 caret，刷新保留选择口径和菜单焦点。词数沿用现有 writingUnits 定义，详细字数定义保持兼容。
- `SidebarChrome` 默认隐藏；进入立即显示，离开严格 5000ms；重入取消旧 timer，菜单/focus/composition 保活，结束后重新计时，destroy 清理。触屏保持可用，热区本身可命中。
- `SidebarLayout` 先让正文工作区让位，220ms 后侧栏内容淡入；收起、快速反向、窄窗、reduced motion、销毁均有最终状态。只变布局与呈现，不重建 EditorView、不产生编辑事务。
- 标题行 CSS 使用 `.editor-titlebar`、`.editor-document-title`；工具在同一行，左90px系统区，侧栏顶部40px避免系统按钮。真实 Native/文件名接线归 C。

## 最小兼容接口

保留 ctor 第五个 `SidebarLibraryAction` callback 和既有公开方法。
新增 `panel.resetWorkspace()`（C 的 connection reset callback 调用）、`panel.setCurrentFile(fileID?)`；也接受 catalog file 的可选 `isCurrent`。
`cancelSearch` 正式传输携带目标请求ID（见补正）。`SidebarSearchHit` 新增可选 `hitID/fileVersion/utf16Location/utf16Length`，open 新增可选 `hitID`。连接层 `reset?` callback 在每次 connect 调用；C 必须在每次已接受 load 后 connect。
`SidebarChrome` 和 `SidebarLayout` 在 Panel 内部创建/销毁，C 只传真实标题行工具容器，不重复实例化。

## 实跑与边界

- 修复前：分析/面板/标题导航3文件，63通过1失败；失败为已知错误样式丢失，未删断言。
- `make lint`：通过（Swift format + TypeScript）。初次 tsc 被交接 main 可选链阻断；使用 C 授权公共提交 `348d75766209c683b4c19f5a38f53d9ae376b5d0` 的 cherry-pick `a848d3b` 解阻，未自行改 main。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/main.test.ts src/sidebar-chrome.test.ts src/sidebar-library.test.ts src/sidebar-connection.test.ts src/document-analysis-panel.test.ts src/document-analysis.test.ts src/heading-navigation.test.ts`：7文件185通过，含真实 main/Bridge/runtime 107项；过程中真实回归发现构造期守卫和拒绝提示问题，均修复后重跑通过。
- `.tools/node_modules/.bin/pnpm --dir editor run build`：通过，仅现有大chunk体积警告。
- 产物日志：本工作树 `artifacts/INK-UX-131/{dom-tests,sidebar-tests,lint,build}.log`（ignored，保留供验收）。
- 未启动GUI、浏览器、Native/App或物理IME；未运行全量Native/Release/CI。未改依赖、未创建PR/merge或修改Issue。
- 风险/未完成：Native真实标题行几何、实际动画流畅度与物理IME由父会话后续验收；JSDOM证明事件、CSS目标与计时阶段，不能证明窗口像素布局。A/C最终组合需再次验证 isCurrent、reset callback、hitID定位与原生目录刷新。保存与文档历史代码均未修改。

## Spec 窄窗几何补正

独立审查发现旧窄窗侧栏 `min(280px,82vw)` 加45vw上限，与正文 `min(240px,45vw)` 不是同一依据；600px稳定态重叠30px，640px重叠40px。

修复使用 `#app --sidebar-width`：宽窗240px，<=640px为 `min(240px,45vw)`。侧栏 flex-basis / 窄窗 width 与 workspace margin-left 共同引用该值；侧栏 border-box，无额外 max-width 再约束。collapsed宽度仍0，先预留220ms再显内容、反向/快速切换与reduced-motion保持。稳定open/closed态不对resize的宽度进行独立过渡，避免跨断点时两个边界以不同起点移动；仅显式reserving/closing阶段对正文margin做220ms过渡。

几何预期（相对app左缘）：1280/640/600px时展开侧栏右缘及正文左缘均240px；480px均216px；320px均144px；收起均0。系统安全区保持标题行左90px、侧栏顶部40px。

新增`sidebar-chrome.test.ts`生产CSSOM计算接缝：读取真实样式级联而非复写产品宽度函数，校验两条布局属性引用同一变量、border-box及无第二max-width，并核算1280/640/600/480/320边界。`.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/sidebar-chrome.test.ts src/document-analysis-panel.test.ts`：2文件21项通过；`make lint`通过。真实像素几何不由JSDOM外推，已协调C使用现有隐藏WK runner验证宽窗/600/480px、开关/resize/reduced-motion；B未显示窗口、启动App/浏览器或改C/A文件。

## 正式取消传输补正

先前`cancelSearch`仅清Web请求ID，不能撤销Native延迟打开及已完成搜索的hit能力。现为正式传输action：沿用requestID/documentID/revision/contextID/catalogID，至少携带targetSearchRequestID或targetOpenRequestID之一。发送前捕获旧目标后清本地；searchIntentID在完成搜索后继续保留，直到取消/新请求/重连/catalog切换，保证已签发hit也可撤销。旧cancelled回执不改变新search/open或UI。

A已确认Native分别精确匹配activeSearchRequestID/activeOpenRequestID后撤销task/generation/hits，保留catalog/watch；旧目标no-op，回执kind=cancelled，带cancelledSearch/cancelledOpen布尔值。C已获字段同步。Web现有清空查询、返回列表、切换视图路径沿用SidebarLibraryAction，不增编辑器事务。

实跑：`.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/sidebar-connection.test.ts src/sidebar-library.test.ts src/sidebar-chrome.test.ts src/document-analysis-panel.test.ts`，4文件31项通过，包含真实DOM清空/返回经真实Connection发目标ID，完成search+在途open组合取消、迟到回执与新请求隔离、无目标/跨load/跨document；`make lint`通过。Native延迟mayOpen/ticket撤销实证由A负责，本分支未执行GUI/Native UI，不以Web回包隔离冒称Native能力已撤销。

## 有效 UI 测试维护（未执行 UI）

授权仅修改`tests/InkoraUITests/DocumentOpenUITests.swift`中的既有Typora查找/标题工具测试及私有helper。使用窗口右上角归一化坐标，加(-28,+14)pt进入真实28pt标题行右侧工具热区，不点击仍隐藏的按钮；统计/侧栏各次操作前重新hover，避免AX等待期间经过5秒导致工具隐藏。保持左90pt系统区，使用公开XCU坐标事件，无生产测试开关。

统计菜单通过现有公开AX文案“行数 N 行”查找（N由原始fixture物理行推导），点击选择并验证菜单收起，再打开后保留原有“隐藏文档统计”动作。使用any元素查询兼容WebKit对menuitemradio的AX类型映射，不假定其为原生radioButton，也不猜AX value对应选中状态。原Cmd+F模式/匹配/Enter/Shift-Enter/Escape、全文原字节、保存、关闭重开断言全部保留。

锁定SDK声明已核对：`XCUIElement.h`的coordinateWithNormalizedOffset；`XCUICoordinate.h`的coordinateWithOffset与MouseEvents.hover（位于Xcode MacOSX.platform/Developer/Library/Frameworks/XCUIAutomation.framework/Headers）。

实跑：

- `xcrun swift-format format -i tests/InkoraUITests/DocumentOpenUITests.swift`，随后`xcrun swift-format lint --strict tests/InkoraUITests/DocumentOpenUITests.swift`通过。
- `xcrun swiftc -typecheck -swift-version 6 -target arm64-apple-macosx14.0 -I /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/usr/lib -F /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Library/Frameworks -module-cache-path build/INK-UX-131-ui-module-cache tests/InkoraUITests/AcceptanceTestCase.swift tests/InkoraUITests/DocumentOpenUITests.swift`通过。首次命令缺少XCTest Swift overlay的-I路径，触发既有AcceptanceTestCase的XCTIssue改名错误；补全锁定SDK模块路径后通过，未改该文件或绕过检查。

未启动App/XCU/窗口/系统面板，未实际执行该UI测试；AX呈现与hover实际命中仍需未来授权运行，不将类型检查当作运行通过。
