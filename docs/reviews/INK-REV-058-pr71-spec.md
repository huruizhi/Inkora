# Spec

## 发现

1. **[P1][缺失/部分实现] 生产界面没有创建链接的常规命令。** V1 要求连续编辑“格式、代码与链接”（`docs/design/source-authority-production-v1.md:7`），045 又明确要求 link 添加/移除进入局部原文补丁契约（`docs/tasks/INK-M1-045.md:9`）。但 runtime 以无 options 的 `new SourceAuthoritySession(text)` 建会话（`editor/src/editor-runtime.ts:93`），最终把 `undefined` 传给 link keymap（`editor/src/editor-session.ts:88-94`）；因此真实 `Mod-K` 分支没有 `requestLink`，固定返回 false（`editor/src/inline-formatting.ts:68-77`）。现有集成测试直接调用内部 `setLink(...)`，未经过生产用户入口。用户只能手写 Markdown/转源码，未交付规格所称完整常规写作命令。

2. **[P1][看似实现但错误] 两个已接入的代码块常规命令会在真实原文会话中被拒绝。** 045 要求“代码块转换”走局部补丁（`docs/tasks/INK-M1-045.md:9`），V1 禁止普通已声明操作最终以安全拒绝代替实现（`docs/design/source-authority-production-v1.md:18`）。有限生产 seam 反例：对 `one\n\ntwo\n` 第一段执行 `setCodeBlock("ts")`，命令报告 handled，但 raw 仍原样且进入 unresolved；规划器仅在目标文档只有一个顶层块时生成 paragraph→code 补丁（`editor/src/source-transaction.ts:419-427`）。对 `````ts\none\n```\n`` 内执行已绑定的 `Mod-Enter`/`exitCode`（`editor/src/block-editing.ts:70-79`），同样进入 unresolved；通用规划尾部直接拒绝该 replace（`editor/src/source-transaction.ts:565-571`）。两例均会阻断 snapshot。

## 未要求的范围扩张

未发现行动级范围扩张。V3 表格/任务、V4 图片、V6 可视替换仅为文档与后续 golden，不按本 PR 缺陷计；用户选择稍后的物理 IME/UI 验收也未转写为功能缺陷。

## 验证边界

临时 Vitest 仅跑上述 2 个真实 runtime/session seam：2/2 按预期暴露失败；已删除测试副本与 `node_modules` 临时链接。未重复 406 editor、Native、Bridge、lint/build/Release；引用根任务已执行证据。synthetic 结果不冒充真实 WKWebView/物理 IME。
