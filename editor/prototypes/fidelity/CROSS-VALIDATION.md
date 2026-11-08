# CROSS-VALIDATION：INK-PROT-005 原型 × INK-PROT-002 独立样稿

交叉核验日期：2026-11-08（本轮为 INK-PROT-010 选区接线轮复测，原型基线 `7fe11b3`；产品起点仍 `57aeaac`）。样稿：`ink-prot-002-fidelity-cases` worktree（固定 `c85e1890b2ef3938dd6853d97977d28ac54b309e`），只读，未做任何修改；样稿预期与语义判定未被修改。02/10 的修改前后对比与行为契约详见 `BOUNDARY-EVIDENCE.md`；09 的选区接线证据详见 `INTEGRATION-SELECTION-EVIDENCE.md`。

## 方法与命令

- 样稿完整性：`python3 editor/prototypes/fidelity-cases/verify.py` → **通过（11 例 / 43 步 / 508 项，0 失败）**，仅证明样稿自身一致。
- 原型核验：`node editor/prototypes/fidelity/crossval.mjs`（jsdom 加载真实 bundle；jsdom 不是 WKWebView，不宣称 UI/IME 验收）。驱动入口全部为原型真实路径：
  - 打开（02/10-open）：真实按钮 `actions.openMixed` / `actions.openMalformed`（内嵌样稿须与样稿文件逐字节一致，否则记 mismatch）；
  - 可视文本编辑：`p.view.dispatch(真实 PM 事务)`（与 check.mjs 原生路径一致）；含混提交后记录 pending/保存资格/投影结构；
  - 源码编辑：真实 UI 路径 `actions.source → textarea 赋值 + input 事件（生产 TextAreaEditorKernel 还原 CRLF/LF）→ actions.apply`；
  - 历史/保存：`actions.undo / redo / save`（内存保存点，无文件系统）。
- 05 步1（真实 `removeMark` 事务）与步2 的独立复跑（绕开步1 失败对缓冲的污染）使用同一入口的补充脚本执行，结论已并入下表；提交版 `crossval.mjs` 保留可复现的主序列。
- 判定：每步结束对 `model.source`（缓冲区全文）取 sha256，与样稿 `after-step-N.md`（或 `state-ref` 所引文件）字节比对。**预期字节从不喂入模型**；02/10-open 载入用例后仅清空历史数组建立干净基线（记录于此，不隐瞒；02/10-open 本轮走真实打开按钮，构造函数基线本身干净）。`fragsKept` 表示保护片段原文与载入时逐字节一致（片段集合变化属预期，见 10 的归类记录）。
- "保存"为内存保存点；`to_disk` 语义在原型中只能以缓冲区字节 + `dirty`/保存点状态近似，未验证真实磁盘写。case10 的「磁盘文件保持 X 字节」以 `model.saved` sha 近似。

## 结果总表

| 用例 | 载入 | 通过 | 失败/阻断 | 未执行 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 01 中文/emoji 替换 | ok | 步1–3（byte-exact）+ 步4 观测 | 无 | 无 | **通过** |
| 02 保护片段空白（BOM） | ok（真实 `openMixed` 按钮，内嵌字节==样稿文件） | 步1–3 全部（byte-exact + `fragsKept`） | 无 | 无 | **通过**（本轮修复：注释/callout/脚注/围栏混排，注释内 `$x$` 按字面量） |
| 03 引用式链接 | **blocked**（不支持的语法边界：gfm_autolink） | — | 全部 | 步1–3 | 失败：原型无法打开该样稿（本轮未处理） |
| 04 任务切换（CRLF/无尾换行） | ok | 步1–2（byte-exact） | 无 | 无 | **字节通过**；交互为列表内文本事务，无 checkbox 控件（现状差异） |
| 05 marks/attrs | ok | — | 步1（阻断）、步3（阻断）、步2（见注） | 步4 | 失败（本轮未处理） |
| 06 split/join（CRLF） | ok | — | 步1、步3（阻断） | 步2、步4 | 失败（本轮未处理） |
| 07 Undo/Redo 粒度 | ok | 步1–6 全部（含 dirty 状态） | 无 | 无 | **通过** |
| 08 源码改格式 dirty | ok | 步1–3 全部 | 无 | 无 | **通过** |
| 09 源码往返选区 | ok | 步1–5 全部（byte-exact/state-ref + 选区内容锚点与方向，本轮 INK-PROT-010 接线）+ 补充后向/Cancel | 无 | 无 | **通过（jsdom 级）**；旧「09 字节 PASS」不再冒充选区通过——步1/3 现为真实选区断言 |
| 10 open-malformed | ok（真实 `openMalformed` 按钮） | 步1（打开观察：含混标注/不切源码/不置 dirty）、步2（保存阻断且零写入）、步3（源码修复 byte-exact + 内存基线重开） | 无 | 真实磁盘写/重开 | **通过（磁盘仅内存基线模拟）** |
| 10 create-ambiguity | ok | 步1–3 全部（含步2 含混缓冲 byte-exact 保留 + pending/阻断）、步4 归类 OBSERVED | 无 | 真实磁盘写 | **通过**（步4 记录：追加闭合 `$$` 后尾段被归入已闭合数学围栏整段保护，保存资格恢复） |
| 11 混合 EOL 插入 | ok | — | 步1、步2（阻断） | 无 | 失败（本轮未处理） |

