# INK-PROT-030 限定修正红绿记录

日期：2026-11-09

基线：`6658185fd87ab3d23adbed0c5934fd852acd8f2b`

冻结 oracle SHA-256：`c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08`

## 冻结材料

管理者材料只读使用，未复制预期进模型、未修改：

- `review.cjs` SHA-256：`f3a7a118c3d748ce541fda83f2977f05b0eaea1447d3563c48ecc3d33effb8cc`；
- `RED.txt` SHA-256：`2915a3462d54905df472b9b912fd1d68cf7c8ed4df0a8c23beea02ae73c803f9`。

## RED

先在未修改实现上连续两次执行：

```text
node /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-030-checks/review.cjs
```

两次均稳定复现：

1. textarea 把 `\uFEFFa\r\nb\r\n` 显示为 LF，页面直接提交 `value`，产生 dirty/version/Undo；
2. dirty source draft 下 Undo 旅行到旧原文并清掉 controller draft，页面仍停在 source mode；
3. 旧 tail anchor 的 visual 未随插入映射，下一次真实 PM 选区把 `Y` 写到 `c` 后。

随后先新增 `regression.mjs` 再改实现；首次运行 8 组中 7 组 FAIL（empty history 原本就不旅行，
但没有明确 draft guard）。它还独立冻结了 mixed EOL、LF/raw 后向选区和任意 parser reprojection。

## 假设与验证

| 排名 | 假设 | 验证结果 |
| --- | --- | --- |
| 1 | 页面直接读取 textarea LF `value`，丢失生产 kernel 持有的原始 EOL | 成立；复用只读生产 `TextAreaEditorKernel` 后 no-op 与局部混合 EOL 均通过 |
| 2 | Undo/Redo 缺少 dirty draft 守卫，`restore()` 又清 draft | 成立；统一入口守卫覆盖 past/future/empty，clean draft 仍可旅行并明确退出 source mode |
| 3 | `accept()` 只移动 raw anchor，visual 未经 transaction mapping | 成立；raw/visual 双映射修正首个错位，并进一步发现 replacement end 两侧语义不一致 |
| 4 | parser 与 target 不可比时无条件采用 parser projection 掩盖错 patch | 成立；改成有限共享契约，无证明的 `*a*` 重解释原子拒绝并保留 candidate raw |

replacement 边界的追加发现仍属于假设 3：PM `StepMap` 把旧 replacement end 固定映到新右边界，
原 raw mapper 却按左 affinity 压到左边界。统一两者后，连续 composition、后向替换和多次编辑通过。
多补丁 strong 定界符删除又证明不能把每个语法补丁的旧边界都冒充为同一个用户 caret；最终实现只为
单一内容补丁或显式 `sourceCaret` 新增 caret anchor，并统一验证所有新旧 anchor 的 raw/visual 边界。

## GREEN

实际执行并通过：

```text
make -C editor/prototypes/source-authority test
```

结果：`regression.mjs` 11/11 PASS；原 `test.mjs` 9 组 PASS（PRIMARY 8/8、repeat 13/13、paragraph
3/3 等）；冻结 oracle hash 保持不变。管理者 `review.cjs` 再连续执行两次，三个检查均 PASS。

相关窄控制实际通过：生产 `editor-kernel.test.ts` 7/7、selection 15/15、source composition guard
4/4 synthetic、source ledger 17/17、native transaction stage 4/4；没有重跑无关生产 125 项。

证据层级修正：旧 source no-op 是直接 controller 对照，不能证明 textarea；旧 `nativeType` 也是
controller dispatch。新证据通过真实 DOM 按钮/textarea input、生产 kernel、真实
`EditorView.dispatch` 和 native key handler；数据层直调不再标成页面证据。

## 有界结论

不可比语义只允许四类带 provenance 的共享契约：隐藏单尾空格在续写时显形、带 raw anchor 的空行
实体化、第二尾空格形成 hardbreak、空原文行激活 ATX heading。其余差异拒绝，原文/历史/选区不变，
候选 raw 保存在 `unresolvedIntent`。

未执行真实 WKWebView、物理搜狗、NSDocument/App Sandbox 或 macOS 14 实机验证；本记录不宣称这些
层级通过，也不构成 INK-008/生产合入或 M0 通过。

## 最终 composition 历史边界限定

基线：`7cedafc29880f19a6f2b1e093157130d65b8266b`。

