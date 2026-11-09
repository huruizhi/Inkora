# V2 Parser：独立双轴复核

固定基线acf33923081e066812603269da6a332b7c8e02e3，受检47c0d54735c70b9e55268ad43f9f085f08ff4dd6。只审不修；两轴不合并或跨轴重排。

## Standards

104 Luna最终c9b41cb8180121d87c35ea6230c8eb47aab0dc2a：hard0、judgement3。BOM首稿误判已公开撤回，首稿与纠正原样保留如下。根与作者均在公开会话复验1/1绿；产品未修改，根另以206c832固化测试（760全量仍绑定47c，新增1例仅定向通过）。

# Standards

审查固定于 `HEAD=47c0d54735c70b9e55268ad43f9f085f08ff4dd6`，唯一产品 diff 为 `acf33923081e066812603269da6a332b7c8e02e3...HEAD`。HEAD、merge-base 与非空 diff 已核对；全仓未发现 `CODING_STANDARDS.md`/`CONTRIBUTING.md`。以下仅为 Standards 轴；smell 均为 judgement，不升级为 hard finding。

## 书面标准背离

1. `SYN-D001`/`docs/markdown-support.md:94,118` 与 V2 canonical 优先级 `docs/design/protected-syntax-production-v2.md:15` 要求在“可选 BOM 后”优先锁定 front matter；本 diff 的 `editor/src/source-document.ts:26-28,57-62` 先把 BOM 从 parser 输入移除，而 `editor/src/protected-syntax.ts:185-193` 只在 `start === 0` 且直接切 `state.src` 的 `---`/`+++`。因此 BOM 后的 front matter 不经过该保护规则，偏离书面 parser 边界标准。该判断只记录标准背离，不作 Spec 轴结论。

## Fowler smells（judgement）

- **Duplicated Code** — `editor/src/protected-syntax.ts:58-72` 与 `81-92` 对 inline/block HTML 重复执行“取 token、判 JSX/comment/raw_html、写 opaque meta”的同形逻辑；同一规则变更需同步两段。
- **Primitive Obsession / Mysterious Name** — `editor/src/protected-syntax.ts:5-14,17-30` 以多个裸 `string`（`kind`、`issue`、`form`、rule ID）拼装 canonical token 语义；`editor/src/protected-syntax.ts:48,57` 的 `bareOwners`、`insideOwner` 也不揭示“当前 parser owner 作用域”的领域含义。可考虑小型 token/boundary 类型与更明确命名。
- **Divergent Change** — `editor/src/protected-syntax.ts:35-268` 同时承担 HTML、脚注、Wiki、U 候选、front matter、callout、math、container 候选等多类边界；新增任一语法都改动该单一安装器，职责变化方向明显分叉。

未发现其它可由已读书面规范直接确认的 Standards 背离；未运行 UI、Native、Release、perf 或完整套件。

## 自校核纠正（撤回原首稿 hard finding）

原首稿关于 BOM front matter 的判断错误，现明确撤回，不删除上文原始记录以保留审查轨迹。`source-document.ts:26-28` 先将 BOM 从 parser 输入移除后，`protected-syntax.ts:185-193` 的 `start === 0` 正好命中归一化输入中的 `---`/`+++`；`bindOpaqueInlineSource` 再将保护范围映射回原始 raw，保留 `sourceStart=1`。在公开 `SourceAuthoritySession` 接缝上复核 YAML/TOML + BOM + CRLF：均得到 `protected_block/front_matter`、raw 不含 BOM、offset 1 且 `saveMemory()` 成功。控制测试命令 `pnpm exec vitest run src/protected-source-runtime.test.ts -t 'BOM-prefixed metadata'` 实际 1/1 通过；日志见 `/tmp/ink103-bom-review-control.txt`。因此本次 Standards 轴没有 hard finding；其余 Fowler 项仍仅为 judgement。

## Spec

105 Sol最终873acda3f1006f1cb2ab082c9102e761a8f75fdd：missing/partial1、scope creep1、wrong1，均P1。原文如下，根不跨轴合并/重排。根在产品不改情况下独立三例全部重放为红，日志/tmp/ink103-review105-red.txt；仍不合并103。

# Spec

固定受检 `47c0d54735c70b9e55268ad43f9f085f08ff4dd6`，基线/merge-base 均为 `acf33923081e066812603269da6a332b7c8e02e3`；指定 diff 非空，初始工作区干净。

## Missing / partial

- **P1 — 相同原文重开后旧 epoch 事务仍会被接受。** 规格要求 accepted 范围绑定同一 raw/解析 epoch，并对过期事务原子拒绝，主入口还必须覆盖旧 epoch 拒绝（`docs/design/protected-syntax-production-v2.md:13,16,29`）。但 parse cache 只以 raw 为键（`editor/src/source-authority.ts:555-558,627-631`），`reopen()` 未清 cache 且最后才递增 epoch（`:1687-1699`），事务门仅比较 `transaction.before.eq(currentDoc)`（`:1127-1131`）。公开反例：创建 `Body.\n` 的事务，`reopen("Body.\n")` 后 dispatch，实际返回 `true` 并改写新 epoch；预期拒绝。现有变更因此未闭合 epoch/provenance 契约。

## Scope creep

- **P1 — 新增 Mermaid 专属降级不在 canonical D/U 方言中。** `finalizeProtectedSyntax` 把闭合 `mermaid` fence 改成 `protected_block`（`editor/src/protected-syntax.ts:270-278`），而 canonical 明定所有带可选 info string 的闭合围栏均为可编辑 `SYN-S005`（`docs/markdown-support.md:76-77`）。公开反例的首节点实际为 `protected_block`，不是 `code_block`；这同时是错误实现，会让合法 S 内容只能经源码修改。

## Looks implemented but wrong

- **P1 — EOF-only `---` 绕过 front-matter U 判定。** canonical 要求 BOF `---` 无合法闭合时归 `SYN-U002`，且 front matter 优先于其余块分类（`docs/markdown-support.md:94,108,117-120`）。实现却在 opening 行抵达 EOF 时直接返回 false（`editor/src/protected-syntax.ts:185-202`），回退为可保存、可视可删的水平线；新增测试还固化该行为（`editor/src/protected-source-runtime.test.ts:79-96`）。公开反例实际 `issues=[]`、`saveEligible=true`，与保存闸门相反。

有限反例共 3 项，均按规格预期失败；未发现除此之外可独立成立的 scope creep。


## 备份与状态

104最终554文件、tar SHA70fbc20232a30a13d5f78c4733db39822202673fd28b32568f34b7cc9834cf65；Git bundle与逐文件tar核验、origin等同后归档Agent/workspace，managed累计89。103当前代码仍47c，文档15ad819，BOM测试206c832；15ad备份591文件/tar SHA c73fefe77e2631fa54ae6c301774f394c7582a14cb8ba9bb1ecb622fa198f01e，完整测试xcresult另存fdad037789210bf53e2bb9e044234202dc170477bf1c30e0bd975aed73ba067c。未合main/未建PR。

105最终554文件、tar SHA9ed65f1eb2224b12a51c80d0251eb7c36dc50a4f12a9edf23eb5f797ace110f0，origin/clean/bundle/tar逐文件核验后Agent/workspace归档，managed累计90。当前无活动Paseo Agent。根继续在103修三个实证P1，不以物理延期代替可做开发。
