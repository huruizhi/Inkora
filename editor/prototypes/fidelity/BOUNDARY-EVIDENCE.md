# BOUNDARY-EVIDENCE：保护片段边界与含混输入门槛（INK-PROT-005）

日期：2026-11-08。基线 `6924935`（产品起点仍为 `57aeaac`）。修改范围仅 `editor/prototypes/fidelity/`，未改生产 `src/app` 与独立样稿。本轮只处理独立样稿 case02 与 case10；03/05/06/09/11 等其它失败项保持原状。

## 一、修改前的最小失败（基线复现）

命令与实际输出（修改前，`node editor/prototypes/fidelity/crossval.mjs`）：

| 用例 | 基线结果 |
| --- | --- |
| 02-protected-whitespace | `load: "blocked: 公式边界不明确：保留可信视图并阻断保存"` — 整个用例无法载入，3 步全部未执行 |
| 10-malformed-boundary / open-malformed | 同上，打开即抛错，无法显示 |
| 10-malformed-boundary / create-ambiguity 步2 | `ERROR: visual blocked: Error: 公式边界不明确…` — 用户的 `$$` 行输入被直接拒绝，缓冲区保持步1 字节 |

根因（`model.ts` 原 parse）：
1. 任一块内出现 `analyzeMarkdownSafety` 的 math 风险（含行内 `$x$`）即要求整块匹配 `^\$\$\n…\n\$\$$`，HTML 注释里的字面量 `$x$` 也触发，02 载入即抛错；
2. 注释、callout、脚注引用块没有保护分支，callout 落入「不支持的语法边界」；
3. `[^1]:` 定义行被 markdown-it 当作引用定义吞掉（无 token），而 `cleanGap` 的标签字符类排除 `^`，导致「存在无法归属的原文范围」；
4. parse 对一切边界含混只有抛错一条路：打开即失败或编辑被整体拒绝，无法保留用户输入。

## 二、修改后的行为契约

### 1. 稳定片段与正文混排（复用生产 protected_block，无新依赖）

按顶层 token 的精确行范围识别，所有权明确、不吞并相邻正文（`parse` 内逐分支）：

| 分支 | 条件 | 结果 |
| --- | --- | --- |
| 块级数学围栏 | 注释遮蔽后的 raw 匹配 `^\$\$\n[\s\S]*\n\$\$$` | `protected_block(raw, metadata)`，原字节保留 |
| Mermaid 围栏 | fence token + info=mermaid 且闭合 | 同上 |
| HTML 注释/标签 | raw_html 风险（`<!--…-->` 等） | 整 token 原文保留；**内部 `$x$`、`[[bad` 等按字面量处理**（先做等长遮蔽再做数学判定） |
| callout / 脚注 | obsidian_callout 或 footnote 风险 | 整 token 原文保留 |
| 表格 / wiki | 生产 `parseProtectedMarkdown` | kind=table/wiki（既有行为） |
| 任务列表 | 仅 task_list 风险 | 生产 `parseMarkdown`（既有行为） |
| 脚注定义行 | `[^1]: …` 被 tokenizer 吞为引用定义 | 计入「原文间隙/引用定义」，字节保留（`cleanGap` 标签类允许 `^`） |

代码围栏/行内代码内的 `$$` 等由生产 `protectedMask` 遮蔽，不触发数学判定（既有行为，未改）。

### 2. 畸形/含混打开不失败（Issue + 保守投影）

- `parse` 不再为边界含混抛错，返回 `{ doc, ranges, issues }`；无闭合 `$$`、非围栏形态行内 `$…$`、未闭合 Mermaid/代码围栏均产出 `Issue{code,start,end,message}`，该 token 变为原文保留的 `protected_block` 并在 UI 以红框标注（`protected-issue`）。
- 其余正文（标题、段落）正常可视呈现；打开不置 dirty；结构化保存被拒（`保存阻断：边界含混待修复`）。
- 仍会抛错的是「不支持的语法边界」（gfm_autolink 等，case03 现状不变）与「无法归属的原文」，与上一轮一致。

### 3. 编辑中制造含混：保留输入 + pending（`commitPending`）

- 可视模式提交产生含混候选时，不再拒绝该次输入：缓冲区保留用户实际输入字节（含 `$$` 行），PM 视图切换为该缓冲的保守投影（普通段落照常可视、问题片段原样标注），进入 `pending` 状态；`blocked` 保持为空（操作成功）。
- 结构化保存阻断；`dirty` 如实保留；历史快照照常入栈（可 Undo）。
- pending 期间：片段前后普通正文仍可继续编辑（再次 commitPending，投影更新）；问题片段内无文本叶，`sourcePosition` 拒绝映射，需走主动源码。
- 恢复一致性两条路：主动源码修复后有效提交（`commitClean`，pending 清除、保存恢复资格）；或 Undo（`travel` 重算 issues，字节与 PM 文档一起回到可信快照）。`repair` 演示按钮提交最近一次可信快照 `model.trusted`。

### 4. 可信投影 / 缓冲 / 保存资格的三分显示

状态栏与新增「边界含混问题（pending · 保存资格）」面板区分：可信投影（当前 PM 文档）、当前缓冲原文（`before/after/diff` 面板）、保存资格（`pending` 或 `blocked` 或源码草稿时禁用保存按钮并给出原因）。

