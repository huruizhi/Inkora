# INK-REV-206：标题取消格式空格补正 Standards 独立审查

## 固定范围

基线 `b7cdd790a702dc38c0709035098c986a7252360f`；受检 `6d373122a245bee219fb7523fef2e9fd31e357b2`。
唯一提交：`6d37312 fix(editor): preserve accepted spaces when unformatting headings`。
固定命令：

```sh
git diff b7cdd790a702dc38c0709035098c986a7252360f...6d373122a245bee219fb7523fef2e9fd31e357b2
```

审前独立 worktree 干净；两个 ref 有效，merge-base 等于基线；diff 非空，共7文件、179增行/4删行。任务语境读自 `docs/tasks/INK-STAB-203.md` 末节：v2/build15物理验收失败，新候选build16尚不能等同交付。本报告只给 Standards 判断，不替代 Spec 或物理验收。

全文读取标准：`AGENTS.md`、`GLOSSARY.md`、`docs/adr/0001-tech-stack.md`、`docs/adr/0003-project-and-bridge.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/testing.md`、`docs/editor-session.md`、`docs/design/source-authority-production-v1.md`。已用文件搜索及 `git ls-files` 搜索 CODING_STANDARDS/CONTRIBUTING，均不存在；不重复报告工具强制项。

## Standards 核心结论（≤400词）

已证书面硬违规0项；有证据支持的 Fowler possible smell 0项。

`editor/src/heading-start-edit.ts:125-128` 将源语法证明改为 `operation(EditorState.create({ doc: parse(source).doc }), 'Backspace')`，仍要求 unformat 类型及候选 parse 与重放文档相等；未新增 trim、整篇序列化或无条件重解析放行。与 ADR-0004 的原文权威、已接受空格保留及禁止无条件放行相符。既有 `:99-107` 的 editable doc/Selection 检查及 `:83-90` 的目标文档身份/Selection 绑定仍在，不由源码证明替代（`docs/editor-session.md` 的不可变文档身份与失败保留契约）。

新增公开测试 `heading-edit-contract.test.ts:138-176` 包括实际已接受空格、BOM/CRLF、撤销重做与不可证明时保存阻断；有效旧测试未删除。Native hunk 新增真实 Save As/磁盘字节及 prepareForClose 路径，harness 精确计数34→35与新增一项一致。项目build15→16，不改依赖、Bridge、权限或网络边界，符合 ADR-0001/0003 及 V1 接缝约束。未重新生成Xcode工程或运行构建，不能据此声称构建门槛通过。

任务/证据 hunk 明确区分作者1079项、旧包Native红、待重建绿及物理失败，没有将尚未验收的候选说成交付；符合 AGENTS.md 的实测回报要求。本人只独立运行下述6项，未复核作者全量或Native结果。

## Fowler baseline逐项核查

以下均为判断性 heuristic；只有存在具体证据才报 possible，仓库明确规则优先。本表中的“未报”不构成所有历史代码无异味的断言。

| Heuristic → 常见修正 | 本次 hunk 证据及判断 |
| --- | --- |
| Mysterious Name → 重命名 | `sourceEdit` 区分源码重放与既有 editable `edit`，用途明确；未报。 |
| Duplicated Code → 提取 | `:127` 复用同一 `operation`，没有再复制unformat结构规则；未报。 |
| Feature Envy → 移动职责 | 语法证明仍在既有标题识别/patch/placement模块内，未新增跨对象数据主导逻辑；未报。 |
| Data Clumps → 领域类型 | 新增一个局部 `sourceEdit`，未形成反复同行的字段组；Native save状态为单一测试局部生命周期；未报。 |
| Primitive Obsession → 小类型 | 复用已有 Key/Operation 判别联合及NativePatch，未新增承担领域的原始值约定；未报。 |
| Repeated Switches → 多态/映射 | 新增单次 `kind === 'unformat'` 是重放证明结果检查，未复制分支树；未报。 |
| Shotgun Surgery → 聚合职责 | 7文件分别为唯一产品证明、针对性测试/harness、候选版本及证据任务记载，未见同一算法散改多处；未报。 |
| Divergent Change → 拆分 | 新增行共同围绕已接受空格取消标题格式，无不相关变更原因；未报。 |
| Speculative Generality → 删除/内联 | 只加局部重放，无新抽象、hook或额外参数；未报。 |
| Message Chains → 封装导航 | `sourceEdit.transaction.doc` 是既有Operation结果读取；无需要隐藏的长对象导航；未报。 |
| Middle Man → 删除转发 | 未新增仅转发函数；`operation` 执行共享编辑识别/构造，源码重放是实际复用；未报。 |
| Refused Bequest → 组合 | 未新增继承关系或忽略继承契约；XCTest子类新增常规测试；未报。 |

