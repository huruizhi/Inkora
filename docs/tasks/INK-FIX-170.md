# INK-FIX-170：列表删除与空任务切换

基线 `0d6d7fd`（产品 `d4976d3` / build6）。只处理列表边界删除、空任务状态字符及空列表项归属；不扩展裸 `[ ]` 语法，不修改 source-authority。

## 诊断与最小红例

先运行 `cd editor && node scripts/prepare-renderers.mjs && node_modules/.bin/vitest run src/list-input-runtime.test.ts`。
初始4项2红：`上\n\n- a` 的首字符前 Backspace，PM selection 6，及 `- a\n- b` 的第二项首字符前 Backspace，selection 8，均保持原文但 `unresolved=true/saveEligible=false`。
去掉前一段/前项后单项 `- a` 变绿，确认承重条件是边界目标不同。

先列三项可证伪假设再逐项探针：
1. listJoinPlan 无差别删除 EOL 与 marker，而 PM lift/内容 join 目标不同；按完整目标区分候选应解除拒绝。
2. structuralPlan 缺少 list lift 候选；补精确标记候选应只修 lift 场景。
3. 源位置边界错误；若保持位置而只改候选即可转绿则不是两个初始失败的原因。

捕获真实 Backspace 命令：前段例产生 replaceAround，目标为两段 paragraph；现候选误删 EOL 成为 softbreak。第二项例产生 replace，默认 joinBackward 把两个 item 变成一个 tight=true item 内的两个 paragraph；合法 Markdown 的双段 item 必须 loose，原 PM 目标不可表示。采用同域列表首段边界命令先 lift，再继续 Backspace 合并，保持完整解析核验。

标准任务逐字输入本身可生成控件，有 label 时点击/Space 可写回。但空 `- [ ]` 和 `- [ ] ` 点击失败：前者 marker regex 要求尾空格；后者已接受 PM 中首段含单个分隔空格，而 canonical 首段为空。后续加入空任务点击、键盘切换和 Undo/Redo 红例后修复。

加载含非空项与普通空项的列表，还发现空项 selection-only 无源锚点；原 ledger 仅在无文字 atom 时为普通空 textblock 补锚。新增同次 accepted list_item_open token.map 与 PM list_item 顺序/数量配对，只对所属行确为空标记的首段建立锚，不为 code/setext 前 schema 补造段落创建位置。

## 修改

- `editor/src/block-editing.ts`：listBoundaryBackspace，首段起点 lift；EOF 空段在列表之后时删除空段并回前列表尾。由168与169标题命令合成最终 Backspace chain。
- `editor/src/source-transaction.ts`：列表边界保留段落 EOL，必要时增加一条当前行 EOL，唯一候选须完整 parse.eq；EOF 空项只允许无内容或单条现有 EOL，去除唯一末空 paragraph 后完整核验；EOF 空段删除需命令 metadata、完整剩余 PM 与源尾仅 EOL 双重证明。
- 同文件 taskTogglePlan：事务必须恰好完整 PM 的该 owner 属性切换；EOF marker 允许无尾空格。单分隔空格例外仅限当前 owner 首段一个无 marks ASCII 空格、源 marker 后恰好该空格到 EOF，并分别完整证明 canonicalBefore/After。源补丁仍仅括号内一个字符。
- `editor/src/source-ledger.ts`：列表项源归属空锚，保留原普通空块回退。
- `editor/src/list-input-runtime.test.ts`：公共 runtime/DOM keydown、input handler、checkbox click/Space、Undo/Redo、caret、BOM/CRLF、加载空项、嵌套和拒绝误配/混入事务回归。

## 验证与边界

作者运行：`cd editor && node_modules/.bin/vitest run src/list-input-runtime.test.ts src/block-editing.test.ts src/container-ledger-runtime.test.ts src/tables-tasks-runtime.test.ts src/source-authority-runtime.test.ts`，5文件174项通过；`cd editor && node_modules/.bin/tsc --noEmit` 通过。

JSDOM 的 keydown 证明产品 keymap/事务与 DOM 控件接线，不能替代 WebKit 默认文字删除或事件时序。未跑 Native/WK、GUI、perf、整仓 make test/build，统一由168集成执行。没有安装依赖、触及用户文档或产生 App 副本。

