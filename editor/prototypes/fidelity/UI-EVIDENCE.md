# PROTOTYPE：真实桌面检查记录

日期：2026-11-08；使用 cua_repl 操作本机 Google Chrome，新建本地 file:// 标签，无服务器。

- 先执行 `INKORA_UI_LOCK_TIMEOUT=2 scripts/ci/with-ui-lock.sh scripts/ci/ui-preflight.sh desktop /bin/sleep 180`：取得 UI 锁（pid 33749），desktop preflight 通过（uid 501）。检查结束对锁拥有进程发 TERM，依脚本 trap 释放锁。
- 加载工作区 `editor/prototypes/fidelity/PROTOTYPE.html`，AX 明确显示标题 PROTOTYPE、revision 0、dirty false、真实可视中文/链接/任务/公式保护块/表格预览、范围与 UTF-8 diff。
- 原生 AX 点击“局部中文修改”：revision 1、dirty true、Undo 1；可视正文变为“中文改写”；可信原文转义保留混合 CRLF/LF、emoji、引用定义与保护块；字节 diff from=25，beforeEnd=30，afterEnd=30。
- 点击“制造畸形源码”：保持 revision 1、PM selection 11..11，模式为主动源码草稿；提示“公式边界不明确：保留可信视图并阻断保存”，“建立内存保存点”按钮 disabled；可信视图未退出可视渲染。
- 点击“主动修复”：revision 2、Undo 2，返回可视，selection 仍 11..11，保存点按钮重新启用；字节 diff removed/added 均空。
- 首次批量 AX 点击被工具报告用户更改 app 而中止，没有计为通过；重读状态后采用单次点击逐项观察。

以上是 Chrome 页面与部分按钮的实际可见结果。没有进行系统 IME 输入，没有启动 Inkora 或 WKWebView；没有把静态截图或 jsdom 结果用作 IME 证据。没有用户 HITL 验收结论。
