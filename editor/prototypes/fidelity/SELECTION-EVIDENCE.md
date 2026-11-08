# SELECTION-EVIDENCE：INK-PROT-006 双向选区映射模块

日期：2026-11-08。基线：`692493508d4b5ac78f0b212045aae32a8b59b90e`（本分支起点）。样稿：INK-PROT-004 worktree 固定提交 `484ee81d924efd2a1038e8421b146f4ae5d5b743`，只读，未改任何预期。本模块在本文撰写时**未被 main.ts/model.ts 引用**；INK-PROT-010 已将其接入 main.ts 源码往返与历史，接线结果与对本文档失败策略建议的纠正见 `INTEGRATION-SELECTION-EVIDENCE.md`。

## 交付物与坐标系

- `selection-map.ts`：纯函数模块，无 DOM/全局状态/模型副作用，导出：
  - `visualToSource(source, doc, ranges, anchor, head)`：PM 选区（anchor/head doc 位置）→ canonical 原文 UTF-16 偏移（anchor/head）。
  - `sourceToVisual(source, doc, ranges, anchor, head)`：原文 UTF-16 偏移 → PM doc 位置。两个方向都独立映射两端，**保留选区方向**（后向选区 anchor>head 原样保持）。
  - `lfText / rawToLf / lfToRaw`：textarea LF 规范化文本 ↔ canonical 原文（CRLF/CR/LF 与生产 `TextAreaEditorKernel` 同一清单）的偏移换算。
  - 返回 `{ ok: true, anchor, head, snapped[] }` 或 `{ ok: false, reason }`；吸附动作必须出现在 `snapped` 说明里，绝不静默；无法安全映射时失败并给理由，绝不盲取第一次出现或重置到文档头。
- `selection-check.mjs`：证据脚本。复用锁定 Vite 将 `selection-map.ts + model.ts`（含生产 schema/parser/保护块逻辑）打包为临时 ESM bundle 在 Node 直接运行，结束自动删除临时产物（`.tmp-selection-entry.ts`、`.tmp-selection-build/`）。
- 坐标系口径（不混用）：PM doc 位置 = UTF-16 单元（代理对占 2）；原文偏移 = UTF-16 单元（含 BOM/CRLF 字节）；LF 偏移 = 规范化文本内 UTF-16 单元，仅换行折叠。UTF-8 字节偏移不参与映射（仅 diff 展示用）。

## 实际命令与结果（全部真实执行）

```sh
ln -s /Users/rayhu/Documents/projects/Inkora/editor/node_modules editor/node_modules   # 临时链接，结束时已删除
printf '{"extends":"../../tsconfig.json","compilerOptions":{"skipLibCheck":true},"include":["selection-map.ts","model.ts"]}' > editor/prototypes/fidelity/.tmp-tsconfig.selection.json
cd editor/prototypes/fidelity && ../../node_modules/.bin/tsc -p .tmp-tsconfig.selection.json   # PASS（严格模式类型检查，含 model.ts），临时配置已删除
node editor/prototypes/fidelity/selection-check.mjs    # PASS：15 项，exit 0
```

环境：Node v26.13.0，主 repo 锁定依赖（Vite 8.3.6 工具链）。未执行 `make setup`，未安装任何新依赖。未运行 UI（jsdom 亦未用：本脚本直接在 Node 导入真实 PM/parser 代码路径）。

## 样稿 09「🎯之后进入源码→插入锚点→返回可视→Undo/Redo」位置约束（全部通过）

输入 `input.md`（148B，sha256 `12eac0af…`），预期 `after-step-2.md`（154B，sha256 `97f92fdf…`）；预期字节只在计算完成后比对，从不喂入模型或模块。

