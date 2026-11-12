# INK-REV-183 表格 Standards 独立审查

冻结产品：`efa551708d824a2c98a808d18faf94ce05ffebd4`；基线：`16d0a6282f60b1357780aa7b964746be7e62b9bd`。比较固定为 `git diff 16d0a6282f60b1357780aa7b964746be7e62b9bd...efa551708d824a2c98a808d18faf94ce05ffebd4`，包含 `2f6cccf`、`efa5517`。

## 审查核心（少于400词）

### 书面规范硬项：1

- **S1 / P2：规模对话框的 compositionstart 会关闭正在输入的控件并抢回焦点。** 违反 [AGENTS.md:8](../../AGENTS.md#L8)「不得破坏中文输入法 composition、光标、选区」及 [表格生产契约:19](../design/tables-tasks-production-v3.md#L19)「不得……丢候选或偷移焦点」。新增 hunk [table-interactions.ts:161](../../editor/src/table-interactions.ts#L161) 为整个 `view.dom` 捕获 `compositionstart` 并执行 `cancel(); closeDialog?.()`；规模对话框位于其子树，`closed` 回调在 [同文件:158](../../editor/src/table-interactions.ts#L158) 执行 `view.focus()`。因此对话框自己的 composing 守卫尚未执行，输入控件已被移除。独立 DOM probe 从正式 runtime 打开规模，在列数输入框派发 compositionstart，确认 dialog 消失、焦点变成 `#editor`。应区分对话框内输入与正文组合输入，组合过程中保留输入控件与焦点。未用物理输入法复现，不推断所有 macOS 数字输入框均能产生此事件。

### Fowler 判断项：1

- **J1 / 低 / possible Duplicated Code。** [table-editing.ts:203](../../editor/src/table-editing.ts#L203) 的 `Number.isInteger`/上下限检查与 [source-transaction.ts:841](../../editor/src/source-transaction.ts#L841) 的同形检查分别定义尺寸策略；后者重复写 `20/100`。调整策略时可能只改一处。可共用纯尺寸谓词及上限，仍各自在事务边界校验，保留独立原文候选证明。这是维护判断，不是硬规范违反，也不把必要的 PM/原文双重证明当作重复代码。

结论：Standards 硬项1、判断项1；最严重为 S1。Spec 未在本轴裁定。

## 标准来源与边界

已读：`AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/bridge-protocol.md`、`docs/testing.md`；并搜索其他书面规则，核读 `docs/adr/0003-project-and-bridge.md`、`docs/tables-tasks.md`、`docs/design/tables-tasks-production-v3.md`、`docs/editor-session.md` 与 `docs/source-search.md` 中相关边界。仓库无 `CODING_STANDARDS.md`、`CONTRIBUTING.md`，无其他嵌套 `AGENTS.md`。`docs/design/typora-table-parity.md` 仅用于理解职责；未以本批需求覆盖率作 Standards finding。工具强制的格式、类型检查不列 finding。

固定12项 baseline 已逐项检查：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。仅 Duplicated Code 留 J1；跨 PM/原文分支属于 ADR-0004 的原子证明责任，不据此报 Repeated Switches；其余未形成足够具体的独立判断项。仓库规则优先，所有 smell 均为判断。

## 独立证据与限制

本审查自行执行的已有定向测试：`table-parity-runtime.test.ts`、`tables-tasks-runtime.test.ts`、`main.test.ts`，准备离线 renderer notices 后 **3文件、172测试通过**。首次未经预处理运行因缺少 `public/RENDERER_NOTICES.txt` 失败，保留原日志，不算产品断言失败。

自有 ignored probe **1测试通过**，断言的是 S1 缺陷状态，并非组合输入验收通过。probe/日志位于 `artifacts/INK-REV-183/`，入口和命令见[任务记录](../tasks/INK-REV-183.md)。证据全部来自本审查执行；未借用实施者或管理者测试结果。未运行全量测试、构建、lint、App、UI、WK、物理 IME、VoiceOver；未访问用户文档、Keychain 或联网安装。


## 限定补正复验追加（8bb27ad）

原报告以上逐字保留。复验固定产品 `8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`，仅核读 `git diff efa551708d824a2c98a808d18faf94ce05ffebd4...8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`（1 commit）的新增变更，不重做 Spec 轴。

- **S1 闭合（DOM 事件边界）**：规模对话框挂到 `view.dom.parentElement`，其本地 composition 不再经过正文 capture。原始 probe 文件未改，在补正产品上运行时原缺陷断言 `dialog === null` 失败，实际对话框保留；这是旧缺陷不再复现的反证，不是验收断言失败。另建正向独立 probe **1/1通过**，直接核对输入框连通、焦点仍是同一实例、值保持3、raw及status未变；组合期间提交、cancel事件、Esc、取消按钮和 observer 微任务均保持这些不变量，compositionend 后 Esc 可以关闭并回到编辑器。已有控件定向 **4通过、17未选中**。未执行物理输入法或WK，不扩大闭合口径。
- **J1 闭合**：纯模块 `table-commands.ts` 提供唯一 `TABLE_LIMITS/validTableSize`；PM、对话框、原文规划共用尺寸策略，原文仍独立执行 `parse(candidate).doc.eq(tr.doc)`。`table-interactions.ts` 经 execute callback 调用正式命令，已消除对 `table-editing` 的反向运行时依赖。共享策略未替代原文证明。
- 补正其余 source 边界与测试变更已静态检查，未发现新增 Standards 硬项；未运行 Spec 探针，不对 Spec 四项作裁定。

当前限定复验结论：S1、J1均闭合，新增硬项0、判断项0。原始报告和证据仍保留；临时导出的产品已恢复，分支仅留下审查文档。命令、原始失败形态和正向证据见任务记录追加。
