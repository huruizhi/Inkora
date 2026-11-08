# INTEGRATION-SELECTION-EVIDENCE：INK-PROT-010 选区映射接入 main/model 源码往返与历史

日期：2026-11-08。分支 `task/INK-PROT-010-selection-integration`，基线 `7fe11b36c0981f2d57d9866320702a966c47866a`（005 保护边界 + 006 选区映射模块 5983120 + 审计样稿 484 + 宿主 952）。只改 `editor/prototypes/fidelity/`；`model.ts`、`selection-map.ts`、生产代码、`native-host/`、独立样稿均未改动（009 平行修引用链接会动 model/main，本轮避免冲突：接线全部落在 main.ts 的 source/apply/cancel/undo/redo 与 UI 文案）。

## 接线内容（main.ts，全部走原型既有真实路径）

1. **进入源码模式（`actions.source`）**：`visualToSource(model.source, doc, ranges, sel.anchor, sel.head)` → `rawToLf` → `setSelectionRange(start, end, backward?'backward':'forward')`，把当前 PM anchor/head 映射为 textarea LF 选区并**保留方向**。吸附（块语法前缀/块间空白/文件尾等）照常接受，但写入 note 与 `lastSelectionMap.snapped`，明示"吸附是有说明的近似，不是精确映射"。**失败不阻断进入**：草稿照常打开、可视选区不动、note 给出具体原因——受保护块的主动源码修复入口始终可达。
2. **提交草稿（`actions.apply`）**：读取 textarea **当前**选区（LF 偏移 + `selectionDirection`）→ `lfToRaw(kernel 规范原文)` → 对 `parse(text)` 得到的新 (doc, ranges) 调 `sourceToVisual`，成功才提交；语义变化（`sourceEdit` 返回 false）时 `model.select(anchor, head)` 把选区落到新文档内容锚点（后向选区 anchor>head 原样保持）；语义相同保留原选区（08 既有契约不回归）。no-op 提交（字节一致）不改字节/dirty/revision/history，也不动选区。
3. **Undo/Redo（`actions.undo/redo` → `model.travel`）**：恢复的历史快照本就携带 EditorState（含 selection 锚点与方向）；由于每个源码提交现在都把映射选区写入状态，跨模式 Undo/Redo 恢复对应内容锚点与方向，无需新机制。
4. **Cancel**：离开草稿、textarea 由可信原文重置，可视内容与选区保持不变。
5. **草稿历史守卫（预审修复 1）**：`draftHistoryRefusal()` 在源码草稿与可信原文不一致时让 Undo/Redo **拒绝执行**（不切模式、不 travel），note 说明草稿保持、需先提交 / 移到安全锚点重试 / 显式取消——消除"点 Undo 即离开源码模式、render 重置 textarea、草稿输入消失（即使 past 为空也丢）"的静默丢输入路径。草稿未修改时 Undo/Redo 行为不变。

## 失败策略（纠正 006 文档建议）

`SELECTION-EVIDENCE.md` §后续集成步骤曾建议 sourceToVisual 失败时"回退现状重置并在 UI 说明理由"——**该建议已被本轮实现否定并纠正**：绝不静默重置光标或丢选择。实际策略：

- **apply 映射失败**：提交不执行。源码草稿、可信原文/视图、原可视选区、revision 与历史全部保持；note 给出模块的具体失败原因（如"受保护块（原文 X..Y）内部没有可视文本锚点"），用户可把 textarea 光标移到安全锚点（正文文本处）后重新提交，或取消草稿。
- **无文本锚点例外（预审修复 2）**：新文档**完全没有文本锚点**（如纯保护块缓冲）时不存在任何安全锚点，拒绝提交等于禁用主动修复——此时提交照常进行，但选区不再"重置到首个可选位置"：以源码光标所属（owner）保护块为锚，经真实事务落 `NodeSelection.create(doc, owner.pos)` 整块选中（最小反例与证据见下节 check.mjs 列表）。该回退在 note 与 `lastSelectionMap.noTextAnchor/fallback` 中明示，**记录为"文本选区映射不支持"，不判通过**；受保护块的主动源码修复入口保持可达。
- **草稿未被提交时**：Undo/Redo 拒绝执行（见接线 5），不切模式、不丢草稿。
- pending/畸形（005 语义）不受接线影响：含混输入仍进 pending 缓冲、保存仍阻断、不自动全篇源码、不丢用户输入。