1. **步1（visual→source，🎯 内容锚点）**：光标置于第一段 🎯 之后（PM pos 32）。映射得原文偏移 33；`source[31:33]='🎯'`、`source[33]='。'` 精确落在两者之间，无吸附。**UTF-16 偏移 33 ≠ 标量偏移 32**：按标量数会把光标落进 emoji 内部——本模块全程按 UTF-16 计算，实测值即反例证明。
2. **方向保持**：前向选区 (33,34) 与后向选区 anchor=34>head=33 双向折返均还原为同一对 doc 位置；引用块（41）与任务列表（59）内选区同样精确折返。
3. **步2（源码编辑、语义与长度变化）**：在映射偏移 33 处插入「锚点」（+2 UTF-16 单元）后经真实 `model.sourceEdit` 提交，缓冲区 sha256 == `after-step-2.md`；`sourceEdit` 返回 `false`（语义变化），**模型现状将选区重置到 (1,1)**——这就是本模块要填的缺口。
4. **步3（source→visual，新文档锚点）**：textarea 侧光标原文偏移 35 映射到新 PM doc 位置 34；与独立定位（搜索新文本 `🎯锚点` 之后）完全一致，`doc[32:34]='锚点'`、`doc[34:35]='。'`，无吸附。现状默认 (1,1) ≠ 34，证明缺口被模块结果闭合（集成接线仍待做）。
5. **步4/5（跨模式 Undo/Redo）**：脚本按集成方式 `model.select(34)` 后走真实 `model.travel`：Undo 缓冲区字节回到 `input.md`（dirty=false）且**选区回到 🎯 之后 (32,32)**；Redo 字节回到 `after-step-2.md`（dirty=true）且选区回到「锚点」之后 (34,34)。

## 其余真实计算校验（10 项，均通过）

- **BOM/CRLF/emoji/组合字符折返**（构造样稿，真实 parser）：`\uFEFF# 标题 😀\r\n\r\n段落一 e\u0301 与 🎯。\r\n\r\n> 引用文字。\n\n正文 *强调* 段落。\n` 两方向、含后向选区（anchor>head）折返全部还原为相同 doc 位置对 (35,19)/(19,25)，全部精确无吸附。
- **LF↔raw 偏移换算**：全部 50 个偏移逐一折返（`lfToRaw(rawToLf(x))`）；4 个 CRLF 对各折叠 1 单元；CRLF 中间偏移（raw 9）按行尾处理（lf 8，回到 raw 8）。
- **长度变化的 CRLF 多行插入**：在「尾段」后插入 `新行\r\n插入`（raw +6 / LF +5 单元）→ 新段落 softbreak 在 PM 文本中为 `\n`，光标映射到「插入」与「。」之间（doc 13），精确命中且 LF↔raw 折返一致。
- **重复文本跨块区分**：段落与块引用含相同「同文。」，两处分别映射到 0 与 10 并折返还原；按整文档首次出现会混淆。
- **重复文本块内 + marks 边界**：`[锚点](…) 与 *锚点* 尾` 中「锚点」重复：选区落在第二处（强调叶内部，doc 7）时基线 `sourcePosition` 拒绝（「选区不能安全映射到原文（空段、转义或重复文本）」），本模块顺序对齐映射到第二处原文 34 并折返；相邻 marks 叶共享边界位置时确定性地取左叶末尾（32，紧邻 `*` 定界符），不抛「多个原文映射」。
- **转义拒绝**：`3 \* 4 与 \* 5` 的叶文本 `3 * 4 与 * 5` 与原文（含 `\*`）无法对齐，两个方向均 `ok:false`，理由含「转义」。
- **保护块拒绝**：`$$…$$` 块内偏移 `ok:false`「受保护块…没有可视文本锚点」。
- **块间空白/文件尾吸附**：块间空行偏移与 EOF 偏移均吸附到前一块内容末尾（doc 3 / doc 9）并在 `snapped` 中注明；反向映射该内容末尾是精确命中（偏移 2），与吸附落在同一内容锚点。
- **BOM/语法前缀吸附**：偏移 0（BOM）与偏移 2（`# ` 内）分别带说明吸附到标题内容起点（doc 1）。

## 已知边界与未支持项（如实声明）