## 本人实际验证与限制

- `pnpm --dir editor exec vitest run src/heading-edit-contract.test.ts`：退出0，1文件6项通过；日志 `artifacts/INK-REV-206/heading-edit-contract.log`。
- 固定三点 diff 的 `git diff --check`：退出0，无输出；日志 `artifacts/INK-REV-206/diff-check.log`。
- Python逐文件读受检Git blob并核对worktree：157份受版本控制的editor文件全部相同；清单 `artifacts/INK-REV-206/editor-frozen.json`。固定diff保留 `artifacts/INK-REV-206/fixed.diff`。
- 测试临时借用根仓库 `editor/node_modules` symlink，未安装依赖；仅本人链接已unlink。
- 未跑全量、Native、GUI、Xcode、构建、CI、安装或物理IME；未验证build16包资源。文档中的作者1079项不是本人结果。Native两次100ms等待只作静态阅读，当前没有本人重复运行的稳定性证据。

未完成：限定Standards审查内无；构建/Native绿、精确HEAD CI与新候选真实验收由主任务继续结算。风险：本次有界模型测试不能证明实际WK焦点、IME、保存/关闭及资源打包正确。worktree与ignored原始产物保留待两层备份，不清理。

## 2026-11-14 限定追加：固定afa00ca可见空白语法区间补正

本节仅追加，前述固定6d37312首稿保持原始字节；该首稿结论仍只针对原受检diff，不得作为后来发现P1不存在的证明。本次只核 Standards，不代判207的Spec finding关闭。

追加固定基线 `6d373122a245bee219fb7523fef2e9fd31e357b2`，新受检 `afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe`。ref有效、merge-base等于追加基线、diff非空；中间两提交只整合206/207首稿，唯一新增产品提交 `afa00ca fix(editor): retain visible whitespace in heading delimiters`。固定命令：

```sh
git diff 6d373122a245bee219fb7523fef2e9fd31e357b2...afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe
```

8份全文标准相对此次基线均无修改，沿用已读原文。全部受检来源为Git固定diff及目标Git archive导出；未读取根工作区正在校准的Native夹具。本次diff共8文件，产品仅 `heading-start-edit.ts` 及公开测试文件；其他为已整合审查文档、任务记录和证据。

### Standards追加核心（≤400词）

新增已证硬违规0项；新增有证据支持的Fowler possible 0项。

`heading-start-edit.ts:121-143` 读取当前ledger可见原文span，与prefix/suffix语法区间求交，只将其间隙形成删除patch。`if (!/^[\t ]*$/.test(source.slice(from, to))) return null` 保守拒绝重叠的非空白可见语法；不把原文或投影统一trim。缺ledger且source parse与当前doc不一致则拒绝。此证据对应 ADR-0004第6/10行的已接受空白、禁止无审计trim与无法证明时保留意图规则，及GLOSSARY“当前原文”包含已接受空白的定义，未见新hunk违反。

原共享operation的canonical语法证明保留，只将parse结果局部复用为 `sourceDoc`；完整editable文档/Selection检查与placement文档身份绑定未修改，符合 `docs/editor-session.md` 的位置依据和旧事务拒绝契约。没有引入新依赖、网络、Bridge、权限或测试旁路，符合V1接缝及AGENTS约束。

第7测试 `heading-edit-contract.test.ts:178-202` 增加closing hash前后插入、strong、原文字节、UndoRedo/save与重开字节检查，并保留prefix语法对照；未删除有效旧测试。任务与证据明确P1独立关闭、Native夹具校准、全回归与物理验收待结算，未将作者结果等同本人验证。其功能覆盖是否足以关闭P1由Spec独立结论决定。

### 追加12项heuristic核查

各项仍属判断性possible而非硬规则，repo标准优先；本轮不重复报告工具强制项。

