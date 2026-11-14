# INK-REV-210 空段落修改：Standards 独立复审

受检提交固定为 `9fa528cd534e2a8c8319d4eb3091e5013f62cd54`；基线及实查 merge-base 为 `ffacfbff386377b317348b572ff3073521a0e67e`。初始工作树 clean，三点 diff 非空（10 文件），提交列表仅 `9fa528c fix(editor): bind empty paragraph edits to source gaps`。

## 结论

**Hard：0；judgement：0。** 仅审书面标准，不作 Spec 裁定；未把 Fowler 启发式当作硬规则，也未审工具可强制的格式项。

- `empty-paragraph-edit.ts:9–89`、`block-editing.ts` 两处键绑定与旧分支删除、`source-transaction.ts` planner 接入/旧分支删除：共享操作识别完整目标文档与选区，局部换行补丁绑定新插入点；键盘组合期返回 false。未见违反 [AGENTS.md:8](../../AGENTS.md)、[ADR-0004:6–10](../adr/0004-source-authoritative-editing.md) 或 [V1:13、18](../design/source-authority-production-v1.md) 的新增路径。
- `source-authority.ts:1419–1446`：仅在带绑定落点且映射跨越删除时退休空 paragraph 内旧锚点；继续保留其他映射和校验。未见破坏 [GLOSSARY.md:7–12](../../GLOSSARY.md) 的原文权威、位置依据定义。
- runtime 新文件及 Native 新用例/计数 hunk：新增断言覆盖字节、连续退格、历史和篡改拒绝；原测试未删除。符合 AGENTS.md:7 与 V1:31–35 的相关要求。真实 Native 是否通过须另验。
- `project.yml` build 号及两份诊断/任务文档：未新增依赖、网络或权限；现有材料明确未安装、未作物理验收，未见 AGENTS.md:6、9 的书面冲突。

已逐 hunk 对照全部 12 项 Fowler smell。操作识别与 source proof 重复核对空段落属于同一契约的两个阶段，现无足够依据报告 possible Duplicated Code；其余亦未发现值得提出的 judgement。此结论不证明所有输入组合无缺陷。

## 本人实跑与边界

- `git status --short`、`git rev-parse HEAD`、`git merge-base <base> <head>`、`git log <base>..<head> --oneline` 与 `git diff <base>...<head>`：身份/范围符合上述记录。
- `rg --files -g 'AGENTS.md' -g 'CODING_STANDARDS.md' -g 'CONTRIBUTING.md'`：仅发现根 AGENTS.md；同时读取 GLOSSARY、ADR-0004 及明确适用的 V1 契约。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-empty-backspace-runtime.test.ts`：首次缺 ignored `RENDERER_NOTICES.txt`，收集失败、0 test；离线 `node editor/scripts/prepare-renderers.mjs` 后同命令 **15/15 通过**。这是 synthetic jsdom runtime 检查。原始日志保留 `artifacts/INK-REV-210/standards-{runtime,prepare,runtime-prepared}.log`。
- 未运行 lint、build、完整 editor suite、WK/Native、App/UI 或物理 IME；作者所述 1095/Native 不计作本人证据。未访问用户当前正文或恢复数据。

## 追加限定复核：03715e9

首稿保持原样；本节只审固定增量 `git diff 9fa528cd534e2a8c8319d4eb3091e5013f62cd54..03715e9cad05ed90a0f541b45826915676bf4135`。固定 `git show` 与提交列表确认唯一追加提交为 `fix(editor): retain original whitespace after EOF edits`；增量 5 文件、40 增/7 删。复核前 HEAD 为首稿文档提交 `26983f4`，clean；产品上下文均从固定 `git show <SHA>:<path>` 读取。原始增量保留 `artifacts/INK-REV-210/standards-followup-03715e9.diff`。

**追加 Standards：hard 0，judgement 0。**

- `empty-paragraph-edit.ts` 三个 guard hunk：允许保留区含原有 space/tab/EOL，实际删除仍由两 EOL 的 separator 正则确定；未对保留区 trim 或重序列化。完整 doc/Selection 证明未变化。未见违反 AGENTS.md:8、ADR-0004:6/10、V1:7/13/18 的新增路径。
- `source-transaction.ts` listJoinPlan hunk：空白尾部识别扩展后仍要求空列表项、EOF 空 paragraph 与完整剩余文档证明；`matchingStructuralPlan` 仅接收一个 lift candidate，所含唯一 patch 的 `from + insert.length` 确定落点。未见违反 GLOSSARY.md:12 的位置依据及 V1:18 的 EOF 边界契约。
- runtime 追加 5 项含 space/tab、BOM/CRLF 的原文字节 oracle，Native 扩展 fixture 并将原有尾部放在新增 EOL 之后；旧测试和最终 Save As 字节 oracle 保留。任务追加说明独立验收边界，未见 AGENTS.md:6/7 的书面冲突。Fowler 12 项未发现足够依据提出 possible smell；书面契约优先，忽略工具强制项。

本人本次仅实跑固定 `git show`、`git diff`、`git log`、`git status` 及首稿前缀断言/文档 diff-check；没有重跑 runtime、lint、build、全套、Native/WK、GUI 或物理 IME。root 1100 项通过不属于本人证据。首稿 15 项仅适用于原受检 SHA，不转移为新提交测试结果。此节不裁定 Spec P1 是否关闭，也不改变首稿的历史结论与验证边界。
