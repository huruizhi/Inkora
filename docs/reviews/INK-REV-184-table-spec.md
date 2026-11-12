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
