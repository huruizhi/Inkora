# INK-UX-132：生产标题行与侧栏文档导航

## 完成内容

- 修复可选 messageHandlers 编译阻塞，独立提交 `348d75766209c683b4c19f5a38f53d9ae376b5d0`。
- 主窗口使用 fullSizeContentView 与透明标题栏，保留系统按钮；文件名与工具同处真实标题行，独立 Web 也采用同一容器。文件名经 JSON 安全编码、当前 documentID 和递增 UI 序号校验，保存确认及磁盘状态刷新同步更新。正文 H1 不承担文件标题。
- 接入 B 的 toolbarParent、resetWorkspace 和两阶段布局，不重挂载编辑器来改变侧栏布局。
- 生产消费 A 的 openVerifiedFile 回调。新文档经 NSDocumentController.makeUntitledDocument 建立，用同一次验证字节与 descriptor 修改时间初始化正文、BOM、磁盘版本、修改时间和打开记录，再注册到 NSDocumentController。没有重新从 URL 读取正文或元数据。
- 当前文档通过 canClose 的既有保存/放弃/取消流程审查；转交同一个 NSWindowController，重绑 snapshot 与图片保存闭包，移除旧文档 snapshot/recovery 闭包，重新建立 Bridge 文档身份和资源 epoch。已有目标文档先取实时 snapshot，与验证字节比对后复用其窗口与编辑会话。
- 源码草稿提供提交并继续、显式放弃并继续、返回编辑三项选择；未解决意图提供源码处理或返回。输入 composition 阻断侧栏副作用。旧关闭审查文档/epoch、已有目标 snapshot 等待期间源 revision 变化会拒绝导航。
- 命中使用原始 UTF-16 坐标，扣除文件前导 BOM，保留 CRLF。可视定位仅接受严格 source ledger 位置证明及选中文本一致性；保护/语法位置提供显式源码定位按钮。迟到文档、revision、raw、输入组合态均拒绝。

## 实跑验证

- `editor/node_modules/.bin/tsc --noEmit -p editor/tsconfig.json`：通过。
- `/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor build`：通过。
- `pnpm --dir editor exec vitest run src/main.test.ts src/sidebar-connection.test.ts src/document-analysis-panel.test.ts src/sidebar-library.test.ts src/sidebar-chrome.test.ts`：5 文件、136 项通过。含真实 main 的标题绑定、重复文本原始范围、保护范围源码选择、草稿返回与提交后才请求 Native。
- 后补真实 main 侧栏 focus/composition 守卫后，`vitest run src/main.test.ts`：111 项通过；新增范围越界反例专项 `vitest run src/main.test.ts -t '原始UTF16'`：1 项通过、110 项未选择。
- `vitest run src/editor-runtime.test.ts src/source-authority-runtime.test.ts src/visual-search-runtime.test.ts`：3 文件、157 项通过。
- `tests/InkoraTests/SidebarNavigationHostless.sh`：4 项通过；真实 NSWindow/WK 几何、frameView hitTest、窗口始终不可见、系统按钮安全区、同窗导航/取消/读取失败、迟到关闭审查、外改恢复原 mtime 后保存拒绝覆盖。
- `xcrun swift-format lint --strict app/Sources/EditorViewController.swift app/Sources/InkoraDocument.swift tests/InkoraTests/SidebarNavigationTests.swift`：通过。
- `git diff --check`：通过。

## 验证边界与证据

未启动 App、未显示窗口/NSOpenPanel/NSAlert，未运行物理 IME、XCU、全量 Native、Release 或 CI。真实原生保存面板的交互交由管理者统一验收；本任务用注入选择验证导航回路与失败保留。最低 macOS 14 与实体输入法没有新增实机结论。

首次组合运行暴露 NSDocumentController 子类 init 实际返回共享控制器，导致测试创建动作未被使用；保留 `controller-injection-red.txt`。修复为显式创建动作 adapter（生产默认真实控制器），同进程 WK→导航顺序通过，并未改测试排序。编译保留既有 InkoraDocument actor 警告，没有以编译成功冒充全量 Native 验收。

A/B 提交仅在本分支授权吸收作组合验证，管理者已有 A/B 时只需 cherry-pick C 最终实现提交。工作树保留等待验收与备份，暂不回收。
