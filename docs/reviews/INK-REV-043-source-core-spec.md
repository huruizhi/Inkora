# INK-REV-043 Source Core Spec 审查

固定审查 `271922e...0937615`（提交 `39b60c7`、`69e824d`、`0937615`）。仅作 Spec 审查；未重复管理者全量测试，临时红测和 `node_modules` 链接已清理。未发现明确越界交付，也未把缺少 GUI 验收当作代码失败。

## 发现

1. **(c) 严重：拒绝的 `markSaved` 仍污染保存点。** 规格要求旧/错误收据不得覆盖当前状态（`docs/design/source-authority-production-v1.md:24-25`；`docs/bridge-protocol.md:82`；`docs/save-barrier.md:40`）。实际路径先执行 `runtime.markSaved(command.text)`，再由协议会话校验 document/revision/request（`editor/src/main.ts:511-519`；`editor/src/bridge.ts:263-278`），故错误 documentID 已改 `savedRaw`。**实际复现**：编辑 `a\n→ab\n`，发送 wrong-doc `markSaved` 得 `stale_revision`，再 Undo/Redo；预期仍 dirty，实际 false。命令：`vitest run src/main.test.ts -t REVIEW`，该断言失败（expected true, received false）。

2. **(a) 严重：常见未知片段触发整篇自动源码降级。** V1 要求高级片段与正文混排、未知结构保留投影/意图，禁止自动整篇源码（规格 `:7-10,18`；save barrier `:38`）。`::: note` 被解析器抛错（`editor/src/source-document.ts:122-123`），入口用通配 `catch` 静默创建旧 `SourceEditorRuntime`（`editor/src/editor-runtime.ts:694-706`）。**实际复现**：正文 + `::: note` + 尾段加载后无 `.ProseMirror`、出现整篇 textarea；同一 REVIEW 命令相应断言失败。此 catch 还掩盖环境/编程错误，超出“合法片段”单点。

3. **(c) 高：source no-op 往返丢 caret。** 规格明确 no-op 不移动 caret，并要求源码往返选区（规格 `:17,31-34`）。取消路径未读取 textarea 当前 selection，直接丢 draft 并重渲染（`editor/src/editor-runtime.ts:171-175,374-375`；`editor/src/source-authority.ts:801-805`）。**实际复现**：`abc\n` 进入源码，将 caret 置 2，取消、再进入；预期 2，实际 0。命令：`vitest run src/editor-runtime.test.ts -t REVIEW`，1/1 失败。

## 结论

规格轴 3 项：缺失/部分 1，越界 0，看似实现但错误 2。最严重为无效保存回执改变 dirty 基线，可能把未落盘内容报告为 clean。