新增管理者冻结材料只读使用，未修改：

- `composition-late.cjs` SHA-256：`a672bf1a98495f39eff3d949331f18b158b1d77065c31272954aa44dd65f834b`；
- `COMPOSITION-LATE-RED.txt` SHA-256：`159bda97d49eda026533122378f81574e0fa26a7e960454307a36c2ffb1fc9b8`。

### RED

在未修改实现上实际执行冻结脚本，退出码 1：

```text
node /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-030-checks/composition-late.cjs
```

真实 bundle `EditorView.dispatch` 重放 `compositionstart -> marked(id=71) -> compositionend ->
final(id=71) -> Undo`；提交后是 `a 中文\n`，但 Undo 错误回到 `a zhongwen\n`，而非会话前
`a \n`。这与冻结输出一致，且证明只看 `compositionend` 当下 `past.length === 1`
不足以证明原子 Undo。

### 假设与验证

| 排名 | 可证伪假设 | 验证结果 |
| --- | --- | --- |
| 1 | DOM `compositionend` 立即清组，使同 ID 晚到最终事务以 marked 状态为新 `before` | 成立；保留已 end 会话的 ID 和会话前基线后，冻结重放 Undo 回到 `a \n` |
| 2 | Undo 前 `finishComposition()` 对晚到组再次封账，把 marked 快照压入历史 | 成立；每次同 ID 事务均从原会话基线重新压缩，Undo 边界只清会话不重建 `before` |
| 3 | 分组只依赖 DOM composing 布尔值，没有以 transaction composition ID 维持归属 | 成立；同 ID 在 end 前/后均归同会话，不同 ID、无 ID 普通输入和显式操作封账 |
| 4 | 最终替换的选区映射被误判成普通输入 | 否证；事务内容和选区映射均正确，失败仅位于历史封账时机 |

### GREEN

修复不使用延时、拼音字符串过滤、全历史清空或伪造 composition 事件。DOM end 只将当前
组标记为已结束并压缩可见历史，同 ID 晚到事务仍使用会话前快照；下一个不同 ID、
无 ID 事务或 Save/Source/Undo/Redo/Enter/Backspace/Reopen 等明确边界再清除组。

实际执行并通过：

```text
make -C editor/prototypes/source-authority test
node /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-030-checks/composition-late.cjs
node /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-030-checks/review.cjs
```

结果：新原型 11/11 限定回归、10 组集成域全绿；冻结 late 脚本退出码 0，Undo 为
`a \n`；管理者 `review.cjs` 三项均 PASS。新增集成断言覆盖 end 前最终事务、end 后异步
turn 最终事务、连续两会话、选区替换、普通输入边界、cancel/no-op 保 future、Undo 后
新分支及 Save/source no-op/dirty。冻结 oracle SHA-256 仍为
`c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08`。

新的离线 bundle SHA-256：`4b8a2a3d51071ce6a5e6456f48c86f65f88d0786253f4959c768bddfc2ceca99`。
仍未执行真实 WKWebView 或物理搜狗 IME；本轮证据层级仅为 synthetic/replay 的真实 bundle
`EditorView.dispatch` + DOM composition 生命周期。

## INK-PROT-036 EOF raw anchor 限定修正

基线：`90d613543dfb46b005bb75177a64861fd73fdf55`。

冻结材料只读使用，未修改：

- `EOF-REVIEW.cjs` SHA-256：`38987a58f3ddc48afbc739fcff3db1bde120447a0b57b50bbc4da148db24ac23`；
- 冻结 oracle SHA-256：`c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08`。

### RED

在未修改实现上实际执行：

```text
node editor/prototypes/fidelity/native-host/INK-PROT-034-EVIDENCE/EOF-REVIEW.cjs
```

退出码 1。`reopen("a\n", {anchor:2, head:2, affinity:"right"})` 接受 raw EOF caret，真实
`EditorView.dispatch(insertText("X"))` 也得到候选 `a\nX`，但提交被拒绝：

```text
actual currentRaw: "a\n"
unresolvedIntent.raw: "a\nX"
diagnostic: parser 与 PM 事务的语义差异没有共享字节/意图契约，已原子拒绝
AssertionError: an accepted EOF raw caret must insert at that exact raw boundary
'a\n' !== 'a\nX'
```

