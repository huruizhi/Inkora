# INK-UX-125：Typora 风格查找与右上角工具

基线 `ecfe2d96d22cbf967677394922a85f93ae0d565c`。本任务按用户提供的 Typora 对照图收敛两个入口：⌘F 顶部查找/替换条，以及右上角阅读时间、统计、大纲与模式切换。沿用 INK-UX-123 的 Native 菜单命令和既有搜索、分析、模式事务，不修改 Markdown schema/parser、原文 ledger、保存协议或依赖。

## 行为契约

1. Native ⌘F 经既有 `find` 命令打开顶部查找条并聚焦查询框；独立 Web 开发环境仍保留常驻查找按钮。
2. 面板显式区分“查找”与“替换”。查找模式为单行；替换模式展开第二行 replacement 输入、“全部”与“替换”操作。切换模式、查询与导航不修改正文。
3. 右上角依次显示阅读时间、折叠大纲图标和可视/源码模式图标。点击阅读时间展开行数、写作单元数、字符数；阅读时间按内容写作单元每分钟 500 个向上取整。
4. 搜索条打开时隐藏右上角工具，避免与全宽查找控件重叠。统计浮层和大纲仍消费稳定快照；composition、过期文档身份、只读和 dirty 源码草稿继续由既有接缝拒绝不安全动作。
5. 所有新按钮使用可访问名称和键盘焦点样式；图标由 CSS 绘制，不新增图片或第三方依赖。

## 验证范围

- Editor 单元/集成测试覆盖查找与替换模式、Native `find` 打开行为、统计顺序和行数、右上角入口、稳定 snapshot 与 revision。
- Native hostless WK 测试覆盖真实菜单 ⌘F 映射、查询框焦点、第二行显隐、统计浮层与右上角模式入口。
- 本任务不宣称与 Typora 像素级一致，也不替代物理中文输入法、VoiceOver 和真实多窗口键盘路由验收。

## 验证结果

- `make lint`：通过（Swift Format strict 与 TypeScript `tsc --noEmit`）。
- `make test-editor`：39 个测试文件、772 项通过。
- `make test-bridge`：Editor Bridge 14 项通过，Native Bridge 16 项通过。
- `make test-native`：184 项通过，8 项按既有条件跳过；无失败。
- `make build APP_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UX125`：Debug 候选 App 构建成功。
- `make build-release`：Release 通用架构候选构建成功；ad-hoc 签名、Designated Requirement 与磁盘完整性校验通过。
- 独立候选 App 实际打开 Markdown，已观察右上角工具、统计浮层、⌘F 聚焦查询框及替换双行布局。最后将空查询说明从视觉布局隐藏，随后重跑 Editor/Native 门禁；未重做物理 IME、VoiceOver 或真实多窗口验收。
- 本地安装已原子替换到 `/Applications/Inkora.app`，原安装保留为 `/Applications/Inkora.backup-before-INK-UX-125.app`。安装后再次验证 bundle ID、0.1.0 build 3、x86_64/arm64、签名与本次 Editor 资源 SHA，并从安装路径新启进程成功；未强退替换前已运行的旧进程。
