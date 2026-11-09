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