随后先新增 `eof-regression.mjs` 的同链最小测试；在修复前同样退出码 1，精确失败于
`real view input continues at the accepted raw EOF`，actual `a\n`、expected `a\nX`。

### 可证伪假设与验证

| 排名 | 假设 | 验证结果 |
| --- | --- | --- |
| 1 | 共享投影缺少“已接受 raw EOF 行尾”关系 | 成立；仅当原 EOF anchor、LF/CRLF 原文字节和去除该 gap 后的 parser/PM 精确关系同时成立才接受 |
| 2 | transaction 的 raw patch 插入点错误 | 否证；冻结输出的 candidate 已是 `a\nX` |
| 3 | `reopen` 把 caret 偷移到 LF 前 | 否证；RED 前 raw caret 为 2，真实 PM caret 为 2 |
| 4 | 只能无条件重解析放行 | 否证；旧 `*a*` 未证明重解释仍原子拒绝并保留 candidate |

实现把 LF/CRLF 作为 `accepted-eof-line-ending` gap 写入共享 source ledger，保留 gap 两侧不同
raw 边界和原 anchor。后续插入或 composition replacement 仍须删除同一 gap 后与真实 PM target
精确相等。inclusive strong 在该位置会让 PM 继承 mark，而 raw caret 位于闭合定界符之后；本轮没有
为它追加重解析特例，marks 相邻控制使用既有 non-inclusive inline link。

### GREEN

实际执行：

```text
make -C editor/prototypes/source-authority test
node editor/prototypes/fidelity/native-host/INK-PROT-034-EVIDENCE/EOF-REVIEW.cjs
```

两条命令均退出码 0。完整矩阵输出为：

```text
source-authority EOF regression: 7 domains PASS (synthetic composition; not physical IME)
source-authority regression: 11 PASS
PASS: PRIMARY 8/8 + scratch UTF-8 write/read
PASS: repeatPrimaryVectors 13/13
PASS: paragraphCases 3/3 via EditorView Enter
source-authority: 10 groups PASS
oracle sha256: c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08
```

冻结脚本 GREEN 后 `currentRaw` 为 `a\nX`、raw caret 为 3、Undo 为 1、version 为 1，原 raw=2
anchor 仍在 projection 中，provenance 为 `accepted raw EOF anchor preserves "\n" as a source-owned gap`，
且 Save eligible。最终离线 bundle SHA-256：
`1c07a4de3fa84bf8d96664cc53e63d8f57ba81a7c2163e7ca9e4d9e674a8ee92`。

没有执行 GUI、真实 WKWebView 或物理搜狗；composition 结论仅是 synthetic DOM 生命周期与真实 bundle
`EditorView.dispatch` 重放，不覆盖既有 M0 物理记录，也不宣告 M0、架构或首阶段通过。

## 036 管理者复核后的限定补正

初稿27213dd原文虽正确，但以gap隐藏了已变为段内softbreak的换行：同字节a+LF+X打开时是a/换行/X，初稿连续输入时投影为aX。管理者独立semantic-review红例准确失败，故该初稿未采纳。

当前只保留“原来接受的EOF原文锚点 + 原文件末行尾 + 去该末行尾后PM事务精确匹配”的输入意图证明；证明成立后重新建立真实原文语义投影，使段内softbreak显式存在。不再使用anchoredEofContext或运行时gap例外。未证明的mark继承/语义差异仍拒绝并保留候选。

独立字节红例和语义红例均转绿；EOF七域现在同时断言与同字节重开文档doc.eq，且不重置受测会话。原11回归/10集成域及冻结oracle均通过，原始scope不变。源码末尾caret→真实WK EditorView按钮输入→保存点→Undo/Redo→source no-op→新epoch重开通过，AX正文确实含中间换行。证据在evidence/INK-PROT-036-review/。source SHA ce8e3800fb7ad1dbf2f4d405ac255e6826c1ccf54ece46804cbcd40025cdb808，WK bundle c62466a08ced7527f700f88328d7ca07569a92ddf2921bd5cbd6213259cc291c。

真实WK本轮使用按钮驱动真实EditorView事务，未宣称物理EOF输入法验收。034物理取消/选区替换/源码输入及031已测路径不经过此EOF证明分支，证据按各自bundle限定复用；不是宣称新bundle全部重跑。inclusive strong EOF继承仍安全拒绝，生产V1必须明确并补齐常用格式编辑边界。M0采纳目标契约不等于全Markdown/生产架构实现通过。