| Heuristic → 常见修正 | 追加hunk证据及判断 |
| --- | --- |
| Mysterious Name → 重命名 | `sourceDoc/syntax/visible/cursor` 对应parse结果、语法区间、相交可见span和扫描端点，未报。 |
| Duplicated Code → 提取 | prefix/suffix复用同一差集扫描；operation复用保留，未复制判断树，未报。 |
| Feature Envy → 移动职责 | ledger只是提供通用span，标题模块负责本地删除意图；移动至ledger反会引入标题编辑职责，未报。 |
| Data Clumps → 领域类型 | 区间仍用已有NativePatch，未新增反复同行参数组，未报。 |
| Primitive Obsession → 小类型 | source坐标仍遵循既有NativePatch/LedgerSpan，空白正则是明确语法约束，未报。 |
| Repeated Switches → 多态/映射 | 未新增同类重复分支树；循环扫描同一类区间，未报。 |
| Shotgun Surgery → 聚合 | 产品只在标题证明与对应契约测试修改，文档用于证据记录，未报。 |
| Divergent Change → 拆分 | 新增分支均处理标题语法与可见字节冲突，无无关职责，未报。 |
| Speculative Generality → 删除/内联 | 直接局部算法，无新hook或为未来预留抽象，未报。 |
| Message Chains → 封装 | `ledger?.spans.filter(...).sort(...)` 是本地集合变换，不依赖长对象导航，未报。 |
| Middle Man → 删除转发 | 无新增转发函数或类，未报。 |
| Refused Bequest → 组合 | 无新增继承或违背继承契约，未报。 |

### 本人实际追加验证

- Git archive目标editor在ignored `artifacts/INK-REV-206/visible-syntax/fixed/` 导出，Python核157份editor文件逐字等于目标Git blob，全数相同；`export-check.json`保留结果。
- `pnpm --dir artifacts/INK-REV-206/visible-syntax/fixed/editor exec vitest run src/heading-edit-contract.test.ts`：退出0，1文件7项通过；原始 `heading-edit-contract.log` 保留。
- 固定追加diff的 `git diff --check`：退出0，无输出；`diff-check.log`保留；完整追加diff为 `fixed.diff`。
- 首稿report/task按 `0f12625f0a9c592426521b72b1271a9f9cb4c755` Git blob验证为追加后文件的逐字prefix，且首稿Git blob与新受检整合版本相同；原始核对清单保留 `prefix-check.json`。
- 仅对导出目录自建根node_modules借用链接，测试后unlink；未安装依赖。未运行全量、Native、构建、GUI、CI、安装或真实IME，未把作者7项或旧1079项作为本人结果。

限定追加审查内无未完成事项。风险与外部门槛：上述7项不能证明真实WK焦点、保存关闭、候选资源和IME稳定；207独立P1复验、主任务最终资源/回归/CI/物理验收仍需结算。worktree、固定导出及原始产物保留待两层备份。

## 2026-11-14 最终Native夹具限定静态收口

固定 `afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe...16860d7fbcfe4370f2dc6dcbc7ea969dfbe143cf`；refs有效、merge-base=afa00ca、diff非空。通过固定 `git diff` 和 `git show 16860d7:tests/InkoraTests/WritingInteractionHostlessTests.swift` 静态核查；editor/app/project.yml产品diff为空。只新增夹具变更及记录/已整合审查，未读根动态源码，未重新测试。

新增Standards硬违规0项、Fowler possible0项。Native hunk `:438-457` 删除本用例额外的 `makeFirstResponder`，仍通过原 `focus` 建立DOM焦点；新增公开 `getSelection()` collapsed、focusOffset=0及heading归属断言，随后才发Backspace。实际空格输入、原文snapshot、标题消失、真实NSDocument Save As、回调无错误、精确磁盘bytes及withEditor的prepareForClose均保持，未删除或绕过有效测试，符合AGENTS与docs/testing.md；未改内容/Selection生产边界。12项baseline沿既有定义均已核：命名清楚；没有重复算法、他者职责迁移、字段组、原始值领域约定、重复分支树、散改/无关职责、新抽象、长对象导航、转发层或继承变更，因此不报 Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。heuristic仍仅为判断性possible，不升级硬规则。

本人仅静态核查及固定diff检查（退出0），没有新增测试/Native/构建/GUI/CI结果。记录中的同一35项binary旧资源34绿新1报replaceAround、新afa资源35绿及1080全量为作者证据，未经本人重跑；不据此宣称物理验收。固定源码/差异保留ignored `artifacts/INK-REV-206/native-static/`；本节追加前两文档全体字节按13437ca验证prefix，并核与16860d7整合blob相同，结果在 `prefix-check.json`。仅追加原两文档，无自建依赖链接；限定审查无未完成，主任务精确HEAD CI与用户物理旅程仍独立结算，worktree/产物继续保留。
