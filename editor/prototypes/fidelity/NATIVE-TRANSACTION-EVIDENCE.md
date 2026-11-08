# INK-PROT-018 原生事务桥接证据

日期：2026-11-08。分支：`task/INK-PROT-018-native-transactions`。基线：`30b73530af2e8dac37399a0dc9df64f8a9689eb3`。

本结论只覆盖隔离 fidelity 原型：真实 ProseMirror transaction/command 已能生成局部原文补丁，并在提交前通过候选原文重解析与目标 `PM doc.eq` 守卫。它不是生产架构采纳结论，也不表示 M0、桌面或真实 IME 已通过。

## 实现边界

- `native-transaction.ts` 只识别本轮已验证的事务形状：普通文本、空文档文本、paragraph/list split/join、strong 移除、ATX heading level、行内 code 定界符增长、fenced code language。未知多步、跨叶、含未建模 info 字节等事务明确拒绝。
- 每个补丁只替换事务涉及的 UTF-16 原文范围；未调用 Markdown serializer，不整段或整篇重写。候选原文重新 `parse`，只有无 issue 且 `parsed.doc.eq(target.doc)` 才进入 source/history。
- Markdown 无法单独表达“新建但仍为空的段落”。Enter 后在内存保存 PM state、候选局部补丁和显式 PM/source anchors；source 字节尚未提交，但 stage 本身计入 dirty/revision/history，保存和源码模式阻断。Undo/Redo 可完整恢复 PM doc、selection、candidate、anchors 与保存阻断状态。后续真实文字事务或删除 softbreak 后再次重解析，等价才提交 source。
- staged 内的 selection 变更先映射到候选原文：不可表示空块使用显式 anchor，已有文本按候选中的顺序叶映射。每个文字 transaction 同时通过 PM `tr.mapping` 与 source patch 更新全部 anchors；不唯一或未知事务在修改现态前拒绝，不继续积累错误 candidate。
- 列表 Enter 先走已声明依赖 `prosemirror-schema-list@1.6.0` 的 `splitListItem`。列表项行首 Backspace 用受限两步原生事务合并 list item 与其相邻 paragraph，source 只删除原 CRLF、marker 和 marker 后空白；其它列表项、indent 和 marker 不重写。
- 行内 code 插入反引号时从当前 code leaf 与相邻源定界符计算最长冲突 run；只增长当前一对定界符。heading/fence attr 从当前 PM attrs 与当前源范围核对，不读取 fixture oracle 或 `manifest.ops`。
- 既有 `inclusive:false` link/image 完整叶替换继承逻辑保留；`[a](later)later` 目标/正文碰撞与转义显示文字继续安全拒绝，可信 source/doc/history 不变。

## Audited native 矩阵

`audited-crossval.mjs` schemaVersion 2 从 `cases.json` 只读取动作说明、变体和 expected 元数据；从不读取 `ops` 作为编辑输入。expected 文件在动作执行后才读取并逐字节比较。

结果文件 `audited-crossval-results.json`：

