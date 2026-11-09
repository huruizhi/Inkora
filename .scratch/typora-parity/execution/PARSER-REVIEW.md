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

## 限定修正：106 Standards

受检47c...fab0bcc，仅审补正。106最终5396cc64715ce717f0f327b725896eed8d3a7558：hard0、judgement0；实跑新公开3例3/3。原文如下。

# Standards

## 范围

审查 `47c0d54735c70b9e55268ad43f9f085f08ff4dd6...fab0bccc98dc62518af462fb97f54660d46b328a`，仅覆盖 parser corrections 相关代码与必要上下文；不做 Spec 轴判断。仓库未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`，因此以指定正式文档、AGENTS.md 与 Fowler baseline 为准。

## Findings

无 documented-standard hard violation。

无足够证据成立 Fowler baseline smell。epoch 修正清除 `reopen` 的 parse/context/boundary 缓存，并以 `transaction.before !== this.state.doc` 检查 PM 文档身份，符合 `docs/design/protected-syntax-production-v2.md:13,19,41` 的 raw/epoch、缓存失效和完整身份约束，也符合 `docs/save-barrier.md:57-59` 的不可变 PM 文档与 epoch 绑定。

`inputRulePlan` 保留实际键入的 `---`，由会话建立 U 投影并阻断结构化保存；这符合 `docs/markdown-support.md:27,41`、`docs/design/protected-syntax-production-v2.md:17` 的完整原文、可信投影、诊断与保存闸门要求。闭合 Mermaid 未被降级，符合 `SYN-S005` 的支持级别。

## Verification

实际运行：`pnpm --dir editor exec vitest run src/protected-parser-review.test.ts`，1 file、3 tests passed。未重跑全 Web/Native/Release、lint 或 UI；其结果不由本审查声称。新文档本身不改变产品行为。

106已核对origin/clean并逐文件603文件tar+bundle备份，tar SHA8e523f480eba4a12724bb83c3f2a5e6baedc1ff2ce56e0f2bf7303828f1c0e75；Agent/workspace两层归档，managed累计91。107 Spec（Agent bb828ae9-e894-4dd2-9734-25b511292b81 / workspace wks_99c1b502a4358654）仍执行，不能用Standards0代替其结论。

## 限定修正：107 Spec首稿与根后验

107首稿94165671e5d7723f0dca890b3d283d74a28642d8：missing/partial1 P1，scope creep0/wrong0。以下原文保留。

# Spec

受检范围：`47c0d54735c70b9e55268ad43f9f085f08ff4dd6...fab0bccc98dc62518af462fb97f54660d46b328a`。仅审 parser 补正；未作 Standards 判断。

## Findings

### P1 · missing/partial：未闭合 Mermaid 仍被错误降级

`docs/markdown-support.md:77` 明确规定 `SYN-S005` 围栏代码块支持可选 info string，且文件末尾没有 closing fence 仍是合法块；`:142` 又要求这种块编辑时不得凭空补 closing fence。`docs/design/protected-syntax-production-v2.md:18` 要求代码高亮继续工作。

但 `editor/src/protected-syntax.ts:271-275` 仍只把未闭合 `mermaid` 围栏改为 `protected_block` / `SYN-U002`。公共生产 Session 反例：` ```mermaid\nflowchart TD\n` 得到 `protected_block`、`issues=["mermaid"]`、`saveEligible=false`；同形 ` ```ts\nconst x = 1;\n` 得到 `code_block`、无 issue、可保存。闭合 Mermaid 虽已恢复为可编辑 `SYN-S005`，补正仍未覆盖 canonical 明定的无 closing fence 形态。

建议：删除 Mermaid 专属的未闭合降级，并增加未闭合 Mermaid 的直接编辑、围栏不补全、Undo/Redo 与精确原文回归。

## 其余分类

- scope creep：0
- wrong：0（除上述不完整实现外）

## 独立验证

- 新公开三例：3/3 passed。
- `---` 真实 input-rule：1/1 passed，精确保留第三个 `-` 并进入 U 投影。
- 水平线 `***`、`___`、`* * *`、`_ _ _`、非 BOF `---`：5/5 保持 `horizontal_rule`、可保存、原文精确。
- GATE-004 显式源码保存及 no-op 不清除未解决意图：2/2 passed。

未运行完整 Web、Native、Bridge、Release、lint、性能或 GUI；按审查限定留给根结算。

根重放EOF Mermaid两种围栏/BOM/CRLF/无尾换行先红，7305b97161ff9173fb575ebf4014036dabdcd64b删除全部Mermaid hook与导入调用，公共22/22+tsc绿；107已收到fixed SHA并做有限独立后验，尚不能报Spec通过。

PR77首轮CI42690666114 completed/failure，仅checkout失败（GitHub443超时），后续所有产品检查均未执行。根未改workflow/网络配置/测试。只读查证runner无proxy env，系统proxy127.0.0.1:7897；当前匿名curl直连和本地proxy均HTTP200，证据是传输暂时恢复，不是产品CI通过。最终head需新默认CI。

## 107独立post-fix与最终候选

原首稿P1不撤回；下列后验固定7305，关闭该P1，有限范围新增0。

# Spec

受检范围：`47c0d54735c70b9e55268ad43f9f085f08ff4dd6...fab0bccc98dc62518af462fb97f54660d46b328a`。仅审 parser 补正；未作 Standards 判断。

## Findings

### P1 · missing/partial：未闭合 Mermaid 仍被错误降级

`docs/markdown-support.md:77` 明确规定 `SYN-S005` 围栏代码块支持可选 info string，且文件末尾没有 closing fence 仍是合法块；`:142` 又要求这种块编辑时不得凭空补 closing fence。`docs/design/protected-syntax-production-v2.md:18` 要求代码高亮继续工作。

但 `editor/src/protected-syntax.ts:271-275` 仍只把未闭合 `mermaid` 围栏改为 `protected_block` / `SYN-U002`。公共生产 Session 反例：` ```mermaid\nflowchart TD\n` 得到 `protected_block`、`issues=["mermaid"]`、`saveEligible=false`；同形 ` ```ts\nconst x = 1;\n` 得到 `code_block`、无 issue、可保存。闭合 Mermaid 虽已恢复为可编辑 `SYN-S005`，补正仍未覆盖 canonical 明定的无 closing fence 形态。

建议：删除 Mermaid 专属的未闭合降级，并增加未闭合 Mermaid 的直接编辑、围栏不补全、Undo/Redo 与精确原文回归。

## 其余分类

- scope creep：0
- wrong：0（除上述不完整实现外）

## 独立验证

- 新公开三例：3/3 passed。
- `---` 真实 input-rule：1/1 passed，精确保留第三个 `-` 并进入 U 投影。
- 水平线 `***`、`___`、`* * *`、`_ _ _`、非 BOF `---`：5/5 保持 `horizontal_rule`、可保存、原文精确。
- GATE-004 显式源码保存及 no-op 不清除未解决意图：2/2 passed。

未运行完整 Web、Native、Bridge、Release、lint、性能或 GUI；按审查限定留给根结算。

## Post-fix 独立复核

保留以上首稿 P1 及证据以便追溯。后验固定提交为 `7305b97161ff9173fb575ebf4014036dabdcd64b`；使用 `git archive 7305b97161ff9173fb575ebf4014036dabdcd64b | tar -x -C "$review_tmp"` 导出临时隔离副本，仅 symlink 既有 `editor/node_modules`，未修改本分支受检产品或根工作区。

固定补丁完整删除 Mermaid 专属 finalize hook、导入及调用，并增加 EOF Mermaid 回归。`pnpm --dir "$review_tmp/editor" exec vitest run src/protected-parser-review.test.ts`：1 file、4/4 passed；原三例保持绿，反引号 LF 与波浪线 BOM/CRLF/无尾换行的 EOF Mermaid 均保持 `code_block`，可直接编辑，不新增 closing delimiter，可保存且 Undo/Redo 精确恢复。`pnpm --dir "$review_tmp/editor" exec vitest run src/source-explicit-save.test.ts -t 'allows exact UTF-8|does not let a source receipt'`：1 file、2 passed、3 skipped；GATE-004 显式源码保存及 no-op 不清除未解决意图保持绿。

后验结论：固定提交关闭首稿唯一 P1，有限范围内无新增 Spec finding。未运行完整 Web、Native、Bridge、Release、lint、性能或 GUI；这些不属于本次后验复核证据。临时隔离副本已移入废纸篓，未遗留 symlink。

107最终eaac2be6dc9a065d67c56fe82f913be2eecd7d96已远端/clean/603文件逐项tar+bundle核验，tar SHA8e4c405e691d670d2e8231a0a134038faabe58f8a6fac2495b3831c2ae011774，Agent/workspace两层归档，managed累计92。当前无活动Paseo Agent。根7305全量766、lint/Bridge14/15/Native179/0/8/Release/offline通过；最终docs head545e3a9将执行新精确默认CI，PR77继续draft待CI，未用旧checkout失败作产品结果。
