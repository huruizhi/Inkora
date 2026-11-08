# INK-PROT-025 可视 composition 历史修复证据

Status: automatic regression PASS; real Sogou/WebKit retest pending; M0 remains unaccepted

## 证据分层

### 真实修复前证据（冻结）

2026-11-09 的物理键盘运行记录在以下三份文件中，修复未改写它们：

- `IME-HITL-025.md`：SHA-256 `f922fa28a5ae2f35b74e215249c038790362a3d9c8aaf4eadd78c9c0889b9540`
- `ime-hitl-025-runtime.txt`：SHA-256 `f171c649dcf8a6dedc99b39bffd596434c088694d030ece991a6262e13af8176`
- `ime-hitl-025-summary.json`：SHA-256 `70414babe47a47edabf331c77046f1a257de119d20630fd720f528350cbb9281`

真实失败为：最终 `中文测试` 后第一次 Undo 得到 `中文`，第二次 Undo 得到
`中文ce'shi`，即正常历史暴露组合中的拼音快照。原始摘要中的输入法仍写
`pending user confirmation`，因为它是冻结的捕获材料；随后用户通过管理者消息明确确认
本轮使用的是**搜狗输入法**。此后续确认只记录在本文件，不反向修改原始材料。

### 自动回归（synthetic/replay）

`ime-history-check.mjs` 载入当前 `PROTOTYPE.html` 的真实 `EditorView`，经
`view.dispatch -> dispatchTransaction -> FidelityModel -> actions.undo/redo` 公开路径重放。
`CompositionEvent` 和 PM 事务序列是合成/重放信号，不是系统搜狗输入法、候选窗或
WKWebView 的通过证据。

修复前已实际运行：

```text
node editor/prototypes/fidelity/ime-history-check.mjs
AssertionError: Undo exposed an intermediate composition snapshot: "组合前。中文ce'shi\n"
actual: "组合前。中文ce'shi\n"
expected: "组合前。\n"
exit 1
```

同一命令连续运行三次，三次都以同一 `中文ce'shi` 断言失败；不是偶发信号。

## 根因与修复

根因是原型共享快照历史把可视 composition 中每个 `docChanged` PM 事务都独立
`past.push`。WebKit/ProseMirror 对 marked text 的增长、替换、临时删除与最终上屏会产生
多个事务，因而中间拼音落入正常 Undo 栈。问题与字符串内容无关，也不是源码草稿历史。

ProseMirror 的 DOMChange 会在真实 composition 事务上设置同一 `composition` 元数据 ID；
`compositionend` 时仍待 DOMObserver flush 的最终事务也沿用该 ID。修复在
`FidelityModel` 中按 ID 保存会话前完整快照，并在每个同 ID 事务后把历史压成一个用户编辑
单元：

- 会话最终有实际文档/字节变化：`past` 只保留一次会话前快照，`future` 按新编辑语义清空。
- 取消或最终无实际文档/字节变化：不增加 Undo，并恢复会话前已有 `future`。
- 新 composition ID、普通事务、源码提交或 Undo/Redo 都会结束旧分组；不同会话、源码编辑、
  结构编辑不会被跨界压缩。
- 压缩的是完整 `HistoryEntry`，因此原文、真实 PM `EditorState`、选区、staged、pending、
  trusted、patch 与 before 一起恢复；没有清空整个历史，没有关闭 Undo，也没有按拼音或字符类别过滤。
- 修复未在组合期增加 `updateState`、`setText` 或强制提交；既有 visual/source composition
  按钮守卫保持不变。

诊断假设中，“每个组合事务独立落历史”得到确认；“需要覆盖 compositionend 与最终事务两种
顺序”由同 ID 元数据闭合；“诊断刷新是根因”被排除且未据此修改编辑器刷新；“事务无会话标识”
被锁定 ProseMirror 行为证伪；staged/pending/普通与源码边界均加入反例。

## 修复后自动结果

专项回归为 6/6 PASS，覆盖：

1. 连续两个 composition 会话及多次 marked-text 更新/替换，第二个会话的最终 PM 事务在
   `compositionend` 之后到达；两次 Undo/Redo 只跨完整会话，并恢复各自选区。
2. 选区替换；Undo 恢复原字节与原选区，Redo 恢复完整上屏文字与最终光标。
3. 普通非组合输入保持独立步骤；Undo 后新分支只清理旧 future。
4. 取消/no-op composition 不增加 Undo，也不污染或丢弃原 future。
5. staged 与 pending 边界可逐字节、逐状态 Undo/Redo；不把不同结构状态合并。
6. 可视 composition 后的源码往返、跨模式历史、dirty 与内存保存点保持原语义。

实际执行：

```text
make -C editor/prototypes/fidelity test
PASS: 37 reproducible checks
PASS: 4 staged native transaction regressions
PASS: 16 real EditorView ledger integration regressions
source composition synthetic-signal-guard: 4/4 PASS (not real IME)
visual IME history synthetic/replay: 6/6 PASS (real IME retest required)

node editor/prototypes/fidelity/source-ledger-check.mjs
PASS: 17 组独立来源断言

node editor/prototypes/fidelity/selection-check.mjs editor/prototypes/fidelity-cases
PASS: 15 项可复现校验

node editor/prototypes/fidelity/audited-crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html \
  editor/prototypes/fidelity/audited-crossval-results.json
PASS: 16 个累计步骤 + 3 个 isolated + 3 个 probe；其余计数均为 0

python3 editor/prototypes/fidelity-cases/verify.py
用例 11，步骤 49；检查通过 582 项，失败 0 项
```

最终 `PROTOTYPE.html` 由当前源码重建，SHA-256
`23730ee34cc06c708c14f7112a4dfb39cd0d0d0898831e354003b2f8764586ff`，398647 bytes。
全部 fixture 命令显式使用本工作区 `editor/prototypes/fidelity-cases`；没有依赖旧任务 worktree。

## 尚未执行与风险

未执行修复后的桌面宿主、真实 WKWebView、搜狗候选窗或物理键盘复验；未启动 GUI，未改输入源、
辅助功能权限或用户文件。管理者仍须在同类真实路径复验至少连续两次上屏、两次 Undo/Redo、
选区替换、取消/no-op，以及 compositionend/DOMObserver 时序。自动重放证明历史分组逻辑及边界，
不能证明真实 WebKit 一定产生预期元数据序列，也不能宣告 M0 通过或架构被采纳。

macOS 14、正式 App/NSDocument 磁盘保存、候选窗视觉与完整组合期动作矩阵仍未覆盖。若真实复验
发现事务缺少 `composition` 元数据，必须保留输入与可信状态并继续诊断，不能退回字符串过滤、
清空历史、禁用 Undo 或在组合期强制重建视图。