## 实际命令与结果（全部真实执行，Node v26.13.0，锁定依赖）

```sh
ln -s /Users/rayhu/Documents/projects/Inkora/editor/node_modules editor/node_modules   # 临时链接，结束时已删除
make -C editor/prototypes/fidelity test
# PASS：build（重建单文件 PROTOTYPE.html）+ tsc 严格检查 + check.mjs 28 项（原 21 + 新增 7 块 + 2 处扩展）
node editor/prototypes/fidelity/crossval.mjs
# 09 全步骤 PASS（见下）；01/02/04/07/08/10 回归通过；03 无法打开（gfm_autolink）；
# 05/06/11 为旧 driver 输出（05 缺步1、06/11 动作未按审计修订），不构成对审计后 oracle 的判定，
# 本轮未处理，待正确重放（与选区接线无关）
node editor/prototypes/fidelity/selection-check.mjs /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-002-fidelity-cases/editor/prototypes/fidelity-cases
# PASS：15 项纯函数校验（006 模块本身的模块级证据，不因接线扩大保证范围），临时打包产物自动清除
make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
# PASS：swift-format --strict + 生产 TS tsc --noEmit
make test-editor PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
# PASS：9 文件 111 项现有测试
```

## 样稿 09 全步骤 jsdom 真实重放（crossval.mjs，预期仅事后读取）

步骤经真实路径重放：`pmCaret`（model.select = PM TextSelection 事务）→ `enterSource`（actions.source + textarea 选区/方向读取）→ `typeDraft`（textarea 值拼接 + input 事件走生产 TextAreaEditorKernel + setSelectionRange + actions.apply）→ `undo/redo`（actions 真实按钮路径）。**所有选区断言按内容锚点（前后字符/textBetween/独立 findText 重推）判定，不写死偏移数字**；实测值记录如下仅作观测：

| 步骤 | 结果 | 实测观测值（内容锚点重推一致） |
| --- | --- | --- |
| 1 放置光标（🎯 后） | PASS | PM (32,32) |
| 1 进入源码 | PASS | textarea 33/33 forward；前字符 🎯、后字符 。，map ok、snapped=[]（精确） |
| 2+3 键入「锚点」+提交 | PASS | 字节 sha == after-step-2.md；dirty=true；PM (34,34)，textBetween(32,34)=锚点；映射精确无吸附 |
| 4 跨模式 Undo | PASS | 字节 == input.md；dirty=false；PM (32,32) 回到 🎯 后 |
| 5 Redo | PASS | 字节 == after-step-2.md；dirty=true；PM (34,34) 回到锚点后 |
| 6（补充）后向选区 | PASS | PM anchor 35>head 32；textarea 33..36 **backward**，head 侧 🎯|锚点、anchor 侧尾字符 。，映射精确 |
| 6（补充）Cancel | PASS | PM (35,32) 原样保留，textarea 重置为可信原文 LF 文本 |

## check.mjs 新增集成校验（jsdom + 真实 bundle）

