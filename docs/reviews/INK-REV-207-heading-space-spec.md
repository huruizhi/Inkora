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

## 2026-11-14 P1补正限定复验（固定afa00ca）

本节仅追加，前文首稿不重写。固定比较：`git diff 6d373122a245bee219fb7523fef2e9fd31e357b2...afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe`，merge-base等于6d37312，三点diff非空。中间两提交只整合206/207报告，产品补正为 `afa00ca fix(editor): retain visible whitespace in heading delimiters`，只有heading-start-edit与第7公开测试。初始HEAD9353897且clean。

### 核心裁定（少于400词）

(a) missing/partial：本补正未发现新增缺失；原P1在本次公开Session有界范围内关闭。最小 `# a #` 接受空格后的raw `# a  #`，取消格式准确得到 `a `；saveMemory成功且当前原文、同字节新会话原文仍为 `a `。修正前6d同断言仍真实失败为 `a`。这满足源任务122行“不会删除可见空格”及production-v1:13原文/投影原子更新要求。

(b) scope creep：未发现。新增区间扣除仅限unformat的语法prefix/suffix，不修改会话、历史或保存守卫。

(c) implemented wrong：未发现新增问题。`heading-start-edit.ts:121–146` 将语法待删区间与ledger可见source span相交，仅保留其中空格/tab；cursor取max处理重叠，删除仍限于原语法区间，首尾/marks/Setext/保护块邻接未观察到新增丢字节。canonical共享operation语法证明、完整editable目标doc/Selection绑定保留；列表/引用/邻段重解释和篡改目标仍原子拒绝。

不能把新会话canonical PM不显示尾空白误判为本轮丢字节：本轮保存的是含空格的精确currentRaw，重开currentRaw也包含空格；原P1则是currentRaw本身先被删成无空格。这一裁定不代表Native、物理输入或整体任务交付已通过。

### 本人复验命令与结果

只用固定Git导出代码，未读取根动态产品文件；两端editor的121个原文件分别逐一核对Git blob相等。新增测试仅置于ignored artifacts，不修改产品或有效测试。

| 命令 | 本人结果 |
| --- | --- |
| `pnpm --dir artifacts/INK-REV-207/postfix/new/editor exec vitest run src/heading-edit-contract.test.ts` | exit0，7/7 |
| `pnpm --dir artifacts/INK-REV-207/postfix/prior/editor exec vitest run src/review-contract.test.ts` | exit1，6通过/第7项raw字节失败 |
| `artifacts/INK-REV-207/postfix/new/editor/node_modules/.bin/vitest run --root . --config artifacts/INK-REV-207/postfix/probe.config.mjs` | exit0，原27/27 |
| 同上入口、配置改 `minimal.config.mjs` | exit0，原最小2/2；加 `REVIEW_PRIOR=1` 为exit1，1通过/原P1字节失败 |
| 同上入口、配置改 `ranges.config.mjs` | exit0，44/44；加 `REVIEW_PRIOR=1` 为exit1，32通过/12个可见空格字节差异 |
| 同上入口、配置改 `markers.config.mjs` | 新/旧均exit0，8/8 |

额外44项由40组关闭标记前/后单空格、多空格、tab混合，3组prefix语法扩展及1组连续输入拒绝构成，覆盖strong、BOM/CRLF、既有suffix空白、邻接只读代码块；成功操作核精确raw/重开raw、PM和原文选区、marks、UndoRedo/save。40组插入本身的新旧公开trace逐项完全相同：28接受、12继承拒绝；其中16组suffix多空格/tab在插入后已被既有规则视为语法扩展、PM无新增正文，不能误当可见字节。12组真正可见空格原P1案例修正后全部保真。直接可见tab进入delimiter的插入路径在该矩阵中未成功，因此不能宣称已从公开输入单独覆盖该分支；tab保留guard仅静态核对。

8组marker对照覆盖closing前后输入`#`、` #`、`x`、tab加hash，按真实PM状态锁定正文与语法的精确预期，新旧均一致。原27项继续覆盖Setext、任务尾空格、完整双向Selection/doc篡改拒绝、列表/引用/邻接合并拒绝及保存阻断。noncanonical缺ledger、visible非空白恰好重叠语法的防御分支只静态确认，未通过private或构造假ledger伪称动态覆盖。

初轮矩阵将Undo后的canRedo与Undo前强求相同、以及把suffix全部插入当可见正文的oracle错误均留存校准日志；据公开状态修正期望后再跑，未当产品失败或删除有效测试。所有输入trace、测试、旧新原始日志保留 `artifacts/INK-REV-207/postfix/`，索引evidence.json SHA-256为 `c396ae59d17a819274a161aa0d9697d5e4c7c85be36eaf32d2705788df163595`。

首稿报告4867字节（SHA-256 `1ed930d45fe4265067d2a26ca8f9eb660f8bc58d77ace994b138b933a39cda2e`）、任务单1580字节（`0773b8feb24baf9cc930148005c955e7718a7dd5c6e542f23ab69e28c91c238b`）与9353897逐字节核对，本次仍为修改后文件的完整prefix。

本轮仅公开Session。未跑全量/Native/Xcode/GUI/构建/CI/安装，也未操作App或用户文档；不把作者7项/Native结果当本人实跑。作者Native35焦点夹具、全量1080与最终CI仍待独立结算，真实用户v2/build15失败现场不因本报告转为通过。仅移除本轮自建两处依赖链接，冻结source、原始证据与worktree继续保留待两层备份。
