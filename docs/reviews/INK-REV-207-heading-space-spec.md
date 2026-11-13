# INK-REV-207：标题已接受空格补正的 Spec 审查

固定比较：`git diff b7cdd790a702dc38c0709035098c986a7252360f...6d373122a245bee219fb7523fef2e9fd31e357b2`。两端已解析，merge-base 等于 b7cdd790，非空 diff；范围只有 `6d37312 fix(editor): preserve accepted spaces when unformatting headings`。独立 worktree 初始 clean。本报告只审不修。

## 核心结论（少于400词）

(a) missing/partial：除下述具体行为错误外未发现新增缺失。真实输入/保存关闭验收仍是任务已披露的待办，不作为已完成交付。

(b) scope creep：未发现。build16 为候选区分；Native测试及harness项数同步属于反馈回归。

(c) implemented wrong：**[P1] 关闭 hash 前已接受的可见空格会从当前原文丢失，却仍允许保存。** `docs/tasks/INK-STAB-203.md:122` 明确要求“不会删除可见空格”，`GLOSSARY.md:7` 要求当前原文包含已接受编辑及空白，`docs/design/source-authority-production-v1.md:13` 要求原文、投影、位置和历史原子更新；ADR-0004:6、10 禁止合法空格永久缓冲及无审计trim。

对应新增 hunk `editor/src/heading-start-edit.ts:125–128`：证明仅比较 `parse(candidate)` 与在 `parse(source)` 重放的目标。两边都看不到已接受可见空格，因而放过既有 `sourceParts` 的 closing suffix 删除（70–71、123行）。最小公开复现：打开 `# a #` → `setRawSelection(3)` → `dispatch(insertText(' '))` 得 `# a  #` → `setRawSelection(2)` → Backspace。新实现接受后 `currentRaw === 'a'`、PM text 为 `'a '`，`saveEligible` 和 `saveMemory()` 都为 true；按该原文重开只剩 `'a'`。旧实现同操作拒绝且完整状态保持、保存阻断。因此是本 hunk 新放行的有损提交，而非单纯旧边界仍不支持。带 strong 的 `# **a** z ##` 同样失败。应保留已接受空格的原文字节与位置依据，再证明源语法变化；不能只以 canonical parse 相等批准此 patch。

## 本人运行证据

所有命令在 `.worktrees/INK-REV-207` 执行；不引用作者1079项、Native35项或根日志充当本人实跑。

| 实际命令 | 结果 |
| --- | --- |
| `pnpm --dir editor exec vitest run src/heading-edit-contract.test.ts` | exit 0，6/6通过 |
| `pnpm --dir artifacts/INK-REV-207/old/editor exec vitest run src/review-contract.test.ts` | exit 1，5通过/1失败，新增空格用例真实 replaceAround 红 |
| `pnpm --dir editor exec vitest run --root .. --config artifacts/INK-REV-207/probe.config.mjs` | exit 1，26通过/1失败：closing hash 可见空格丢失 |
| 上一命令加 `REVIEW_OLD=1` | exit 1，17通过/10失败；10组空格案例均为旧 replaceAround 拒绝 |
| `pnpm --dir editor exec vitest run --root .. --config artifacts/INK-REV-207/minimal.config.mjs` | exit 1，1通过/1失败；`# a #` 最小丢字节案例 |
| 上一命令加 `REVIEW_OLD=1` | exit 0，2/2通过；明确要求旧版原子拒绝及同字节重开可取消格式 |

27项有界探查：10种输入各含无空格/已接受空格两组，覆盖标题自身、别处普通段落/任务项、BOM、CRLF、strong、ATX关闭hash、Setext；5项源码重解释拒绝（列表、引用、邻接段落合并）；2项篡改目标完整Selection/文档拒绝。成功案例检查原文字节、完整PM/原文选区、marks、UndoRedo、保存资格；拒绝案例检查原文/doc/双向Selection/原文选区/status原子保持及保存阻断。范围内未发现结构拒绝或完整目标绑定被整体取消，但这不能抵消P1。

旧source使用 `git archive b7cdd790a702dc38c0709035098c986a7252360f editor/src editor/package.json editor/vite.config.ts` 冻结；121个原文件逐一与Git blob核对相等。仅额外复制当前六项测试为 review-contract.test.ts；未改旧产品来造红。依赖均链接根现有 node_modules，无安装。初轮probe的路径、任务尾选择、CRLF/Setext预期位置校准日志独立保留，未算产品失败；最终oracle按实际插入位置保留可见空格。

原始测试、冻结source、日志、SHA索引保留 ignored `artifacts/INK-REV-207/`；`evidence.json` SHA-256：`615fa7d9f12366ccc7b67581dd601c82393efef6fb5199f171b360b76077440f`。

## 证据层级与限制

仅使用公开 `SourceAuthoritySession`、已有键盘命令、真实PM事务；无private读取/测试getter/产品修改。已全文阅读源任务，并核对GLOSSARY、ADR-0004、editor-session及production-v1契约。合成公开Session不证明WK、真实IME、光标paint、Native磁盘保存/关闭或新App资源。未跑全量、Native、Xcode、构建、GUI、安装；本报告不能宣告用户v2/build15失败已修复。正式build14、新build16候选及旧失败现场均未触碰。原始证据/worktree保留待两层备份，仅解除自建依赖链接。