## 三、实际验证证据

```sh
node editor/prototypes/fidelity/build.mjs        # PASS，重建 PROTOTYPE.html
make -C editor/prototypes/fidelity test          # PASS：tsc 严格检查 + check.mjs 21 项（原 15 + 新 6）
node editor/prototypes/fidelity/crossval.mjs     # 02/10 全过；01/04/07/08/09 保持通过；03/05/06/11 保持既有失败
make lint PNPM=…                                 # PASS（swift-format + 生产 tsc）
make test-editor PNPM=…                          # PASS：9 文件 111 项现有测试
```

### case02（打开/保存/两处正文编辑，逐字节）

| 步骤 | 结果 | sha256（缓冲 == 样稿预期） | 片段原字节 |
| --- | --- | --- | --- |
| 载入 | ok（真实 `openMixed` 按钮；内嵌样稿与样稿文件逐字节一致） | `2ff17efe…4f802` | — |
| 1 保存（无修改） | PASS | 同输入 | `fragsKept: true` |
| 2 视觉改第一段 | PASS | `1b90bc33…09a8` | `fragsKept: true` |
| 3 视觉改末段 | PASS | `5a98211…726f` | `fragsKept: true` |

投影结构 `heading,paragraph,protected_block×3,paragraph`：数学围栏、注释（含字面量 `$x$`/`[[bad`）、脚注引用+行尾双空格、callout 均为保护片段；BOM/制表符/双空行原样。载入即无 pending，保存可用（不因高级语法整篇回退源码）。

### case10 open-malformed

| 步骤 | 结果 | 关键记录 |
| --- | --- | --- |
| 1 打开观察 | PASS（口径观察项） | issues=[math@第5行, UTF-16 19..36]；docTypes=heading,paragraph,protected_block；未整篇切源码（sourceMode=false）；dirty=false；保存禁用；DOM 存在 `protected-issue` 标注；标题/正文可视渲染 |
| 2 未修改保存 | PASS（blocked path; nothing written） | 保存被拒「保存阻断：边界含混待修复（math）」；缓冲与内存保存点 sha 均保持输入 `794a3df…0aea` |
| 3 源码补 `$$` + 保存 + 重开 | PASS | 缓冲/保存点 sha `1bce610…faaa` == `malformed-after-step-3.md`；pending 清除；内存基线重开：issues=0，`heading,paragraph,protected_block`，数学片段 raw 精确为 `$$\n\int_0^1 x\,dx\n$$` |

### case10 create-ambiguity

| 步骤 | 结果 | 关键记录 |
| --- | --- | --- |
| 1 正文替换 | PASS | sha `e9650f3…896e` == `valid-after-step-1.md`；数学片段逐字节保留 |
| 2 视觉插入 `$$` 行（含混） | PASS | **缓冲 sha `84191d9…9bcb` == `valid-buffer-after-step-2.md`（用户输入保留）**；pending=true(math)；保存禁用；dirty=true；投影仍含 heading/paragraph/protected math |
| 3 主动源码删 `$$` 行 + 保存 | PASS | sha 回到 `e9650f3…896e` == `valid-after-step-3.md`（== 步1 字节）；pending 清除、保存恢复 |
| 4 备选路径（追加闭合 `$$`） | OBSERVED | 插入后 pending=true；追加 `$$` 后 pending=false，尾段被归类为**已闭合数学围栏**整段进入 protected_block（投影 heading,paragraph,protected_block×2），保存资格恢复——「尾段被吞入数学片段」如实记录 |

check.mjs 新增 6 项（总 21）覆盖同一契约：`malformed → pending`（缓冲保留+保存阻断+DOM 标注）、`undo / repair restore consistency`、`mixed sample open`、`mixed body edits keep fragment bytes`、`visual ambiguity → pending/undo`（pending 中正文仍可编辑、Undo 字节级恢复）、`malformed open` 与 `malformed source fix + save + reopen`。

## 四、case10 的磁盘概念说明

样稿 `to_disk: true` 语义在本原型只用**内存基线**模拟：`actions.save` 建立内存保存点（`model.saved`），「磁盘文件保持 X 字节」以 `model.saved` sha 近似，「未写盘」以保存被拒且 `saved` 不变近似。未执行真实文件系统写、重开与冲突路径。

## 五、反例与保守行为（如实记录，未用其它输入替代）

- 行内 `$…$`（非围栏形态）出现在普通段落：整 token 原文保留 + pending + 保存阻断（保守，不伪造渲染）。含两个 `$` 的普通文本会被同等对待。
- `$$\n$$` 空围栏、blockquote 内 `> $$` 等非精确围栏形态：判为含混（issue），不猜测边界。
- 03（gfm_autolink）、05（marks/定界符重写）、06/11（单换行 split）、09 步1/3（选区映射）保持上一轮失败/现状差异，本轮未处理。
- 保护片段内编辑仍不支持（无文本叶映射），需主动源码；pending 期间问题片段同样只读。

## 六、未执行项

真实 WKWebView、系统中文输入法/composition、真实磁盘保存与重开、App Sandbox、用户 HITL 审阅；06/11 的样稿语义审计不在本轮。以上均不因本轮结果视为通过，M0 全门槛仍未通过。
