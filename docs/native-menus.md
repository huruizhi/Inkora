# 原生菜单与编辑器命令

Inkora 的 File 菜单使用 AppKit 文档入口，Edit 菜单通过 responder chain 进入当前窗口的 `EditorViewController`。WKWebView 保持第一响应者时，菜单 key equivalent 仍先由 AppKit 分派，因此菜单点击与快捷键共享同一条执行路径。

## 命令映射

| 菜单 | 快捷键 | 执行方 |
| --- | --- | --- |
| File > Open… | `Cmd+O` | `NSDocumentController` |
| File > Save | `Cmd+S` | 当前 `NSDocument` |
| File > Save As… | `Cmd+Shift+S` | 当前 `NSDocument` |
| Edit > Undo | `Cmd+Z` | Bridge `executeCommand(undo)` |
| Edit > Redo | `Cmd+Shift+Z` | Bridge `executeCommand(redo)` |

Undo/Redo 使用 Inkora 专用 selector，避免 WKWebView 的浏览器原生 history 截获命令。菜单启用状态只读取编辑器最新 `canUndo` / `canRedo`；Bridge 未 ready 或不可用时两项均禁用。

## Revision 与连续命令

原生层一次只发送一个编辑器命令。收到带相同 request ID 的 `stateChanged` 后，Bridge 更新 revision，再发送队列中的下一条命令。这样快速连续按键不会让多个 Undo/Redo 共用旧 revision。命令超时、JavaScript 执行失败或最终重试失败会结束对应请求并向用户报告，不会绕过编辑器 history。
