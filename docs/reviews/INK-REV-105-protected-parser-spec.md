# Spec

固定受检 `47c0d54735c70b9e55268ad43f9f085f08ff4dd6`，基线/merge-base 均为 `acf33923081e066812603269da6a332b7c8e02e3`；指定 diff 非空，初始工作区干净。

## Missing / partial

- **P1 — 相同原文重开后旧 epoch 事务仍会被接受。** 规格要求 accepted 范围绑定同一 raw/解析 epoch，并对过期事务原子拒绝，主入口还必须覆盖旧 epoch 拒绝（`docs/design/protected-syntax-production-v2.md:13,16,29`）。但 parse cache 只以 raw 为键（`editor/src/source-authority.ts:555-558,627-631`），`reopen()` 未清 cache 且最后才递增 epoch（`:1687-1699`），事务门仅比较 `transaction.before.eq(currentDoc)`（`:1127-1131`）。公开反例：创建 `Body.\n` 的事务，`reopen("Body.\n")` 后 dispatch，实际返回 `true` 并改写新 epoch；预期拒绝。现有变更因此未闭合 epoch/provenance 契约。

## Scope creep

- **P1 — 新增 Mermaid 专属降级不在 canonical D/U 方言中。** `finalizeProtectedSyntax` 把闭合 `mermaid` fence 改成 `protected_block`（`editor/src/protected-syntax.ts:270-278`），而 canonical 明定所有带可选 info string 的闭合围栏均为可编辑 `SYN-S005`（`docs/markdown-support.md:76-77`）。公开反例的首节点实际为 `protected_block`，不是 `code_block`；这同时是错误实现，会让合法 S 内容只能经源码修改。

## Looks implemented but wrong

- **P1 — EOF-only `---` 绕过 front-matter U 判定。** canonical 要求 BOF `---` 无合法闭合时归 `SYN-U002`，且 front matter 优先于其余块分类（`docs/markdown-support.md:94,108,117-120`）。实现却在 opening 行抵达 EOF 时直接返回 false（`editor/src/protected-syntax.ts:185-202`），回退为可保存、可视可删的水平线；新增测试还固化该行为（`editor/src/protected-source-runtime.test.ts:79-96`）。公开反例实际 `issues=[]`、`saveEligible=true`，与保存闸门相反。

有限反例共 3 项，均按规格预期失败；未发现除此之外可独立成立的 scope creep。