1. **对齐是顺序贪心 + 前向/后向一致校验，不是完整 source map**：文本叶必须在所属顶层块原文中按文档顺序可定位且前向、后向两种贪心结果一致。转义（`\*`）、实体、规范化差异直接失败；理论上存在两种贪心恰好一致但对齐错误的病构输入（如成对重复且定界符对称），未构造出真实 parser 可产生的实例，不宣称免疫。
2. **吸附是有记录的近似，不是精确映射**：块语法前缀（`#`、`>`、列表标记、围栏）、行内定界符区间、块间空白/引用定义、CRLF 中间、文档头 BOM/空白、EOF。全部在 `snapped` 返回说明；集成方可以选择拒绝而非接受。
3. **失败即失败**：受保护块内部、空文本块、越界偏移、重复叶歧义均 `ok:false`，不猜。空段失败路径无真实 parser 输入可触发（parser 不产生空段落），该分支未经真实文档验证。
4. **lone `\r` 行尾**：换算函数与 kernel 清单一致地处理，但 model `parse` 的范围归一只处理 `\r\n`，含 lone `\r` 的文档会在 parse 层失败，未单测。
5. **未验证/未集成**：main.ts 尚未接线（进入源码模式时用 `visualToSource` 设 textarea 光标、`sourceEdit` 后用 `sourceToVisual` 恢复选区、undo/redo 维持映射选区——证据脚本已按此流程用模型公开路径模拟并全通过）；prosemirror-history 分组、WKWebView、系统中文输入法、IME 组合期边界、真实磁盘保存全部不在本轮。Node/jsdom 结果不构成 UI/IME 验收。（INK-PROT-010 更新：main.ts 已接线，见 `INTEGRATION-SELECTION-EVIDENCE.md`；其余未验证项维持不变。）
6. **步骤1/3 的 operational 判据**：本模块满足了 09 步1/3 的位置约束（数值见上），但原型 UI 未接线，用户尚不能在实际界面观察到；CROSS-VALIDATION 中 09 的「选区映射现状差异」在 UI 层面仍未消除。（INK-PROT-010 更新：已接线并在 jsdom 层消除该现状差异，见 `INTEGRATION-SELECTION-EVIDENCE.md`；WKWebView/IME 仍未验证。）

## 后续集成步骤（建议；已被 INK-PROT-010 实施并纠正）

> **INK-PROT-010 纠正**：下条第 2 点原文写「失败则回退现状重置并在 UI 说明理由」——该策略**错误**，实现时未采用。用户明确要求不静默重置光标、不丢选择：`sourceToVisual` 失败时提交不执行，源码草稿/可信原文与视图/原可视选区全部保留并给出具体原因，用户可移动到安全锚点后重试或取消；仅当新文档完全无文本锚点（纯保护块）时才按既有规则提交并明示原因（保证主动修复入口可达）。吸附均为有说明的近似，不称精确映射。实际接线与证据见 `INTEGRATION-SELECTION-EVIDENCE.md`。

1. 进入源码模式：`visualToSource(model.source, model.state.doc, model.ranges, sel.anchor, sel.head)` → `rawToLf` → 设置 textarea selectionStart/End（失败则保持现状并提示，不重置到头）。
2. 源码提交（`sourceEdit`）：textarea 偏移 → `lfToRaw` → 对新 (source, doc, ranges) 调 `sourceToVisual` → 用映射结果创建/修正 EditorState selection（失败则回退现状重置并在 UI 说明理由）。
3. Undo/Redo：travel 恢复的状态已携带映射选区（本轮步4/5 已验证机制），需确认历史分组票的方案不覆盖 selection。
4. 集成后重跑 `crossval.mjs` 的 09 用例，将步1/3 判据从「现状差异」更新为实测结果。

## 复现

```sh
# 前提：editor/node_modules 指向主 repo 锁定依赖（临时链接，勿提交）
node editor/prototypes/fidelity/selection-check.mjs [/path/to/fidelity-cases]
```
