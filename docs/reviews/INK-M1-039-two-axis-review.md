# INK-M1-039 双轴审查

## Standards

# INK-REV-044：source-core 标准审查（独立、只读）

- 审查对象：`git diff 271922e04276926eacf7b48b9a1a920914aa79d4...09376154dea90b26843780630efda096722e46aa`（39b60c7、69e824d、0937615）
- 依据：`AGENTS.md`、`docs/testing.md`、`docs/bridge-protocol.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/design/source-authority-production-v1.md`、`docs/markdown-support.md` v1.1、`docs/save-barrier.md`。仓库无 CODING_STANDARDS / CONTRIBUTING 文件。
- 范围：书面准则判断，未重复 325 测试、GUI、安装；格式类（lint/风格）不重复报告。

## 一、Hard 违反

未发现 hard 违反。核对结论：

- 提交信息英文 Conventional Commits，subject ≤72 字符（3 条均合规）；文档中文。
- 未新增依赖（package.json / lockfile 无变更）；`Intl.Segmenter` 为运行时内建，不涉网络，符合 Sandbox 离线要求。
- 未 import prototypes、未暴露 `window` 调试控制器（`window.inkora` 仅为 Bridge 入口，`stateReport` 不在 window 上）。
- `docs/markdown-support.md` v1.1 与 ADR-0004 同步修订，矩阵规则 ID 保持唯一来源，未另立第二套规则。
- 旧 mode 断言（如 `expect(states).toHaveLength(...)`、旧 dirty 三元组）被改写属 V1 规格"直接验收与退出条件"明确允许的路径；替换测试 `source-authority-runtime.test.ts`（+233）保留字节/状态安全断言，未见删除后无对应覆盖的有效测试。

## 二、判断类发现（smell baseline）

1. **Feature Envy / Duplicated Code — `editor-runtime.ts:114-122` `status` getter**：runtime 直接读 `session.past.length`、`session.future.length`、`session.issues[0]?.message`、`session.unresolvedIntent`、`session.draftDirty` 自行拼装状态；而 `SourceAuthoritySession` 已有 `status` getter（`source-authority.ts:316-324`）暴露同类字段。历史栈一旦改结构（如环形缓冲、分组折叠），runtime 必须同步改。建议 session 增补 `draftDirty/unresolved/saveEligible` 的单一状态出口，runtime 只转发。

2. **Duplicated Code — `editor-runtime.ts:185-186 / 203-204 / 224`**：`getSourceSelection`、`selectSourceRange`、`applySourceReplacement` 三处重复同一守卫序列（`draftDirty` → 中文提示、`currentRaw !== raw` → 中文提示），且 `applySourceDraft`(164) 与 `applySourceReplacement`(241) 末尾重复 `beginSource(); kernel.setText(...); applySourceSelection(...); onChange(...)` 的刷新四连。守卫顺序或提示语变更需同步 3-5 处，属实际改动成本。建议抽取 `sourceSurfaceGuard(raw)` 与 `refreshSourceSurface()`。

3. **Refused Bequest（接口级）— `EditorRuntime` 新增 `enterSourceMode/applySourceDraft/cancelSourceDraft/snapshotText`**：`SourceEditorRuntime`（editor-runtime.ts:519-522）与 `ReadOnlyEditorRuntime`（:639-642）只能以常量桩实现；`ReadOnlyEditorRuntime.enterSourceMode()` 恒返回 `true` 却不进入任何模式，语义误导（调用方无法区分"已进入"与"空操作"）。建议接口拆分（如 `SourceDraftCapable`）或让 read_only 显式返回 `false` 并给出原因。

4. **Mysterious Name — `source-authority.ts:849` `saveMemory()`**：与 `markSaved()`（:857）并存且职责相近（都推进保存点），名字不说明"仅在内存推进保存点并校验资格"的概念；`nativeBackspace`（:760）以 `nativeType('')` 表达"删除选区"，空串承载删除语义。GLOSSARY 已定义"保存点"，命名可对齐（如 `advanceSavePointInMemory`）。

