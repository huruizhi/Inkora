# Revision 同步、Snapshot 与 Save Barrier

原生层与 Bridge 的逻辑 revision 是单调确认值，在每次普通编辑、Undo、Redo 或达到稳定边界的 IME 逻辑单元后增加一次。编辑器内部原文版本可随已接受的组合中间态推进，但不得直接当作 Bridge revision；composition 稳定前不发布文档 revision。

## 原子 snapshot

`createSnapshot` 中的 revision 表示原生已知的最低 revision，而不是要求精确相等：

1. 原生记录当前 `documentID` 和最低已知 revision，发送 `createSnapshot`；
2. 若 UI composition 已结束但 PM final 尚在稳定排空，编辑器先等待同一 runtime 的稳定边界；未在 120ms 内稳定或期间 load/destroy 时返回可重试 `editor_not_ready`，不读取中间拼音；
3. 稳定后，编辑器在同一个 JavaScript turn 中读取当前文本和当前 revision；
4. 若文档一致且编辑器 revision 不低于最低值，返回不可变的 `snapshotReady`；
5. 返回后发生的编辑只产生更高 revision，不会改变已返回的字符串；
6. 原生只完成 request ID、document ID 匹配且 revision 不低于门槛的请求，不用旧 snapshot 回写编辑器状态。

这消除了“输入事件已在 Web 端提交，但 stateChanged 尚未到达原生端”时的快速保存竞态。连续保存各自持有独立 request ID 和不可变文本，并由 `InkoraDocument` 串行提交，后发保存不会越过先发保存。

## 磁盘提交与 saved baseline

`InkoraDocument` 取得带 `(documentID, revision, text)` 的 snapshot 后，交给 `NSDocument` safe-save 流程；实际数据写入使用 `Data.write(..., .atomic)`。只有提交成功才向编辑器发送 `markSaved`：

- `Save As` 成功后由 `NSDocument` 切换 `fileURL`，后续 `Save` 写入新路径；
- 系统保存面板负责覆盖确认与取消，取消不会进入写入阶段；
- permission、空间不足或其他写入失败不发送 `markSaved`，旧文件与 dirty 状态保持不变；
- 保存期间继续编辑时，已提交 revision 成为 saved baseline，更高 revision 仍保持 dirty；
- 保存请求按入队顺序逐一执行，因此连续 `Cmd+S` 最终落盘最新成功 snapshot。

## 超时与重试

- 每个 snapshot 请求独立计时；超时只失败对应保存，不清除其他请求；
- `stale_revision`、`request_conflict` 和 `editor_not_ready` 最多重试三次；composition drain 的 `editor_not_ready` 保留当前原文并在稳定后自动恢复资格；
- 导航、进程终止或协议错误会失败所有等待请求；
- 迟到或未知 request ID 被忽略。

每次通过校验的 `snapshotReady` 也成为原生层的最近确认恢复点。Web Content process 终止后只重放该恢复点；snapshot 请求中或其后尚未确认的编辑不会参与保存。超时、非法消息、初始化或恢复失败均把当前保存操作以错误结束，绝不继续调用磁盘写入。

## 实际编辑器

生产编辑器由唯一当前 Markdown 原文、派生语义和带位置依据的 ProseMirror 投影组成。稳定延后片段以精确原文占位与正文混排；未知、畸形或未证明事务保留当前原文、可信投影和完整意图，阻断本次快照并开放主动源码修复，不自动把整篇切到 textarea。未提交源码草稿同样阻断快照；取消草稿或修复提交后，下一次保存可以恢复。

`createSnapshot` 读取同一 turn 的安全当前原文。`markSaved` 只把命令携带的精确 snapshot 文本设为保存点；它不重建或覆盖较新的当前原文、选区和历史。未修改文档、可视/source no-op、BOM、LF/CRLF/mixed EOL 与尾部换行均返回原始字节对应字符串。

## 图片资源前置屏障

未命名图片首次保存时，目标目录授权不由 Save panel 文件权限替代。编辑器先以 `prepareImageSave` 完成草稿 URI 的精确 owner 重写，再采集正式 snapshot。原生按真实图片语法 owner 验证 snapshot：本 plan 的每个目标 URI 必须存在，原 draft URI 必须消失；代码、HTML、普通正文或普通链接中的同字串不算 owner。验证失败直接拒绝，不调用 Markdown writer。随后原生重验资源来源 SHA 和目标冲突，资源全部发布并复验后才调用 `super.save`；Markdown 成功才发送 `markSaved` 和以匹配的 plan ID 确认资源清单。

资源已发布而 Markdown 失败时不回滚或删除已发布孤儿：会话保持 `awaitingMarkdown`，但 manifest owner 仍是 draft URI；草稿源与 journal 保留，正文保持 dirty。下次保存可从当前 snapshot 和同一真实 asset 身份复用同字节目标，或对新目标执行新的显式路径事务；旧 plan 回执不能确认新重试。Save As 的已有引用字节不改，关联相对资源按原 URI 迁移；任一缺失、拒权或异字节冲突会阻止 Markdown 提交。

Web 会话按 asset ID 记住已经接受的当前图片 owner，并把该映射纳入 Undo/Redo 快照。Markdown 提交失败后的同目标重试必须重新验证唯一真实图片 atom 后成为严格 no-op，不增加 revision/history；改目标只从当前 owner 原子改写。owner 已被源码编辑成普通链接、消失、重复或无法证明时保守拒绝，不能按字符串全局替换。