## 通过项明细（实际字节证据）

- **01 步1–3**：`原文字节→原始字节`、ZWJ 家庭 emoji（25B/14 UTF-16 单元）→ `🧑‍🤝‍🧑`、`🇨🇳→🇯🇵` 三步后缓冲区 sha256 分别等于 `after-step-1/2/3.md`；标题、另一 emoji、两种重音（预组合 `café` 与分解 `cafe+U+0301`）及全部换行逐字节保留（步4 观测，由整文件 sha 相等证明）。
- **02 步1–3（本轮修复）**：真实打开按钮载入后内嵌样稿与 `input.md` 逐字节一致（359B，含 BOM）；无修改保存 sha == 输入；第一段「逐字节保留→逐字节不变」与末段「收尾段落包含→结束段落包含」两步 sha 分别等于 `after-step-2/3.md`，且每步 `fragsKept: true`——数学围栏 `$$\nE = mc^2\n$$`、注释（内含字面量 `$x$` 与 `[[bad`）+脚注引用行（含行尾双空格）、callout 两个引用行全部原字节保留；`[^1]:` 脚注定义行作为引用间隙保留；投影结构 heading,paragraph,protected_block×3,paragraph，不整篇源码。
- **04 步1–2**：`[ ]→[x]` 与 `[X]→[ ]` 各只改 1 字符，sha 等于 `after-step-1/2.md`；全文保持 CRLF 且无尾部换行。
- **07 步1–6**：两次编辑、逐次撤销×2、重做×2，缓冲区 sha 逐步等于 `after-step-1/2/1/input/1/2.md`；undo 粒度未合并；回到输入时 `dirty=false`，其余步 `dirty=true`。
- **08 步1–3**：无修改源码往返为 no-op（字节/dirty/revision/history 均不变）；`*星号强调*→_星号强调_` 经真实 textarea 草稿路径提交后 sha 等于 `after-step-2.md` 且 `dirty=true`；跨模式撤销回到输入字节且 `dirty=false`。
- **09 步1–5（本轮 INK-PROT-010 选区接线）**：全部经真实路径重放——`pmCaret`（PM 事务置光标于 🎯 后）→ `actions.source`（textarea 光标落在 🎯 与 。之间，方向保持，映射精确无吸附）→ textarea 真实键入「锚点」（input 事件走生产 TextAreaEditorKernel）→ `actions.apply`（字节 sha == `after-step-2.md`，PM 光标回到「🎯锚点」与「。」之间的内容锚点，dirty=true）→ Undo（字节回 `input.md`、dirty=false、光标回 🎯 后）/Redo（字节回 `after-step-2.md`、dirty=true、光标回锚点后）。选区断言全部按内容锚点（前后字符/textBetween/独立 findText）重推，不写死偏移；补充步骤验证后向选区方向（PM 35>32 ↔ textarea backward 33..36）与 Cancel 保留原可视选区。旧口径「步2/4/5 字节通过、步1/3 未执行」作废。
- **10 open-malformed 步1–3（本轮修复）**：打开不再抛错——issues=[math@第 5 行，UTF-16 19..36]，投影 heading,paragraph,protected_block（问题片段红框标注），`sourceMode=false`（未整篇切源码），`dirty=false`，保存按钮禁用；未修改保存被拒（「保存阻断：边界含混待修复（math）」），缓冲与内存保存点 sha 均保持输入 `794a3df…0aea`；主动源码在 `\int_0^1 x\,dx` 行后补 `$$` 后 pending 清除，保存点 sha `1bce610…faaa` == `malformed-after-step-3.md`；以内存基线重开（`new FidelityModel(saved)`）：issues=0、数学片段 raw 精确 `$$\n\int_0^1 x\,dx\n$$`、正文可继续编辑。
- **10 create-ambiguity 步1–3（本轮修复）**：步1 正文替换 sha == `valid-after-step-1.md`，数学片段逐字节保留；步2 视觉插入 `$$` 行不再被拒绝——**缓冲 sha `84191d9…9bcb` == `valid-buffer-after-step-2.md`（用户输入保留）**，pending=true(math)、保存禁用、dirty=true、投影仍含可信标题/正文/数学片段；步3 主动源码删除该行后 pending 清除、保存恢复，sha 回到 `e9650f3…896e` == `valid-after-step-3.md`。步4（OBSERVED）：重建含混后在文末追加 `$$`，pending 消失，尾段被归类为已闭合数学围栏整段进入 protected_block（投影 heading,paragraph,protected_block×2），保存资格恢复——如实记录「尾段被吞入数学片段」的实际归类。