风险：列表首段边界 Backspace 现在先去一级列表格式，再继续合并，行为刻意避免不可表示的 tight 双段目标。单分隔空格例外不覆盖多空格、marks 或非 EOF 的投影差异，负控要求继续拒绝；一般连续空格由169负责。裸 `[ ]` 与 code 不生成任务。复杂引用前缀内的空列表与跨保护片段结构修改保持既有保守边界，不声称全部支持。

## WebKit 后续：末字符删除的 tight 属性错误

168 集成后真实 WebKit 从 `上一段\n\n- 项目\n` 连续删除，在删完最后一个列表字符时仍被语义闸门拒绝。追加公共 runtime 最小红：`上一段\n\n- 项\n` 上仅执行 `view.state.tr.delete` 删除“项”，无需 DOM `br` 即稳定复现。记录 canonical 与请求 PM，唯一差异是列表 `tight=false` 对 `tight=true`，排除原先怀疑的 DOM hard_break 和源 EOL 映射。

根因是 `markdown-codec.ts:listIsTight` 取 list_item_open 后首个非 item_open token.hidden，空项首个 token 为 list_item_close，hidden=false，错误成为 loose。修复只扫描当前列表直接 item 的 paragraph_open.hidden，在当前列表闭合 level 停止，无 paragraph 时 tight=true；不读取嵌套列表或后邻段落，不扩大语法集合，不改会话语义闸门。

先跑新增末字符 runtime 与8项 grammar 回归，初次9项中6红；修复后9项绿。追加连续删除、lift空项、回到前段并继续删除文字的公共 runtime 回归。最终运行前述5文件另加 `src/markdown-codec.test.ts src/schema.test.ts`，7文件209项通过；`tsc --noEmit`通过。WebKit 复验仍由168管理者执行。尾换行遵循既有原文保真，不能将 PM 空段消失等同于全部尾 EOL 已删除。

## 固定审查后的容器与松散列表补正

172 Spec 独立报告两个现存缺口；本分支在修改前复现 `- a\n\n- b`、`> - b` 与引用松散变体三红。松散列表 lift 后剩下单项单段，但 PM 沿用 `tight=false`，canonical 为 `tight=true`；引用列表的完整源前缀包含 `>`，原 marker 定位只支持空格。新增回归后修复，未放宽 parse.eq。

`listBoundaryBackspace` 现在只在原列表映射范围、同父深度，将 lift 后的单项单 paragraph 剩余列表恢复 canonical tight 属性；多项/多段/范围外不改。专用 lift metadata 可规划这一带属性更新的多步事务，但仍只准 marker 局部补丁并完整目标 eq，混入正文负控拒绝。`listJoinPlan` 保留全部引用前缀/BOM，只去列表 marker；必要空行继承原 EOL 与引用前缀。末空 paragraph 的有界证明允许在最后引用路径，每层须是末 child，删去该空 paragraph 后完整剩余 doc eq。

按管理者两次连续 Backspace 验收要求继续补两个直接连接：同一 blockquote 中相邻 paragraph 可删其内容端点间仅含 EOL/quote prefix 的 separator；同容器 list 后首字符 paragraph 可并入前 list 末 item 唯一 paragraph，caret 留拼接点。后者有专用 metadata，完整源候选 eq 仍是接受条件；非相邻、多段 item、混入正文继续拒绝。均不触及 source-authority 或未知保护语法。

公共 runtime 增加精确字节及 Undo/Redo：`- a\n\n- b` → `- a\n\nb` → `- ab`；`> a\n>\n> - b` → `> a\n>\n> b` → `> ab`；`> - b` 可继续去引用。覆盖重复引用、BOM/CRLF、空 task 位于引用末段及 negative metadata。引用 task 三种 label/尾空格变体点击原本已绿，未修改其产品路径。

最终同前7文件229项通过，`tsc --noEmit`、`git diff --check`通过。作者未跑 Native/WK、App 或新增语法矩阵；管理者进行真实连续事件验收与冻结复审。本文早期“复杂引用空列表保守拒绝”仅描述第一版边界，本次明确覆盖上述引用路径，不将它当作已完成需求的豁免。
