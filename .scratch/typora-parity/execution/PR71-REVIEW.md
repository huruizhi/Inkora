# PR71 双轴独立审查

固定受检范围：`48258a9…93a3b59`。以下分别原样收录两轴报告，不合并评级；管理者处理记录在末尾。

# Standards

审查范围：PR #71 diff（base `48258a9` → HEAD `93a3b59`，95 文件 +7572/−490）的 V1/V5/导航实现及配套文档。标准来源：AGENTS.md、GLOSSARY.md、ADR-0004、markdown-support、bridge-protocol、editor-session、save-barrier、testing；全库确认无 CODING_STANDARDS/CONTRIBUTING。

## (a) 违反书面标准

未发现 hard 违规。沟通/文档中文、commit 英文 Conventional、平台离线（highlight.js 经 `lib/core` 本地打包、版本锁定 11.12.0）均符合；V3/V6 文档明确标注未实现，`docs/design/local-images-production-v4.md` 状态行为"生产实施规格"、未像 V3 那样正面声明"尚未实现"（judgement：建议补一句，无冒称已实现的表述，不构成违规）。

## (b) Smell（均为 judgement，无 hard）

1. **Duplicated Code（最实）**：`source-authority.ts` 提交样板（push past/future 清空/version++/清 diagnostic）在 accept、dispatch、nativeBackspace、applySource、undo、redo 约 6 处手抄，措辞漂移；BOM 起点探测 `startsWith('\uFEFF')?1:0` 跨 source-document/source-authority/source-transaction/source-ledger 至少 7 处内联。`editor-runtime.ts` `applySourceDraft` 与 `applySourceReplacement` 后半段 7 步同形，`undo`/`redo` 同构；`main.ts` 同构 `editorError` 响应块 ×4。测试侧 `EditorWebViewTests.swift` 轮询循环形状 5+ 次（其中 2 处内联绕过既有 helper）、webView 解包表达式 4 处。
2. **Repeated Switches**：`source-transaction.ts` `markDelimiters` 与 `existingMarkDelimiters` 对五种 mark 平行展开同一 if 链，新增 mark 需双处同步。
3. **Primitive Obsession**：`source-ledger.ts` `from/to` 参数在"units 下标"与"源 UTF-16 偏移"两套坐标同名混用；边界朝向概念存在 `-1|1`（authority）、`'from'|'to'`（transaction）、`'left'|'right'`（ledger）三套词表。
4. **Speculative Generality**：`source-ledger.ts` `LedgerBlock.visualText`/`inlineCount` 三处赋值、全库无读取点（部分分支值无意义）；`bridge.ts` `markSaved` 保留对象/函数双传参协议，生产仅用函数形。
5. **Mysterious Name / Middle Man**：`beginComposition()` 是 `startComposition()` 纯别名，且与 `editor-session.ts:165` 同名异行为；`topLevelAt` 纯转发 `doc.nodeAt`；`mapRawOffset` vs `mapSourceAnchor`、`eolAt` vs `eolForLine` 同概念双实现且命名分叉。

正例：`rawBoundaryError`、`emptySourceAnchor`、`COMPOSITION_QUIET_WINDOW_MS`、ok-union 错误通道等命名与结构清晰；旧三 runtime 路由决策树整体删除是显著复杂度消除。

**结论：0 hard、5 组 judgement；不阻塞合并，建议后续任务优先收敛 1/2。**


---

# Spec

## 发现

1. **[P1][缺失/部分实现] 生产界面没有创建链接的常规命令。** V1 要求连续编辑“格式、代码与链接”（`docs/design/source-authority-production-v1.md:7`），045 又明确要求 link 添加/移除进入局部原文补丁契约（`docs/tasks/INK-M1-045.md:9`）。但 runtime 以无 options 的 `new SourceAuthoritySession(text)` 建会话（`editor/src/editor-runtime.ts:93`），最终把 `undefined` 传给 link keymap（`editor/src/editor-session.ts:88-94`）；因此真实 `Mod-K` 分支没有 `requestLink`，固定返回 false（`editor/src/inline-formatting.ts:68-77`）。现有集成测试直接调用内部 `setLink(...)`，未经过生产用户入口。用户只能手写 Markdown/转源码，未交付规格所称完整常规写作命令。

2. **[P1][看似实现但错误] 两个已接入的代码块常规命令会在真实原文会话中被拒绝。** 045 要求“代码块转换”走局部补丁（`docs/tasks/INK-M1-045.md:9`），V1 禁止普通已声明操作最终以安全拒绝代替实现（`docs/design/source-authority-production-v1.md:18`）。有限生产 seam 反例：对 `one\n\ntwo\n` 第一段执行 `setCodeBlock("ts")`，命令报告 handled，但 raw 仍原样且进入 unresolved；规划器仅在目标文档只有一个顶层块时生成 paragraph→code 补丁（`editor/src/source-transaction.ts:419-427`）。对 `````ts\none\n```\n`` 内执行已绑定的 `Mod-Enter`/`exitCode`（`editor/src/block-editing.ts:70-79`），同样进入 unresolved；通用规划尾部直接拒绝该 replace（`editor/src/source-transaction.ts:565-571`）。两例均会阻断 snapshot。

## 未要求的范围扩张

未发现行动级范围扩张。V3 表格/任务、V4 图片、V6 可视替换仅为文档与后续 golden，不按本 PR 缺陷计；用户选择稍后的物理 IME/UI 验收也未转写为功能缺陷。

## 验证边界

临时 Vitest 仅跑上述 2 个真实 runtime/session seam：2/2 按预期暴露失败；已删除测试副本与 `node_modules` 临时链接。未重复 406 editor、Native、Bridge、lint/build/Release；引用根任务已执行证据。synthetic 结果不冒充真实 WKWebView/物理 IME。


---

## 管理者处理

- Standards 的五组 judgement 不升级成书面标准违规，后续在功能收敛后集中处理。
- Spec 的两项 P1 保持阻断；059 独立任务已启动，须真实入口与原文字节/选区/历史复验。
- 旧 CI 42611845164 对精确93a3b59已成功；修复合入产生新head后必须重新执行默认CI，不沿用旧绿色。
- 050表格/任务在根056隔离集成，不混入本次PR的固定审查范围。物理验收按用户要求稍后。