- 汇总 `PASS`，16/16 累计步骤 PASS；`EXPLICIT_PATCH_DEMO=0`、FAIL/UNSUPPORTED/BLOCKED/runner error 均为 0。
- 05 四步均由 `EditorView.dispatch` 接收真实 PM transaction：`removeMark(strong)`、`setNodeMarkup(heading level=3)`、code leaf 插入一个反引号、`setNodeMarkup(code_block language=swift)`。driver 不提供 source patch。
- 06 main 四步均由 jsdom `KeyboardEvent` 进入真实 keymap/command：paragraph Enter/Backspace 与 list Enter/Backspace 全链逐字节命中；三个独立前置分支也通过。
- 11 `visual-split` 执行 Enter → PM `insertText` → Enter → forward Delete；`single-enter` 执行 Enter → PM `insertText`。两变体各两步均命中新 016 oracle，不再产生旧 484 的 `ORACLE_ACTION_AMBIGUITY`。
- 06 softbreak 与 11 main 的四个 source 步骤继续经过 textarea `input`、生产 `TextAreaEditorKernel` 和 `actions.apply`，全部 PASS。
- 空文档 visual `EditorView.dispatch(insertText("中文😀"))` 后 source、dirty、selection、history 正确；Undo 回到空 source/clean/TextSelection@1，Redo 恢复 10 UTF-8 bytes、PM anchor=head=5。
- 局部 EOL 补丁记录：paragraph split 插入 `CRLF CRLF`；list split 插入 `CRLF + "- "`；混合文档 CRLF 段插入的两个边界均为 CRLF，LF 尾段两个边界均为 LF。
- native inline collision 反例 PASS（正确拒绝）：source/doc/revision/history 不变，保存由 blocked 状态阻断。
- `native-transaction-stage-check.mjs` 的四条真实 jsdom/EditorView 回归 PASS：Enter→Undo→Redo→输入；移动到第一段输入后再完成空段；已有 future 的分支失效；未知 staged transaction 修改前拒绝。固定快照见 `native-transaction-stage-results.json`。

## 输入层与未覆盖层

| 证据 | 实际入口 | 能证明 | 不能证明 |
| --- | --- | --- | --- |
| 05 marks/attrs、空文档、11 文字 | `EditorView.dispatch(PM transaction)` | model 收到真实 PM transaction，自动生成并验证局部 patch | 浏览器 `beforeinput`、物理键盘、IME |
| 06、11 Enter/Delete | jsdom DOM `keydown` → ProseMirror keymap/command | keydown 被命令处理，结构事务进入同一桥接 | WKWebView/UIKit/AppKit 事件差异 |
| 06 softbreak、11 main | textarea `input` → `TextAreaEditorKernel` | 源码路径 EOL 与 byte exact 无回归 | 可视结构编辑 |
| Save/Undo/Redo | 原型 action 与内存快照 | source/state/selection/dirty/save point 一致 | 用户文件、NSDocument、冲突恢复 |

没有启动桌面 App、真实 WKWebView 或系统中文 IME；没有访问用户文件；没有修改 `native-host/`、生产代码、依赖或冻结 `fidelity-cases/`。

## 实际验证

```sh
make -C editor/prototypes/fidelity test
node editor/prototypes/fidelity/selection-check.mjs editor/prototypes/fidelity-cases
node editor/prototypes/fidelity/crossval.mjs editor/prototypes/fidelity-cases editor/prototypes/fidelity/PROTOTYPE.html
node --check editor/prototypes/fidelity/audited-crossval.mjs
node editor/prototypes/fidelity/audited-crossval.mjs editor/prototypes/fidelity-cases editor/prototypes/fidelity/PROTOTYPE.html editor/prototypes/fidelity/audited-crossval-results.json
node editor/prototypes/fidelity/native-transaction-stage-check.mjs
python3 editor/prototypes/fidelity-cases/verify.py
pnpm --dir editor exec vitest run prototypes/fidelity-cases/action-audit.test.ts --reporter=verbose
```

4afe4ca 首轮结果仍保留：原型 37 checks、selection 15/15、audited native 矩阵和 fixture 582 项均 PASS。管理者补充反例后新增 staged 回归 4/4 PASS，并再次执行受影响原型、audited、selection 与 fixture 检查；本轮未改生产代码，未重复生产 125 项。

## 保留风险

- 通用 inline source ledger 未完成；本轮保留现有安全拒绝，不等待或接入 INK-PROT-019。
- 数学/复杂边界仍过度保守；未知组合按事务拒绝，不泛化为 M0 全部操作支持。
- 空结构暂存已覆盖选择移动、分支 history 和拒绝路径，但仍是原型协调机制，不是 production history/composition 分组设计；真实 IME composition、浏览器 DOM mutation 与 WKWebView 必须另行验收。
- “内存保存点”不等于磁盘保存、重开、冲突或 App Sandbox 文件权限验证。
