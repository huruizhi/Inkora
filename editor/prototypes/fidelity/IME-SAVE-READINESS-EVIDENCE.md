# INK-PROT-026 历史恢复与保存资格证据

Status: deterministic regression fixed; real WKWebView/Sogou retest not executed; M0 not passed

## 范围与基线

- 分支：`task/INK-PROT-026-history-save-readiness`。
- 本轮管理者退回基线 HEAD、远端分支：`186d6a07e01afecee65cf5ce8f8aa1012f8cfc2e`，开始时工作区干净且两者一致。该提交已完成第一阶段“诊断不进入历史快照”修正，但仍遗漏失败后直接 Undo/Redo 的当前诊断失效路径。
- 真实复验基线仍为 `5bde76bab9b2bb74839fc7be99935b97d8125c66`。本任务没有修改 025 原始材料，也没有修改以下 026 冻结材料：
  - `IME-RETEST-026.md`：SHA-256 `073a557030d2aa8a0910569f79fb6c4f0f0cc8954f9738b92f1d7826a7dd2427`
  - `ime-retest-026-runtime.txt`：SHA-256 `4f2befce2dc99ec3a3dd14e946b05d32c092e1ddb22f3595144e92dfc7089b89`
  - `ime-retest-026-summary.json`：SHA-256 `23573a71543c4352ffca2dbb7c345bb57604062c16d9f649e5f6a20f17bd8fce`
- 本证据只覆盖 fidelity 隔离原型的确定性逻辑，不是 GUI、WKWebView、真实搜狗输入法、NSDocument 磁盘保存或 M0 验收。

## 冻结真实证据与管理者反例

冻结运行材料包含 203 条 runtime 记录和 6 个 blocked snapshot。真实轨迹不是两个孤立动作：两次中文 composition 之前已有 48 次普通英文输入/删除历史；两次上屏之后还有 6 次普通空格/删除。管理者先 Undo 这 6 次，再 Undo 两个中文单元，随后 Redo 两个中文单元，再 Redo 6 次恢复最终正文。

两个实际 composition 各只增加一个历史单元，Undo/Redo 没有暴露拼音中间态。异常集中在有效中文恢复点：revision 77/78/80/81 的 `pending=false`、`staged=false`，但均恢复了 `Error: 补丁重解析与目标 PM 文档不一致；可信状态未提交`，导致保存禁用；回到基线 revision 79 及恢复后续普通编辑 revision 87 时保存重新可用。

`IME-RETEST-026.md` 明确记录这是用户物理键盘、搜狗和真实 WKWebView 轨迹，并要求不得为消错无条件清除 `blocked`。本轮只读该冻结记录，没有修改它或 025 真人材料，也没有把自动重放冒充真人复验。

管理者随后在 `186d6a07` 上独立构造同类反例：真实 EditorView 拒绝事务后，不先做有效编辑，直接公开 Undo。Undo 确实恢复到 source/PM/trusted/ledger 一致、`pending=false`、`staged=null` 的安全点，但当前 `blocked` 仍为拒绝错误，保存按钮仍禁用。这个反例证明第一阶段回归只抓到“旧诊断随快照复活”，未覆盖“当前诊断跨一次真实历史恢复残留”。

## 确定性红回归

在既有 `history-save-readiness-check.mjs` 中先固化管理者反例，从重建后的真实 `PROTOTYPE.html` 启动 EditorView，并只通过 `EditorView.dispatch` 和公开 Undo/Redo 入口执行：

1. 在默认真实样稿 PM 位置 66 输入尾随空格，确定性触发与冻结证据相同的 `补丁重解析与目标 PM 文档不一致；可信状态未提交`。
2. 证明拒绝前后 source、PM doc、选区、past/future 均未改变；拒绝当下保存继续阻断。
3. 不做任何中间有效编辑，直接从公开入口 Undo 到 composition 前安全点。
4. 独立重解析并检查 source/PM、trusted source/doc、ledger source/docSize、pending 与 staged；它们全部安全一致，但 `186d6a07` 仍保留当前 `blocked`。

修复前实际命令与红输出：

```text
$ node build.mjs && node history-save-readiness-check.mjs
PROTOTYPE.html ready (offline; double-click).
AssertionError [ERR_ASSERTION]: direct Undo to a safe history point retained the current rejection
+ actual - expected
+ 'Error: 补丁重解析与目标 PM 文档不一致；可信状态未提交'
- ''
exit=1
```

该红断言命中了用户报告的保存资格错误，而不是附近的 crash、pending 或 staged 问题。

最终回归保留原“失败 → 有效 commit → Undo/Redo”，并新增四类路径：失败后直接 Undo 到安全点、保留 future 时失败后直接 Redo 到安全点、空 history Undo/Redo 完整 no-op、恢复 pending/staged 后仍由实际文档状态阻断保存。合成重放只验证逻辑，不冒充真实 IME。

## 排序假设与验证