- **CRLF+emoji 往返**（默认样稿，CRLF 文件）：进入源码后 caret 前字符 😀 后字符空格；`raw-lf 差 == 光标前 CRLF 对数（2）`——UTF-16 原文偏移与 textarea LF 偏移的差被真实兑现；键入「锚点」后 PM 选区落在 😀与锚点之间的内容锚点（textBetween 断言），Undo 同时还原字节与编辑前选区。
- **后向方向**：PM 后向选区（特殊 词）→ textarea direction=backward、两端内容锚点正确 → 以 backward 方向替换为「特别」→ apply 后 PM 仍后向且 textBetween(head,anchor)=特别；Cancel 保留原可视选区。
- **映射失败保留草稿**：光标置于受保护数学围栏内 + 同时改标题 → apply 拒绝：sourceMode 仍 true、字节/revision/past/原选区全部不变、草稿保留、原因含「受保护块」；移到安全锚点重试即成功且选区落内容锚点（修复入口可达）。
- **无文本锚点最小反例（预审修复 2 证据）**：缓冲 `$$\na = 1\n$$\n\n$$\nb = 2\n$$\n`（两个保护块、无任何文本叶），源码光标置于**第二个**围栏内并将 `b = 2` 改为 `b = 3` 后提交：提交成功（字节 = 修改后原文）、dirty=true、revision+1、past=1、无 pending；选区为 **NodeSelection**（toJSON type 'node'、node.type.name 'protected_block'、from == 第二块 ranges[1].pos，即 owner 判定正确而非块 0、非文本光标重置）；`lastSelectionMap = { ok:false, noTextAnchor:true, fallback:'node-selection@…' }`。**该项记录为"文本选区映射不支持"，不判通过**；同场景进入源码的映射失败（enter-source ok:false）不阻断入口。
- **草稿历史守卫（预审修复 1 证据，真实 UI actions）**：①「草稿已修改且无 past」：进入源码改草稿（input 事件）后点 Undo——拒绝执行：sourceMode 仍 true、**DOM textarea 值逐字保留**（不是仅存在于变量）、字节/revision/past 不变；Redo 同；显式 Cancel 后正常离开且可信内容未变。②「映射失败后」：apply 因光标在保护块内失败后（已有 committed history：past=1）点 Undo/Redo——同样拒绝且草稿保留、历史栈不动；Cancel 退出。
- **BOM 缓冲**：openMixed 后 caret 精确映射（前字符 留 后字符 。），BOM 字节在草稿中保留。
- **pending 修复与 Undo 不丢输入**：malformed → pending（缓冲保留）→ repair → Undo 逐字节回到含混缓冲且 pending 恢复（用户输入在共享历史中，选区随快照还原）→ Redo 回可信字节。
- **no-op**：源码 no-op 往返同时保持选区不变（扩展既有断言）。

## 已知边界与未支持项（如实声明）

1. **jsdom 与浏览器的 textarea 差异**：jsdom 31 对 `.value` 赋值会把光标重置到末尾、方向归 `none`（Chrome 行为类似但未实测）；程序化重放因此在改值后显式 `setSelectionRange`。真实 WKWebView 未验证。
2. **模块边界继承 006**：顺序贪心对齐不是完整 source map；转义/实体/规范化差异、重复叶歧义、受保护块内部均拒绝；吸附是有说明的近似。集成只是消费这些语义，未扩大保证范围；selection-check 15 项仅是模块级证据。
3. **无文本锚点文档的选区为 NodeSelection 回退**，属可见整块锚点，**不是文本选区映射通过**；该类文档的文本级映射保留为不支持项。
4. **语义相同的提交保留原选区**（08 契约），此时用户在 textarea 中移动过的光标不覆盖 PM 选区；note 明示。
5. **history 仍为原型共享快照**：无 prosemirror-history typing/composition 分组；草稿内文本级撤销未实现（生产 kernel 无 undo API，守卫以"拒绝并保留草稿"替代丢弃）；真实 WKWebView、系统中文输入法、IME 组合期、磁盘保存/重开不在本轮，jsdom 结果不构成 UI/IME 验收。
6. **09 支持矩阵**：manifest 步 1–5 全部为 jsdom 级 PASS（含方向与内容锚点）；不能据此宣告 M0 或 UI/HITL 通过。

## 复现

```sh
# 前提：editor/node_modules 指向主 repo 锁定依赖（临时链接，勿提交）
make -C editor/prototypes/fidelity test
node editor/prototypes/fidelity/crossval.mjs [样稿目录]
node editor/prototypes/fidelity/selection-check.mjs [样稿目录]
```
