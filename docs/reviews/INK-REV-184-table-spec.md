# INK-REV-184 表格 Spec 独立审查

## 固定输入

- 产品冻结：`efa551708d824a2c98a808d18faf94ce05ffebd4`；基线：`16d0a6282f60b1357780aa7b964746be7e62b9bd`。
- 固定比较：`git diff 16d0a6282f60b1357780aa7b964746be7e62b9bd...efa551708d824a2c98a808d18faf94ce05ffebd4`，提交仅 `2f6cccf`、`efa5517`；创建worktree时clean，14文件非空diff。
- 需求：用户指定审计 `../INK-AUDIT-179/docs/design/typora-homepage-gap-audit.md` 的首批范围 TP-TBL-02～06；正式规格 [typora-table-parity.md](../design/typora-table-parity.md)，实施任务 [INK-UX-182](../tasks/INK-UX-182.md)。审计仅用于需求来源，不作为当前实现通过证据。
- 本报告只审 Spec；没有改产品，没有重新部署、安装依赖或联网核读。

## 核心发现（四项 P2）

1. **部分实现：合法无管道数据行不能调整规模。** 规格L8要求数字规模，L18说“可选首尾管道不统一重排”。`source-transaction.ts:759–761` 在没有结构管道时直接拒绝。`| A |\n| --- |\none\ntwo` 由正式runtime渲染3行，但resize至1列4行返回false。用户已有合法表格因此无法扩行；并非要求新语法。
2. **部分实现：列表首行表格不能重排列。** 规格L9要求移动完整列，L18要求“保留…容器前缀”。`source-transaction.ts:762–764` 不识别首行 `- `。`- | A | C | B |` 加两个缩进续行能够正常渲染，移动列2→1却被原子拒绝。与根审查独立反例重复，根正在限定补正。
3. **实现错误：行移动连容器前缀一起搬。** 规格L18“保留…容器前缀”，`source-transaction.ts:826–829` 却重排完整物理行。引用行前缀分别为 `> `、`>  ` 时，行2→1成功但目的位置前缀对换。应只移动行载荷并保留目的前缀/EOL。
4. **实现错误：缩行改写存活行换行。** 规格L18“各物理位置EOL”及“缩行删除该行完整原文”。`source-transaction.ts:795–797,855–857` 排除原末行EOL；缩行后将它嫁接到存活末行。两数据行EOL分别CRLF、LF时，确认缩至一数据行把存活行CRLF改成LF。

未发现本轮范围外的产品行为。原子拒绝避免了前两项的内容损坏，但功能仍未达到规格。冻结结论保留；后续fix不反写本段。

## 独立运行证据

- `node scripts/prepare-renderers.mjs`（editor目录）：退出0，只准备本地离线生成资源。
- `node_modules/.bin/vitest run src/table-parity-runtime.test.ts`（editor目录）：退出0，16/16通过；覆盖参数建表、隐藏尾格/缺格、嵌套缩进、取消、缩减确认、历史和合成拖放。
- `editor/node_modules/.bin/vitest run editor/src/table-spec-review.test.ts`：退出1，四个规格反例全部red；前三项为拒绝/字节断言失败，第四项为存活行EOL断言失败。日志 `artifacts/INK-REV-184/frozen-probe.log`，原探针归档 [INK-REV-184-table-spec.probe.ts](INK-REV-184-table-spec.probe.ts)，复现时复制到 `editor/src/table-spec-review.test.ts`，不改产品或有效测试。
- 探针早期遇到截取setup语法错误、未准备renderer资源，均已纠正；这些运行不作为产品失败依据。
- 自建依赖软链仅指向主仓锁定 `editor/node_modules`，结束仅unlink；没有安装新依赖。

## 核读与未验边界

静态核读：异步对话框确认通过runtime `onChange(document)`进入main的`recordRuntimeChange`，不在原Native命令执行栈中，沿用文档revision发布；未发现另加发布。网格预览改变会清空缩减确认；提交前校验当前EditorState；拖放使用最后预览target且只在drop调用命令。以上静态结论不代替真实Native或物理事件验收。

未独立运行main/Bridge、全量测试、Native/WK、App构建或GUI；未触碰用户文档。物理鼠标拖放、真实IME/settling、屏幕paint、VoiceOver和macOS14实机均未验。

根代理通报的Native 900/360布局、滚动与3/3结果属于他方证据，未计入本报告独立运行。后续修复另附固定SHA复验，不能将他方结果冒称本审查自跑。

## 限定补正复验（追加，2026-11-12）

