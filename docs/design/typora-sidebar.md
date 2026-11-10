# Typora左侧栏：实施与Agent交接契约

## 目标与证据

用户提供五张截图并要求完成开发；随后明确要求将实现分派给Agent。主会话负责契约、调度、集成与独立验收，不再独自继续产品实现。

参考：Typora官方[侧栏与文件管理](https://support.typora.io/File-Management/)、[大纲](https://support.typora.io/Outline/)、[搜索](https://support.typora.io/Search/)。图1–3为大纲及悬停工具；图4为带摘要的文档列表；图5为文件夹内容搜索。紫色系统叠层不属于本产品控件。

上一规划暂缓文件树仍有效；本轮交付截图中的大纲、文档列表、文件夹搜索闭环，不扩展Finder式重命名/删除/拖动、主题商店或全量偏好。大纲模式放大镜在截图里未实际操作，本轮明确采用官方支持的“过滤当前标题”；文档模式放大镜为跨文件搜索，不能接到正文⌘F。

## 不可缩减的行为

1. 最右上角按钮显示/隐藏整个左侧栏。默认大纲；侧栏顶栏为视图切换、居中名称、上下文搜索，鼠标进入或键盘focus时按钮可见；触屏不依赖hover。图标具备中文AX名称与tooltip。
2. 大纲按层级缩进、重复标题精确定位；过滤不改变原始标题索引；候选输入不提前过滤或丢失。完善当前位置提示时须使用真实runtime选区/可见位置依据，不能用标题文本首次匹配。
3. 文档列表读取作者显式授权的文件夹（含嵌套支持的文本文档），自然排序，卡片展示文件名、淡化扩展名、摘要与当前文档状态；空/拒绝/不可读/未完整索引要明确显示。仅打开文件不等于已取得父目录授权。
4. 支持选择/更换文件夹、刷新、目录外部变化后的安全更新；文件夹lease在所有读完成前保持，切换/取消/销毁不得泄漏scope。符号链接、非法编码、大小/深度/总量上限和取消需有负例，搜索不能静默宣称完整。
5. 文件搜索支持大小写、整词、正则三项，按文件分组并显示行号/片段；清空查询回列表，返回保留正常浏览上下文；正则错误/超时可恢复。旧查询、旧选项、旧catalog、旧文档/epoch的迟到响应不能覆盖当前UI。
6. 点击文档进入真实NSDocument打开链，保留当前窗口上下文、目录及侧栏状态；不能每点一次就无条件堆叠新窗口来代替导航。当前文档dirty/源码草稿/未解决意图必须经过既有保存、关闭、取消流程，取消不丢内容。已在其他窗口打开的目标要正确复用其文档身份。
7. 点击搜索结果应定位实际命中；原始UTF-16/BOM/CRLF及文件版本须有位置依据。文件已变化时拒绝旧位置并刷新；不可映射的保护片段/定界符要明确提供源码定位选择，不猜位置、不偷偷改正文。
8. 正文与侧栏搜索分离。侧栏查询持焦时Native文档Undo/Redo不得越过输入框改正文；正文/查找/链接/侧栏composition均须守卫导航、折叠、选目录与模式/资源操作。纯UI变化不改raw/revision/dirty/history/future/保存点。

### 用户追加的四项精确交互（必须交付）

9. 右上角工具与当前文档文件名在同一标题行，平时隐藏，不再常驻在正文上方另一行。应用中应对齐真实窗口标题行；独立Web环境也提供一致的标题行，不能单纯向上挪像素后挡住系统窗口控件。文档标题不是正文H1。
10. 鼠标移入标题行工具区域立即显示；移出后严格等待5000ms再隐藏，重新进入取消旧计时器。工具/统计菜单被操作、键盘focus位于其中或相关输入composition进行中时保持可用，结束后再从新离开时刻计时；destroy/reload不留timer。不得要求用户重复物理IME。
11. 统计是可选择的显示口径：阅读时间、行数、词数（沿用既有写作单元定义）、字符数。下拉项显示对应当前数值，当前项有选中标记；选择后右上角摘要切换到该项，菜单收起。选择不改变正文、保存点、revision、history或选区；使用可访问的选择语义和键盘操作，不把静态统计浮层当作完成。
12. 展开侧栏分两阶段：正文工作区先向右让出空间，再显示侧栏内容；收起有相应平滑过渡，支持快速反复切换、resize、窄窗和prefers-reduced-motion。动画只能改变布局/呈现，不能重挂载EditorView、写入编辑事务或令光标选区跳动；正常完成与取消均恢复正确最终布局。

## 当前交接状态（未完成，不可合并）

生产基线为`main@30e2f5f`；管理者工作树`.worktrees/INK-UX-129`。当前产品草稿有`SidebarCatalog`、`SidebarWorkspaceBridge`、`SidebarLibrary`、`SidebarConnection`及main/NSDocument初始接线；这些不是已验收实现，Agent应改善、替换或移除缺陷草稿。

已实跑：Foundation目录测试4项通过（前一轮先暴露内部BOM误删与片段串行，均已修正）；既有Web三文件149通过/1失败；Swift格式已过，TypeScript失败。已确认没有活跃测试进程。

明确待修：

- `main.ts:393`可选`messageHandlers`缺一层可选链，tsc失败（集成Agent）。
- `document-analysis-panel.ts`错误note遗失`analysis-panel-error`，既有测试失败（Web Agent）。
- Native新Bridge尚未完成编译/集成验证；scope取消、请求ID与来源校验、生命周期、目录watch等未形成完整证据。
- 当前打开文件仅新开窗口，搜索结果没有精确位置；都不能视为目标完成（集成Agent）。
- 搜索分组、当前文档卡片、扩展名淡化、旧open错误可达性/迟到回包、侧栏自己的composition与源码草稿保护等均需逐项完成。

## 接口与文件归属

三Agent从同一交接commit创建独立worktree，仅提交自己负责文件；不得互相修改工作树。接口扩展先向管理者报告，再共同采用，不得悄悄改名让别支编译失败。所有字段是UI状态，不进入当前原文或保存协议；不得改既有Editor Bridge v1序列化字段。

### A：INK-UX-130 原生目录与搜索

拥有`app/Sources/SidebarCatalog.swift`、`SidebarWorkspaceBridge.swift`、`tests/InkoraTests/SidebarCatalogTests.swift`，可新增同域Swift模块/测试及自己的任务/证据文档。`EditorViewController.swift`、`InkoraDocument.swift`由C拥有。

公开Swift接缝保持`SidebarCatalog.scan/openFile/search`和`SidebarWorkspaceBridge.init(current:chooseFolder:mayOpen:openFile:)`、`attach/useFolder`。需要给打开/定位提供更强数据证明时，向C提供明确的接口补丁建议；不要先修改C文件。

现有UI请求：`{action,requestID,documentID,revision,contextID?,catalogID?,fileID?,query?,options?}`；action为ready/chooseFolder/refresh/search/open。Native回复`{kind,requestID,documentID,contextID,catalog?,result?,query?,message?}`。catalog为`{id,rootName,files,incomplete,skippedFiles}`，file为`{id,name,relativePath,summary}`；result为`{hits:[{fileID,line,snippet}],truncated}`。fileID/catal​og/context均为不透明标识，禁止Web提交原生路径直接读取。

### B：INK-UX-131 Web侧栏呈现与状态

拥有`editor/src/sidebar-library.ts`、`sidebar-connection.ts`、`document-analysis-panel.ts`、`style.css`、`document-analysis-panel.test.ts`，可新增sidebar同域测试及自己的任务/证据文档。`main.ts`及其测试由C拥有。

公开`DocumentAnalysisPanel`构造器第五参数接收`SidebarLibraryAction`；保留`isInputComposing/ownsInputFocus/updateWorkspace/updateFileSearch/showWorkspaceError`。跨进程回复按当前request/context/catalog/文档绑定校验。新增当前文档卡片、分组、定位意图等字段应向A/C报告并以可选兼容扩展过渡。

B同时负责统计选择菜单和两阶段侧栏动画的DOM/CSS状态实现，以及5000ms显隐状态模块/测试（可新增`editor/src/sidebar-chrome.ts`等同域模块）。真实窗口标题行的容器/Native接线由C负责；B提供小而稳定的显隐/选择接口，不能自行修改C的main/Native文件。

### C：INK-UX-132 生产接线与文档导航

拥有`editor/src/main.ts`及`main.test.ts`、`app/Sources/EditorViewController.swift`、`InkoraDocument.swift`、`tests/InkoraTests/EditorWebViewTests.swift`；必要时可新增导航协调器/测试并为准确结果定位调整`editor-runtime.ts`及对应测试，必须保持Markdown权威和既有公开行为。负责当前文档与侧栏focus/composition、加载代际、Native窗口/保存关闭回路、搜索结果准确定位，不能改A/B文件。

C同时负责标题行真实对齐与当前文件名、Native/独立Web一致的工具容器接线；与B协调5000ms显隐、统计选择及动画接口，禁止用伪Native调试入口或全局DOM重建来实现。优先先修已知TypeScript可选链错误，单独提交并通知管理者，解除其他Agent的编译依赖。

## 验证、提交与禁令

- 每Agent先读AGENTS/GLOSSARY/相关ADR/此契约，核对分支基线。继承主会话已使用的公共接缝：真实main/DOM、Bridge、临时文件系统、NSDocument保存关闭；不要测私有缓存计数。
- 优先先复现关键反例再修；不为纯样式常量增加镜像测试，不删有效测试，不硬编码示例。
- 全部Agent禁止GUI/App启动/CUA/浏览器/XCU/物理IME/NSOpenPanel/NSAlert实际展示；不占屏。只运行相称的后台DOM/Foundation/注入UI选择的hostless测试。禁止全量Native/Release/CI反复跑，统一由管理者在组合后的精确HEAD结算一次。
- 可临时借用主仓锁定`.tools`和`editor/node_modules` symlink；禁止setup/install/改依赖锁。只能删除自己创建的symlink，不能删真实依赖。产物放自身build/artifacts，不写其他工作树。
- 不安装App，不发布，不PR/merge/改Issue；任务完成提交、push、核对origin与clean，报告文件、实跑命令结果、未完、风险、branch/fullSHA。通知管理者验收，工作树保留到备份和集成完成，再回收Agent/workspace两层。
