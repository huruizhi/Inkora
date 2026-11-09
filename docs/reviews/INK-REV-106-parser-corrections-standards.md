# Standards

## 范围

审查 `47c0d54735c70b9e55268ad43f9f085f08ff4dd6...fab0bccc98dc62518af462fb97f54660d46b328a`，仅覆盖 parser corrections 相关代码与必要上下文；不做 Spec 轴判断。仓库未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`，因此以指定正式文档、AGENTS.md 与 Fowler baseline 为准。

## Findings

无 documented-standard hard violation。

无足够证据成立 Fowler baseline smell。epoch 修正清除 `reopen` 的 parse/context/boundary 缓存，并以 `transaction.before !== this.state.doc` 检查 PM 文档身份，符合 `docs/design/protected-syntax-production-v2.md:13,19,41` 的 raw/epoch、缓存失效和完整身份约束，也符合 `docs/save-barrier.md:57-59` 的不可变 PM 文档与 epoch 绑定。

`inputRulePlan` 保留实际键入的 `---`，由会话建立 U 投影并阻断结构化保存；这符合 `docs/markdown-support.md:27,41`、`docs/design/protected-syntax-production-v2.md:17` 的完整原文、可信投影、诊断与保存闸门要求。闭合 Mermaid 未被降级，符合 `SYN-S005` 的支持级别。

## Verification

实际运行：`pnpm --dir editor exec vitest run src/protected-parser-review.test.ts`，1 file、3 tests passed。未重跑全 Web/Native/Release、lint 或 UI；其结果不由本审查声称。新文档本身不改变产品行为。