## 失败/阻断/未执行项（最小反例）

- **03 无法打开**：`不支持的语法边界：gfm_autolink`（样稿含裸地址自动链接）。引用式链接本体（步1）因此未执行。失败；本轮未处理（不在任务范围）。
- **05 步1（去加粗）**：真实 `removeMark` 事务被原型按设计阻断（`结构/marks 事务需使用专用演示操作`），字节保持但目标不可达 → 失败（原型明确不支持通用 marks 移除；本轮未处理）。
- **05 步2（标题 2→3）**：独立复跑（绕过已失败的步1）时 `##→###` 补丁正确提交（+1 `#`、重解析等价、字节按其缓冲正确）；但样稿预期 `after-step-2.md`(197B) 建立在步1（-4B）之上，本例序列整体判失败。步2 的标题机制本身未见字节错误。
- **05 步3（行内代码插反引号）**：`行内代码` 在文档中出现多次，`选区边界有多个原文映射` → 阻断。原型无定界符重写（`` ` `` → ```` `` ````）能力，即使映射成功也不会产出预期字节 → 失败。
- **05 步4（围栏 info python→swift）**：原型无 code_block attrs/info 编辑入口 → 未执行（unsupported）。
- **06 步1/3、11 步1/2（单换行 split）**：`model.apply` 以单换行补丁+真实 `tr.split` 提交时，重解析等价检查失败（单 `\n`/`\r\n` 在 CommonMark 下仍是同段软换行，无法与两个 PM 段落等价），原型拒绝提交、缓冲字节保持不变（`补丁重解析与目标 PM 文档不一致`）。样稿预期单换行拆分 → 判失败；受影响的 join 步骤（06 步2/4）随之未执行。本轮未处理。
- ~~**09 步1/3（operational 选区映射）**~~：已于 INK-PROT-010 消除——进入源码映射光标、提交后映射回新文档、Undo/Redo 恢复内容锚点与方向，全部为 jsdom 级真实断言通过（见上）；WKWebView/IME 仍不在范围。
- **边界保守反例（本轮新增，如实记录）**：行内 `$…$`（非围栏形态）与含两个 `$` 的普通文本按含混处理（片段原样保留 + pending + 保存阻断）；`> $$`、`$$\n$$` 空围栏等非稳定形态同理。未用其它输入替代或放宽判定。

## 结论

本轮实际驱动 12 个变体中的 12 个：8 个用例/变体在其可执行范围内全部通过（01、02、04、07、08、09、10-open、10-create；10 的磁盘语义仅内存基线模拟；09 本轮升级为选区级通过）；03 仍无法打开（gfm_autolink）。05/06/11 的输出为**旧 driver 结果**（05 旧 driver 缺步 1、06/11 的动作未按审计修订重写），不构成对审计后 oracle 的判定，本轮未处理、待正确重放；其既有阻断原因（marks 移除、定界符重写、单换行拆分）见上节。**样稿预期未被修改，未用预期反哺实现。** 本交叉核验不改变「M0 全门槛未通过」的结论；jsdom 结果不构成 WKWebView/IME/磁盘保存验收。
