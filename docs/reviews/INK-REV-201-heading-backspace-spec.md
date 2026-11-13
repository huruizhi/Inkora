# INK-REV-201：标题行首退格 Spec 审查（固定首稿）

受审 HEAD：`09af68a827f7eca1be9568c2abcaa43efe0b8dcb`；base/merge-base：`4e82ea0ac72f27ad5bf1b9ccf2145d87060cfd6b`。本稿冻结，不以补正后的结果覆盖。

## 核心结论

**Request changes：1 项 P1。**

(a) Missing/partial：本次未发现独立的功能漏项；已有正常退格、marks、ATX/Setext、重复标题空段与历史路径通过本人定向探针。证据不等于完整体验验收。

(b) Scope creep：未发现。build14及原生计数更新已列入任务文件第31–34行。

(c) Implemented wrong：**P1：完整 doc 相等没有证明目标选区，接受虚假位置依据后，后续输入写到另一段。** 新增 `editor/src/source-transaction.ts:720–732` 仅比较 join 后 doc，再把接合点 `sourceCaret` 绑定到任意 `tr.selection.head`；首块/空段分支有同类缺口。违反任务规格 `docs/tasks/INK-FIX-199.md:8–12` 的有界起点退格及未知事务边界、`AGENTS.md:8` 的光标/选区保护和 ADR-0004 第6、10行的位置原子更新/无法证明须拒绝要求。

准确层级为公开 runtime 的真实 ProseMirror `view.dispatch`，并非物理键盘路径：原文 `上文\n\n# 地方\n\n后文`，先将选区设为PM5，再派发 `state.tr.join(4).setSelection(TextSelection.create(tr.doc,8))`。受审版接受并保持可视caret8，但原文caret被记为2；随后 `insertText('X')` 得到 `上文X地方\n\n后文`，预期为 `上文地方\n\n后X文`，且 `snapshotText()` 仍返回 `ok:true`。相同事务在冻结基线被拒绝，故非继承问题。建议目标doc命中后同时证明命令映射出的选区；不符即原子拒绝，不能落回通用放行。

## 本人验证与边界

- 先确认主工作区clean；固定diff非空、merge-base等于base、提交标题及完整SHA吻合。只审上述固定区间。
- 自有夹具：`artifacts/INK-REV-201/probe.test.ts`（公共会话），`runtime.test.ts`（公共runtime/DOM），`baseline.test.ts`（git archive冻结base）。均保留ignored原件及日志。
- 命令：`./.tools/node_modules/.bin/pnpm --dir editor exec vitest run --root .. --config editor/vite.config.ts artifacts/INK-REV-201/runtime.test.ts`。最终 `runtime-3.log`：6项，5过1失败；失败即上述反例。通过项覆盖ATX闭hash/marks/CRLF、Setext、UndoRedo、重复heading的BOM/CRLF双空段逐次删除与范围外字节、空段删除夹带额外X的原子拒绝、组合输入及settling后退格。
- 同一命令改为 `probe.test.ts`：`probe-4.log` 2项失败，分别暴露首块目标选区错位及join后的错误插入；改为 `baseline.test.ts`：`baseline.log` 1项通过，证实基线拒绝同一join事务。
- 静态核读：空段ledger限定同次 `insertion-anchor`、唯一sourceStart及一/两次EOL；先完整目标doc证明再删空段。额外文本负控已实跑，不能代替选区证明。
- 初次根外filter、依赖解析及缺renderer资源未执行到产品断言；原始失败日志保留。随后仅运行既有prepare-renderers生成当前worktree离线资源；未安装依赖。
- 未运行全量1070、Native33、make lint/test或构建；未使用作者结果冒称本人证据。未启动App、GUI、访问用户文档、Keychain或外部服务。真实搜狗、paint、VoiceOver、macOS14及实际关闭/保存仍未由本次审查验证。
