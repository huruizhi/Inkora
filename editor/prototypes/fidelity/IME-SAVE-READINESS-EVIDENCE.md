# INK-PROT-026 历史恢复与保存资格证据

Status: deterministic regression fixed; real WKWebView/Sogou retest not executed; M0 not passed

## 范围与基线

- 分支：`task/INK-PROT-026-history-save-readiness`。
- 修复前 HEAD、远端分支：`abd4c58f8f247c285f3a17cb44c36b73021ae1f5`，工作区干净且两者一致。
- 真实复验基线仍为 `5bde76bab9b2bb74839fc7be99935b97d8125c66`。本任务没有修改 025 原始材料，也没有修改以下 026 冻结材料：
  - `IME-RETEST-026.md`：SHA-256 `073a557030d2aa8a0910569f79fb6c4f0f0cc8954f9738b92f1d7826a7dd2427`
  - `ime-retest-026-runtime.txt`：SHA-256 `4f2befce2dc99ec3a3dd14e946b05d32c092e1ddb22f3595144e92dfc7089b89`
  - `ime-retest-026-summary.json`：SHA-256 `23573a71543c4352ffca2dbb7c345bb57604062c16d9f649e5f6a20f17bd8fce`
- 本证据只覆盖 fidelity 隔离原型的确定性逻辑，不是 GUI、WKWebView、真实搜狗输入法、NSDocument 磁盘保存或 M0 验收。

## 修复前真实证据

冻结运行材料包含 203 条 runtime 记录和 6 个 blocked snapshot。真实轨迹不是两个孤立动作：两次中文 composition 之前已有 48 次普通英文输入/删除历史；两次上屏之后还有 6 次普通空格/删除。管理者先 Undo 这 6 次，再 Undo 两个中文单元，随后 Redo 两个中文单元，再 Redo 6 次恢复最终正文。

两个实际 composition 各只增加一个历史单元，Undo/Redo 没有暴露拼音中间态。异常集中在有效中文恢复点：revision 77/78/80/81 的 `pending=false`、`staged=false`，但均恢复了 `Error: 补丁重解析与目标 PM 文档不一致；可信状态未提交`，导致保存禁用；回到基线 revision 79 及恢复后续普通编辑 revision 87 时保存重新可用。

## 确定性红回归

先新增最小版 `history-save-readiness-check.mjs`，从重建后的真实 `PROTOTYPE.html` 启动 EditorView，并只通过 `EditorView.dispatch` 和公开 Undo/Redo 入口执行：

1. 在默认真实样稿 PM 位置 66 输入尾随空格，确定性触发与冻结证据相同的 `补丁重解析与目标 PM 文档不一致；可信状态未提交`。
2. 证明拒绝前后 source、PM doc、选区、past/future 均未改变；拒绝当下保存继续阻断。
3. 经 EditorView 提交另一笔有效正文编辑，再从公开入口 Undo 回有效恢复点。
4. 独立重解析并检查 source/PM、trusted source/doc、ledger source/docSize、pending 与 staged；它们全部安全一致，但修复前仍恢复旧 `blocked`。

修复前实际命令与红输出：

```text
$ node build.mjs && node history-save-readiness-check.mjs
PROTOTYPE.html ready (offline; double-click).
AssertionError [ERR_ASSERTION]: valid Undo restore retained a rejected-operation diagnostic
+ actual - expected
+ 'Error: 补丁重解析与目标 PM 文档不一致；可信状态未提交'
- ''
exit=1
```

该红断言命中了用户报告的保存资格错误，而不是附近的 crash、pending 或 staged 问题。

根因修复后又把同一回归加强为更接近冻结轨迹的路径：先在 PM 位置 66 合成重放 `zhong'wen → 空 → 中文`，确认只增加一个历史单元；再在上屏后的 PM 位置 68 输入尾随空格，随后完成有效编辑并经公开 Undo/Redo 恢复中文点。该加强版现为最终 1/1 绿回归；合成重放只验证逻辑，不冒充真实 IME。

## 排序假设与验证

1. **历史快照错误保存瞬时 `blocked` 诊断。** 预测：后续有效提交会把旧拒绝信息写入 `past`，Undo 恢复时内容完全安全但诊断复活。结果：符合。
2. **trusted 指针在恢复时陈旧。** 预测：trusted source/doc 与当前 source/doc 不等价。结果：不符合，独立等价断言通过。
3. **source ledger 缓存跨恢复失效。** 预测：ledger 构建失败或 docSize 不一致。结果：不符合。
4. **被拒绝事务偷偷修改 PM、选区或历史。** 预测：拒绝前后至少一个状态不同。结果：不符合。
5. **隐藏 pending/staged 才是保存阻断来源。** 预测：恢复点至少一个标志为真。结果：不符合。

## 最终根因与修复边界

`HistoryEntry` 同时保存了文档持久状态和 `blocked`。但 `blocked` 是“最近一次操作被拒绝”的瞬时诊断：失败的事务没有提交 source/PM/history；后续成功提交会重新建立可信状态并清除当前诊断。旧实现却在该成功提交前先把当前快照（连同旧诊断）压入 `past`，因此 Undo/Redo 会在安全内容点复活与内容无关的错误。

修复从 `HistoryEntry`、`snapshot()` 与 `restore()` 中移除 `blocked`，没有删除重解析等价检查，也没有跳过 `doc.eq`。边界保持如下：

- 实际等价失败当下仍设置 `blocked`、禁用保存，且 source/PM/选区/历史不变；未提交用户意图不会被一次失败偷偷写入或丢弃。
- 只有后续真实成功提交才清除当前诊断；历史恢复不再携带其他操作/会话的旧诊断。
- pending 的完整含混缓冲、staged candidate/anchors、源码草稿、trusted 状态和完整 EditorState 仍由既有机制保存；它们的保存阻断没有放宽。
- composition 分组、取消 no-op、选区替换、已有 future 与新分支逻辑没有改动。

## 修复后自动检查

```text
$ node build.mjs && node history-save-readiness-check.mjs
PROTOTYPE.html ready (offline; double-click).
history save readiness: 1/1 PASS (real IME retest required)
exit=0

$ make -C editor/prototypes/fidelity test
PASS: 37 reproducible checks
PASS: 4 staged native transaction regressions
PASS: 16 real EditorView ledger integration regressions
source composition synthetic-signal-guard: 4/4 PASS (not real IME)
visual IME history synthetic/replay: 6/6 PASS (real IME retest required)
history save readiness: 1/1 PASS (real IME retest required)
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

覆盖关系：新的 1 项回归证明有效中文历史恢复点的 dirty/selection/save 资格与跨会话诊断隔离；37 项主检查继续覆盖含混缓冲、源码草稿/修复失败、保存点与往返；4 项 staged 检查继续覆盖完整 candidate/anchors；6 项 IME 合成/重放继续覆盖两个会话、取消 no-op、选区替换、已有 future、新分支以及源码/保存点往返。所有 composition 相关自动检查均明确只测逻辑。

## 尚未执行与风险

- 未启动 App、未执行 GUI，也未执行真实 WKWebView + 物理键盘 + 搜狗复验；因此不能确认 WebKit DOMObserver 的实际时序已与自动重放完全一致。
- 未执行正式 NSDocument 磁盘保存/重开/冲突、最低 macOS 或用户整体审阅。
- 没有重复运行无关的生产 editor 125 项测试；本次变更限于 fidelity 原型历史载荷与对应回归。
- 不宣告 M0 通过，不宣告原型架构获采纳。
