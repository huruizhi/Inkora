# INK-UX-127：Typora 查找与右上角工具桌面验收

基线 `task/INK-UX-125-typora-find-stats@433a948`。`INK-UX-126` 已用于默认阅读宽度并合并 `main`，因此本验收使用下一个任务编号。本任务只增加真实桌面验收覆盖和记录，不修改编辑器产品实现。

## 验收覆盖

新增 `DocumentOpenUITests.testTyporaFindShortcutAndCornerToolsPreserveExactBytes`，在隔离的 `com.huruizhi.Inkora.UITesting` App 与临时 Markdown 文件上验证：

1. 右上角统计、大纲、可视/源码入口均有可访问名称；统计浮层可展开和收起。
2. 编辑器持焦时按 ⌘F，查找框出现且默认处于“查找”模式；替换输入不出现在单行查找模式。
3. 输入查询后出现准确匹配数；Enter、Shift-Enter 不关闭查找，Esc 关闭查找。
4. 再次通过 ⌘F 打开并关闭查找后保存，磁盘字节与原文件严格相等；关闭并经 Launch Services 重开后内容和字节仍一致。

替换下拉菜单在跨显示器 XCU 环境中无法稳定驱动，因此没有把夹具限制伪装成桌面通过。下列已有可运行覆盖补齐其余验收面：

- `WritingLifecycleTests.testMixedArticleEditsMigrateFourImageFormatsAndReopenWithExactBytes` 在真实 WKWebView/文档控制器中通过实际查找面板执行全部替换，验证 Undo/Redo、保存精确字节和关闭重开。
- `SearchPanel` 与 `main` 测试覆盖查找/替换分离、replacement composition、候选期间 Enter/Esc 不被消费以及替换动作的原子 Undo/Redo。
- `EditorWebViewTests.testWritingLayoutKeepsOutlineOptionalAndStatisticsVisible` 覆盖 900 px 与 480 px 窗口下的右上角工具、无水平溢出和统计/大纲行为。

## 运行证据

- `make lint`：通过；Swift Format strict 与 TypeScript `tsc --noEmit` 均通过。
- `make test-editor`：39 个测试文件、772 项通过。
- `make test-bridge`：Editor Bridge 14 项通过，Native Bridge 16 项通过。
- `make test-native`：184 项通过，8 项按既有条件跳过，无失败。
- `make build APP_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UX127`：隔离 Debug 候选构建成功。
- targeted XCUITest r10：通过，1/1，23.719 秒；结果包为 `artifacts/test-results/ux127-find-acceptance-r10.xcresult`。
- targeted `WritingLifecycleTests`：通过，1/1，3.953 秒；结果包为 `artifacts/test-results/ux127-writing-lifecycle.xcresult`。
- targeted editor 面板/主流程/文档工具测试：3 个文件、150 项通过。
- targeted `EditorWebViewTests.testWritingLayoutKeepsOutlineOptionalAndStatisticsVisible`：通过，1/1，1.929 秒；结果包为 `artifacts/test-results/ux127-writing-layout.xcresult`。

## 失败分类与边界

- r1 已真实到达右上角工具、⌘F、查询和“2 处匹配”；失败原因是手工截图与 XCU 自动录像冲突，已从夹具移除手工截图。
- r2 至 r8 均能启动真实 App 并完成查找主流程，但 WebKit `<select>` 的原生弹出菜单在第二显示器上不能由 XCU 稳定选择。r7 AX 树显示 App 窗口位于第二屏（`x=1934`），而失败截图来自主屏 Chrome；r8 元素级键盘切换仍未改变值。此项归类为跨显示器 XCU 夹具限制，不是产品缺陷证据，结果包为 `artifacts/test-results/ux127-find-acceptance-r8.xcresult`。
- r9 的 `performAccessibilityAudit` 卡在 XCU 截图失败后的符号化路径；采样栈为 `performAccessibilityAudit → screenshot → recordIssue → CoreSymbolication`。4 分钟无进展后中断，避免无限等待。r10 仍直接断言所有新增入口的 AX 名称；完整 VoiceOver 操作未宣称通过。
- 既有物理验收记录明确用户不需要重复实体输入测试。本任务没有再次要求搜狗实体键盘输入，也不宣称查询框/replacement 的真实 IME 候选交互已通过；自动测试只覆盖 composition 事件安全。

## 合并建议

产品实现未发现新的阻断缺陷。建议把 `433a948` 与本验收提交集成到包含 INK-UX-126 的最新 `main`，解决冲突后重新运行 lint、editor、bridge、native、targeted XCU 与相称的完整 UI 门禁；这些集成门禁通过前不更新本地 Release 安装。
