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