固定补正 `8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`，比较 `git diff efa551708d824a2c98a808d18faf94ce05ffebd4...8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`，仅一个产品提交 `fix(tables): preserve source boundaries and dialog composition`。差异已导出 `artifacts/INK-REV-184/fix-8bb27ad.diff`。本追加不改变上述冻结审查四项发现。

复验方法：保持报告分支归属，临时通过固定 `git show` 导出 `source-transaction.ts`、`table-commands.ts`、`table-editing.ts`、`table-interactions.ts`、`table-size-dialog.ts` 五个相关产品文件；其余源码维持冻结efa版本。直接复制原四项探针且不改断言，新增一个EOF无末尾换行负控（含Undo/Redo）。临时源码已restore，新导出文件及依赖软链仅unlink；没有cherry-pick产品提交。

| 固定输入 | 自跑命令 | 结果 |
| --- | --- | --- |
| efa冻结 | `editor/node_modules/.bin/vitest run editor/src/table-spec-review.test.ts` | 退出1，原四项全部red；EOF负控1/1通过 |
| 8bb27ad相关源码 | 同上 | 退出0，5/5通过 |

四项分别确认：合法无管道数据行可扩行且保留旧行字节；列表标记首行可重排列且前缀保留；引用数据行重排保留目的前缀；有后续正文的缩行保留存活末行CRLF。EOF负控确认删除末行后仍无最终换行，并且Undo恢复完整旧原文、Redo恢复结果。四项在该固定补正上均已解决。

证据：`artifacts/INK-REV-184/frozen-probe-with-eof.log`、`fix-8bb27ad-probe.log`、`fix-probe-with-eof.ts`、`fix-source-files.txt`。先前 `frozen-probe.log` 保留；没有改有效测试或将red改成宽松断言。未扩大全量或其他专项。

核读了规格新增的“原文件在表格末尾EOF没有换行时继续保留无末尾换行”规则，EOF负控与之相符。此次没有独立复验另一个审查轴提出的对话框composition或循环依赖，也没有自跑作者所报21项、68项、Native结果；本追加只关闭原Spec四项及相邻EOF边界，不扩展整体完成结论。物理IME、鼠标、Native/WK、保存重开、paint等未验边界继续保留。

## 必要CI集成补正 Spec 审查追加（INK-FIX-185）

本追加只审固定 `ad4f22f40ae434d325fcec8a53f60a98bf502eba...bbd80f7e07e07eef71e1de239c214531cda964ba`，一个提交 `fix(editor): preserve idle snapshot responder and caret`。不重审表格原稿，不将继承的标题开头split能力计作新增表格需求。差异导出至 `artifacts/INK-REV-184/fix-bbd80f7.diff`。本次保持报告worktree产品源码不动。

规格源为固定补正中的 `docs/tasks/INK-FIX-185.md` 及 `AGENTS.md` 的“不得破坏中文输入法 composition、光标、选区、撤销重做”。185任务要求：“普通无候选快照不动Native响应者”；“client不可获取时保留旧保守提交路径”。其起因是表格集成CI暴露的焦点回跳，属于原编辑保护约束内的必要集成修复。

**核心结论：missing/partial、scope creep、implemented wrong 均未发现新增问题。** `EditorViewController.requestSnapshot` 对`hasMarkedText()==false`仅跳过清空/恢复Native响应者；版本快照仍通过同一`bridge.requestVersionedSnapshot`及原completion发布。`true`及client不可获取（`?? true`）保持原commit/restore分支，未放宽正文事务或保存资格。修改范围与上述任务吻合。新增回归使用真实NSWindow子类转发公开`makeFirstResponder`，不替换实际实现；断言空闲client、清焦次数不增加、响应者身份不变及DOM反向选区[2,0]，与保光标规格直接对应。既有21项未删除；专项计数21→22对应新增一项。

本次**独立执行仅为固定diff及证据完整性核验**：两份固定JSON的`sha256(output)`均与内嵌摘要一致，检查退出0，见 `artifacts/INK-REV-184/fix-bbd80f7-evidence-check.txt`。借用作者证据分别为 `docs/evidence/INK-FIX-185/focus-red.log.json`（新增焦点回归修前1/1 red）与 `native-tests.log.json`（写作专项22/22 green）；未将它们写成独立自跑测试。首版夹具element offset误判不作为产品缺陷。

未独立运行Native、全量、App或UI，未安装依赖。物理IME及系统候选存在分支未验；该分支仅以固定代码差异确认旧行为保持。不能由22项专项推导完整Native或最终精确HEAD CI通过，整合后的最终CI仍由根任务验收。
