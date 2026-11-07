# Revision 同步、Snapshot 与 Save Barrier

原生层的 revision 是单调确认值，编辑器层的 revision 在每次用户编辑、Undo 或 Redo 后增加一次。IME 组合中间态不增加，组合结束后只增加一次。

## 原子 snapshot

`createSnapshot` 中的 revision 表示原生已知的最低 revision，而不是要求精确相等：

1. 原生记录当前 `documentID` 和最低已知 revision，发送 `createSnapshot`；
2. 编辑器在处理该命令的同一个 JavaScript turn 中读取当前文本和当前 revision；
3. 若文档一致且编辑器 revision 不低于最低值，返回不可变的 `snapshotReady`；
4. 返回后发生的编辑只产生更高 revision，不会改变已返回的字符串；
5. 原生只完成 request ID、document ID 匹配且 revision 不低于门槛的请求，不用旧 snapshot 回写编辑器状态。

这消除了“输入事件已在 Web 端提交，但 stateChanged 尚未到达原生端”时的快速保存竞态。连续保存各自持有独立 request ID 和不可变文本。

## 超时与重试

- 每个 snapshot 请求独立计时；超时只失败对应保存，不清除其他请求；
- `stale_revision`、`request_conflict` 和 `editor_not_ready` 最多重试三次；
- 导航、进程终止或协议错误会失败所有等待请求；
- 迟到或未知 request ID 被忽略。

## 实际编辑器

受支持 Markdown 由 ProseMirror runtime 承载，并使用 INK-011 的 history、dirty、IME 与 paste 会话。未知/延后 Markdown 自动进入源码 textarea，保存始终返回完整缓冲区；其 Undo/Redo 也通过 revisioned Bridge 上报。未修改文档无论使用哪种模式都返回原始字节对应字符串。
