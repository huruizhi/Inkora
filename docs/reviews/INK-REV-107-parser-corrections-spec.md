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