5. **Duplicated Code（类型重复）— EOL 字面量联合**：`'\r\n' | '\n'` 在 `source-authority.ts:295`（`preferredEol`）与 `source-transaction.ts:24,53,242`（`fallbackEol`）各自独立声明。属小类型抽取（Data Clumps 的轻量形态），新增第三种换行策略时会多点扩散。

6. **判断类契约风险 — `main.ts` createSnapshot 拒绝路径复用 `editor_not_ready`+`retry`**：草稿未提交/未解决意图时返回 `editor_not_ready`。`docs/bridge-protocol.md` 中该 code 语义为"等待 ready 或重新加载后重试"；此场景重试本身不可能成功，原生侧只能靠重试上限兜底失败。V1 规格允许"使用既有错误契约"，故不构成 hard 违反，但建议在 Bridge 文档中明确该 code 可承载"等待用户处理草稿"语义及重试上限预期。

## 三、结论

3 个提交相对 271922e 的实现与文档修订与 ADR-0004、V1 规格、Bridge 协议和 AGENTS.md 的书面准则一致，未发现 hard 违反；上述 6 条判断类发现均不阻断合并，建议在后续切片（V2/V6 或 Bridge 文档任务）中顺手消化，优先级：#1、#2（同一文件、同一改动窗口）。

## Spec

# INK-REV-043 Source Core Spec 审查

固定审查 `271922e...0937615`（提交 `39b60c7`、`69e824d`、`0937615`）。仅作 Spec 审查；未重复管理者全量测试，临时红测和 `node_modules` 链接已清理。未发现明确越界交付，也未把缺少 GUI 验收当作代码失败。

## 发现

1. **(c) 严重：拒绝的 `markSaved` 仍污染保存点。** 规格要求旧/错误收据不得覆盖当前状态（`docs/design/source-authority-production-v1.md:24-25`；`docs/bridge-protocol.md:82`；`docs/save-barrier.md:40`）。实际路径先执行 `runtime.markSaved(command.text)`，再由协议会话校验 document/revision/request（`editor/src/main.ts:511-519`；`editor/src/bridge.ts:263-278`），故错误 documentID 已改 `savedRaw`。**实际复现**：编辑 `a\n→ab\n`，发送 wrong-doc `markSaved` 得 `stale_revision`，再 Undo/Redo；预期仍 dirty，实际 false。命令：`vitest run src/main.test.ts -t REVIEW`，该断言失败（expected true, received false）。

2. **(a) 严重：常见未知片段触发整篇自动源码降级。** V1 要求高级片段与正文混排、未知结构保留投影/意图，禁止自动整篇源码（规格 `:7-10,18`；save barrier `:38`）。`::: note` 被解析器抛错（`editor/src/source-document.ts:122-123`），入口用通配 `catch` 静默创建旧 `SourceEditorRuntime`（`editor/src/editor-runtime.ts:694-706`）。**实际复现**：正文 + `::: note` + 尾段加载后无 `.ProseMirror`、出现整篇 textarea；同一 REVIEW 命令相应断言失败。此 catch 还掩盖环境/编程错误，超出“合法片段”单点。

3. **(c) 高：source no-op 往返丢 caret。** 规格明确 no-op 不移动 caret，并要求源码往返选区（规格 `:17,31-34`）。取消路径未读取 textarea 当前 selection，直接丢 draft 并重渲染（`editor/src/editor-runtime.ts:171-175,374-375`；`editor/src/source-authority.ts:801-805`）。**实际复现**：`abc\n` 进入源码，将 caret 置 2，取消、再进入；预期 2，实际 0。命令：`vitest run src/editor-runtime.test.ts -t REVIEW`，1/1 失败。

## 结论

规格轴 3 项：缺失/部分 1，越界 0，看似实现但错误 2。最严重为无效保存回执改变 dirty 基线，可能把未落盘内容报告为 clean。

规范轴：0项书面硬违规、6项判断类发现；规格轴：3项发现，最严重为无效保存回执改变保存点。
