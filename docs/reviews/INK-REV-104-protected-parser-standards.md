# Standards

审查固定于 `HEAD=47c0d54735c70b9e55268ad43f9f085f08ff4dd6`，唯一产品 diff 为 `acf33923081e066812603269da6a332b7c8e02e3...HEAD`。HEAD、merge-base 与非空 diff 已核对；全仓未发现 `CODING_STANDARDS.md`/`CONTRIBUTING.md`。以下仅为 Standards 轴；smell 均为 judgement，不升级为 hard finding。

## 书面标准背离

1. `SYN-D001`/`docs/markdown-support.md:94,118` 与 V2 canonical 优先级 `docs/design/protected-syntax-production-v2.md:15` 要求在“可选 BOM 后”优先锁定 front matter；本 diff 的 `editor/src/source-document.ts:26-28,57-62` 先把 BOM 从 parser 输入移除，而 `editor/src/protected-syntax.ts:185-193` 只在 `start === 0` 且直接切 `state.src` 的 `---`/`+++`。因此 BOM 后的 front matter 不经过该保护规则，偏离书面 parser 边界标准。该判断只记录标准背离，不作 Spec 轴结论。

## Fowler smells（judgement）

- **Duplicated Code** — `editor/src/protected-syntax.ts:58-72` 与 `81-92` 对 inline/block HTML 重复执行“取 token、判 JSX/comment/raw_html、写 opaque meta”的同形逻辑；同一规则变更需同步两段。
- **Primitive Obsession / Mysterious Name** — `editor/src/protected-syntax.ts:5-14,17-30` 以多个裸 `string`（`kind`、`issue`、`form`、rule ID）拼装 canonical token 语义；`editor/src/protected-syntax.ts:48,57` 的 `bareOwners`、`insideOwner` 也不揭示“当前 parser owner 作用域”的领域含义。可考虑小型 token/boundary 类型与更明确命名。
- **Divergent Change** — `editor/src/protected-syntax.ts:35-268` 同时承担 HTML、脚注、Wiki、U 候选、front matter、callout、math、container 候选等多类边界；新增任一语法都改动该单一安装器，职责变化方向明显分叉。

未发现其它可由已读书面规范直接确认的 Standards 背离；未运行 UI、Native、Release、perf 或完整套件。