1. **`blocked` 已退出历史快照，但一次真实 `travel()` 成功恢复后没有废止当前操作诊断。** 预测：只在确有 history entry 且恢复验证成功后清除它，直接 Undo/Redo 变绿，空 history no-op 仍保留错误。结果：符合。
2. **恢复目标本身不安全。** 预测：恢复前 source/PM、trusted 或 staged ledger 验证失败。结果：不符合；安全点独立验证通过，pending/staged 则分别由可解释投影与 staged ledger 验证。
3. **UI `run()` 没有刷新保存按钮。** 预测：模型 `blocked` 已空但按钮仍禁用。结果：不符合；修复前模型值本身仍非空。
4. **composition 压缩消费了错误 history entry。** 预测：直接 Undo 不回 baseline 或 past/future 数量异常。结果：不符合。
5. **pending/staged 被误当成操作诊断。** 预测：清除 `blocked` 后会错误开放保存。结果：不符合；两类恢复仍由各自状态禁用保存。

## 最终根因与修复边界

第一阶段根因是 `HistoryEntry` 曾同时保存文档状态和 `blocked`；`186d6a07` 已把操作诊断移出快照。管理者反例揭示第二阶段根因：失败事务不提交 source/PM/history，但当前 `blocked` 留在模型上；真实 Undo/Redo 恢复另一个快照时，`restore()` 不再从快照赋值 `blocked`，`travel()` 也没有使这条“最近操作失败”诊断失效，于是安全恢复点仍被旧的当前诊断阻断。

限定修复保留诊断与文档状态的分离，并让 `travel()` 先验证目标快照，再完成栈移动，最后仅在确实发生恢复时清除当前操作诊断。普通/含混快照继续经过 parse 与 `doc.eq`；clean 快照还验证 trusted source/doc；staged 快照验证 candidate、投影 PM 和 anchors 能建立 staged ledger。没有删除重解析等价检查，也没有按错误字符串清错。

- 实际等价失败当下仍设置 `blocked`、禁用保存，且 source/PM/选区/历史不变；未提交用户意图不会被一次失败偷偷写入或丢弃。
- 后续真实成功提交或一次真实且验证通过的历史恢复会清除当前诊断；空 history Undo/Redo 不改 `blocked`、revision、内容或栈。
- pending 的完整含混缓冲、staged candidate/anchors、源码草稿、trusted 状态和完整 EditorState 仍由既有机制保存；它们的保存阻断没有放宽。
- composition 分组、取消 no-op、选区替换、已有 future 与新分支逻辑没有改动。

## 修复后自动检查

```text
$ node build.mjs && node history-save-readiness-check.mjs
PROTOTYPE.html ready (offline; double-click).
history save readiness: 5/5 PASS (real IME retest required)
exit=0

$ make -C editor/prototypes/fidelity test
PASS: 37 reproducible checks
PASS: 4 staged native transaction regressions
PASS: 16 real EditorView ledger integration regressions
source composition synthetic-signal-guard: 4/4 PASS (not real IME)
visual IME history synthetic/replay: 6/6 PASS (real IME retest required)
history save readiness: 5/5 PASS (real IME retest required)
exit=0

$ node editor/prototypes/fidelity/source-ledger-check.mjs editor/prototypes/fidelity-cases
PASS: 17 组独立来源断言；真实 model.parse/PM 文档路径；临时 bundle 已清理。
exit=0

$ node editor/prototypes/fidelity/selection-check.mjs editor/prototypes/fidelity-cases
PASS: 15 项可复现校验通过；临时打包产物已清除。不构成 WKWebView/IME/UI 验收。
exit=0

$ node editor/prototypes/fidelity/audited-crossval.mjs editor/prototypes/fidelity-cases editor/prototypes/fidelity/PROTOTYPE.html editor/prototypes/fidelity/audited-crossval-results.json
PASS: cumulative 16, isolated 3, probe 3; fail/unsupported/blocked/runner error 0
exit=0

$ python3 editor/prototypes/fidelity-cases/verify.py
用例: 11  步骤: 49 (byte-exact 36 / state-ref 8 / operational 5)
检查通过 582 项，失败 0 项
全部通过
exit=0
```

覆盖关系：新的 5 类断言证明直接 Undo/Redo、旧有效提交路径、空历史 no-op 及 pending/staged 保存资格；37 项主检查继续覆盖含混缓冲、源码草稿/修复失败、保存点与往返；4 项 staged 检查继续覆盖完整 candidate/anchors；6 项 IME 合成/重放继续覆盖两个会话、取消 no-op、选区替换、已有 future、新分支以及源码/保存点往返。所有 composition 相关自动检查均明确只测逻辑。

## 尚未执行与风险

- 未启动 App、未执行 GUI，也未执行真实 WKWebView + 物理键盘 + 搜狗复验；因此不能确认 WebKit DOMObserver 的实际时序已与自动重放完全一致。
- 未执行正式 NSDocument 磁盘保存/重开/冲突、最低 macOS 或用户整体审阅。
- 没有重复运行无关的生产 editor 125 项测试；本次变更限于 fidelity 原型历史载荷与对应回归。
- 不宣告 M0 通过，不宣告原型架构获采纳。
