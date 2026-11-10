# INK-UX-131 Web 侧栏交付证据

分支：`task/INK-UX-131-sidebar-web`，固定交接基线 `bf8f7e5d45292223d7f26db209639384ba31728b`。

## 已完成

- 保留错误态既有断言并修复 `analysis-panel-error`；大纲过滤保留真实索引，候选阶段不提前过滤；旧按钮、候选阶段和宿主拒绝均不能导航，拒绝原因在面板可见。
- 统一大纲/文件视图顶栏和上下文搜索；文档卡片淡化扩展名、摘要、当前文档状态；搜索按文件分组显示行号/片段，点击携带原生签发的可选 `hitID`。
- 连接层校验 document/context/request/catalog，消费当前响应；旧查询/旧选项/旧打开错误、跨 load 重连回包均拒绝。返回/清空通过纯 Web `cancelSearch` 作废旧回包，不发 Native 请求。目录 `invalidated` 只接受当前 catalog 并刷新。
- 真正可选的阅读时间/行数/词数/字符数摘要：`menuitemradio`、选中标记、键盘方向/Home/End/Escape；选择后关闭菜单，保留正文焦点和 caret，刷新保留选择口径和菜单焦点。词数沿用现有 writingUnits 定义，详细字数定义保持兼容。
- `SidebarChrome` 默认隐藏；进入立即显示，离开严格 5000ms；重入取消旧 timer，菜单/focus/composition 保活，结束后重新计时，destroy 清理。触屏保持可用，热区本身可命中。
- `SidebarLayout` 先让正文工作区让位，220ms 后侧栏内容淡入；收起、快速反向、窄窗、reduced motion、销毁均有最终状态。只变布局与呈现，不重建 EditorView、不产生编辑事务。
- 标题行 CSS 使用 `.editor-titlebar`、`.editor-document-title`；工具在同一行，左90px系统区，侧栏顶部40px避免系统按钮。真实 Native/文件名接线归 C。

## 最小兼容接口

保留 ctor 第五个 `SidebarLibraryAction` callback 和既有公开方法。
新增 `panel.resetWorkspace()`（C 的 connection reset callback 调用）、`panel.setCurrentFile(fileID?)`；也接受 catalog file 的可选 `isCurrent`。
`SidebarSearchHit` 新增可选 `hitID/fileVersion/utf16Location/utf16Length`，open 新增可选 `hitID`。连接层 `reset?` callback 在每次 connect 调用；C 必须在每次已接受 load 后 connect。
`SidebarChrome` 和 `SidebarLayout` 在 Panel 内部创建/销毁，C 只传真实标题行工具容器，不重复实例化。

## 实跑与边界

- 修复前：分析/面板/标题导航3文件，63通过1失败；失败为已知错误样式丢失，未删断言。
- `make lint`：通过（Swift format + TypeScript）。初次 tsc 被交接 main 可选链阻断；使用 C 授权公共提交 `348d75766209c683b4c19f5a38f53d9ae376b5d0` 的 cherry-pick `a848d3b` 解阻，未自行改 main。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/main.test.ts src/sidebar-chrome.test.ts src/sidebar-library.test.ts src/sidebar-connection.test.ts src/document-analysis-panel.test.ts src/document-analysis.test.ts src/heading-navigation.test.ts`：7文件185通过，含真实 main/Bridge/runtime 107项；过程中真实回归发现构造期守卫和拒绝提示问题，均修复后重跑通过。
- `.tools/node_modules/.bin/pnpm --dir editor run build`：通过，仅现有大chunk体积警告。
- 产物日志：本工作树 `artifacts/INK-UX-131/{dom-tests,sidebar-tests,lint,build}.log`（ignored，保留供验收）。
- 未启动GUI、浏览器、Native/App或物理IME；未运行全量Native/Release/CI。未改依赖、未创建PR/merge或修改Issue。
- 风险/未完成：Native真实标题行几何、实际动画流畅度与物理IME由父会话后续验收；JSDOM证明事件、CSS目标与计时阶段，不能证明窗口像素布局。A/C最终组合需再次验证 isCurrent、reset callback、hitID定位与原生目录刷新。保存与文档历史代码均未修改。
