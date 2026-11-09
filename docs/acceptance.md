# 1.0 验收盘点（INK-024）

覆盖表示断言已存在；执行结果以 CI / xcresult 为准，不代表人工体验已验收。

混排技术文章新增离屏生产闭环见 [INK-M1-108](tasks/INK-M1-108.md)：真实 WK 正文、表格、任务、代码语言和查找替换操作，经 Bridge/NSDocument Save As 后按字节核对并新文档重开，PNG/JPEG/GIF/WebP 均经真实资源 handler 与 NodeView 解码。该测试仅注入系统目录选择边界，不证明真实 Sandbox 授权、物理输入法、系统面板或人工辅助功能验收。

| 用户路径 | 现有自动化（类 / 测试名） | 盘点缺口与处理 |
| --- | --- | --- |
| 打开、编辑 | DocumentOpenUITests.testOpenAndSaveAsPersistDocumentsFromMenusAndShortcuts | 补纯键盘串联 |
| 保存、另存为 | InkoraDocumentTests.testSaveAsSwitchesPathAndFollowingSaveUsesNewPath；上述 UI 用例 | 不重复 |
| Undo/Redo | EditorWebViewTests.testNativeUndoAndRedoFollowEditorState；DocumentOpenUITests.testUndoRedoMenusAndShortcutsWhileWebEditorHasFocus | 不重复 |
| 关闭确认、取消、保存失败 | DocumentOpenUITests.testCloseEntrypointsOfferSaveDiscardAndCancel / testFailedSaveDuringClosePreservesWindowAndContent | 补纯键盘取消及放弃 |
| 最近文件 | RecentFilesUITests.testOpenRecentListsOpenedDocumentReopensItAndClears / testOpenRecentEntryForDeletedFileShowsAlertAndRemovesIt | 补键盘进入最近菜单重开 |
| Finder 冷/热打开 | RecentFilesUITests.testColdLaunchServicesOpenShowsDocumentWithoutUntitledWindow；DocumentOpenUITests.testLaunchServicesOpenUsesTheMarkdownFilenameAsWindowTitle | Launch Services 等价打开；真实 Finder 双击人工复核 |
| 重启恢复 | RecentFilesUITests.testRelaunchRestoresLastOpenedDocumentAndWindowFrame | 不重复 |
| 只读、外部修改 | DocumentOpenUITests.testReadOnlySaveOffersSaveAsAndPreservesOriginal / testExternalModificationConflictKeepsLocalEditsAndSavesCopy | 补冲突截图和标识符断言 |
| 移动、删除 | InkoraDocumentTests.testPresenterFollowsRenameAndMoveWithoutLosingEdits / testDeletionPreservesBufferAndDirtyUntilSaveAs | Finder 操作和只读卷人工复核 |
| 崩溃恢复 | DocumentOpenUITests.testCrashDraftIsOfferedOnRestartAndRecoveryNeverWritesSource；RecoveryStoreTests | 补恢复提示截图和标识符断言 |
| 编码、换行、Unicode | InkoraDocumentTests.testUTF16AndUTF32OpenReadOnlyWithExplicitReasons / testUnsupportedEncodingDocumentCannotSaveAnywhere / testEditedSnapshotSaveKeepsTheOriginalBOM；EditorWebViewTests.testUnmodifiedMarkdownSavesThroughBridgeByteForByte / testEditedSnapshotKeepsCRLFLineEndingsAndUnicode | 不重复；已知格式边界见 text-format.md |
| 不支持的编码只读错误状态 | DocumentOpenUITests.testInvalidUTF8OpensAReadOnlyErrorWindowWithoutAnEditor / testUTF16ReadOnlyErrorWindowBlocksSaveAndClosesWithoutReview；InkoraDocumentTests.testUnsupportedEncodingWindowShowsReadOnlyStateWithoutEditor / testUnsupportedEncodingDocumentProducesNoRecoveryDraft；RecentFilesRestoreTests.testEncodingErrorURLReadDoesNotReplaceLastOpenedDocument / testEncodingErrorOpenWithdrawsNotedRecentEntry | 不重复（INK-053） |
| Bridge 非法消息与版本/revision 边界 | BridgeProtocolTests；EditorWebViewTests.testInvalidEditorMessageStopsSubsequentSnapshots | 补命令/事件参数矩阵及安全整数端点 |
| 原生 AX 元数据 | 既有 testFileStateSubtitlePreservesAccessibleFilename | 补窗口/编辑器/恢复按钮 XCTest |
| 键盘、视觉、AX 审计 | 既有快捷键测试混用点击 | AcceptanceUITests 串联与审计；固定浅色 900×700 内容区、系统字体和 fixture |

## 截图与失败诊断

截图是结构验收证据，不做像素比对。编辑器、打开面板、关闭确认、冲突、恢复状态均保存 keepAlways attachment，再由入口导出到 artifacts/screenshots。失败即时附截图、AX 树、当前编辑文本；完整 App/WebKit 日志由 run-and-capture.sh 归档。测试专用 Markdown snapshot hook 将 Bridge 快照写到测试容器，供失败附件与 INKORA_MARKDOWN_SNAPSHOT_SOURCE 归档；无法获取快照时明确附原因，不把磁盘旧正文称为当前正文。

## 隔离约束

- UI 入口强制 com.huruizhi.Inkora.UITesting；每例 UUID defaults suite / recovery session、临时文档，不接触正式 App 的最近列表、偏好和恢复草稿。
- Hostless XCTest 不启动 AppDelegate、RecoveryStore.applicationStore 不启用真实恢复；磁盘用例使用临时目录，defaults 测试使用独立 suite。
- 性能启动测试仅显式 bench-full 启用，保持专用 bundle ID；测试不得通过正式 App 启动。
- UI 操作仅 CI 持 UI_LOCK / UI_PREFLIGHT 执行；30 分钟 job 上限保持，新增串联和审计控制在少量启动内。

## 无障碍与人工检查清单

自动审计使用 SDK 可用的 performAccessibilityAudit；运行系统不支持时必须以显式失败报告能力不足，不静默跳过。审计不替代 VoiceOver。系统关闭面板按钮沿用 AppKit 的 SaveButton / DontSaveButton / CancelButton 和本地化 label；系统文件面板保持系统 role / label。

尚需人工逐项记录系统版本、结果与问题：

- [ ] VoiceOver 按文件名识别窗口，进入 Markdown 编辑区域，朗读中文、标题、列表、代码与链接。
- [ ] VoiceOver 在文件面板和关闭确认中读出按钮名称、默认操作；Escape 取消后焦点回到正文。
- [ ] 冲突/只读/恢复提示的原因、后果和按钮读序清晰，无焦点陷阱。
- [ ] 只用键盘导航菜单与面板，开启/关闭 Full Keyboard Access 均复核。
- [ ] 中文拼音/双拼 composition 下保存、取消关闭、Undo/Redo，不丢字、不跳光标；选区与撤销栈保持。
- [ ] Finder 双击、跨目录移动、废纸篓删除、真实只读卷；窗口内容不丢失。
- [ ] macOS 14 最低系统与深色/放大字体人工复核；固定浅色截图不代表这些状态已覆盖。
