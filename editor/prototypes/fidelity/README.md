# PROTOTYPE：增量原文补丁与真实 ProseMirror

本目录是可丢弃的 fidelity 原型，固定产品起点 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`。它不修改生产入口、不锁定最终架构，也不代表 M0/HITL 已通过。

直接打开已生成的 `PROTOTYPE.html` 可查看隔离内存样稿；无网络、无文件写入。“保存”只建立内存保存点。

## 文件与入口

- `model.ts`：原文范围、复用生产 specs/parser tokens 的 prototype schema/parser、PM 事务、局部补丁、重解析等价守卫、pending 与共享历史。
- `native-transaction.ts` / `NATIVE-TRANSACTION-EVIDENCE.md`：受限原生事务到局部原文补丁的桥接、空结构暂存、原生 audited 矩阵与边界证据。
- `main.ts`：真实 EditorView、源码草稿、双向选区接线、演示操作、行内链接目标操作与图片原文占位。
- `selection-map.ts` / `selection-check.mjs` / `SELECTION-EVIDENCE.md`：双向选区映射、15 项模块检查与证据。
- `shell.html` / `build.mjs` / `PROTOTYPE.html`：模板、离线构建器和由最终源码重建的单文件产物。
- `check.mjs` / `evidence.json`：jsdom 载入真实 bundle 的组合检查及结果。
- `crossval.mjs` / `CROSS-VALIDATION.md`：只读驱动 INK-PROT-002 冻结样稿的交叉验证。
- `BOUNDARY-EVIDENCE.md`：保护边界与 pending/save gate 证据。
- `REFERENCE-EVIDENCE.md`：真实链接语义、case03 SHA、inline ledger 反例及原 009/010 冲突面；已按真实 diff 校正为 010 未修改 `model.ts`。
- `INTEGRATION-SELECTION-EVIDENCE.md`：源码往返/历史选区接线、失败不静默重置、空文档与纯保护块回退证据。
- `DRIVER-AUDIT.md` / `audited-crossval.mjs` / `audited-crossval-results.json`：审计后 oracle 的独立重放驱动与结果。

本机验证可复用主仓库已安装的锁定依赖；临时 `editor/node_modules` symlink 不提交。未执行 setup 或新增依赖。

```sh
make -C editor/prototypes/fidelity build
make -C editor/prototypes/fidelity lint
make -C editor/prototypes/fidelity test
node editor/prototypes/fidelity/selection-check.mjs \
  editor/prototypes/fidelity-cases
node editor/prototypes/fidelity/crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html
```

## 组合模型

原文是保存依据，PM 是编辑状态。MarkdownIt 顶层 token 提供块范围；空白、换行、BOM 和引用定义是不可由 PM serializer 触碰的原文间隙。数学围栏、Mermaid、HTML、callout、脚注、表格/wiki 继续复用既有保护与 safety 分支；不稳定边界进入 pending，用户缓冲保留且保存阻断。

候选补丁只拼接未改范围，不整篇序列化；候选必须重解析且 `doc.eq(targetPMDoc)`，否则不提交可信 source/history。文本叶按块内 PM 顺序映射到原文，`sourcePosition` 用 `side` 区分共享边界；CRLF 再换算回原始 UTF-16 偏移。完整替换 `inclusive:false` 的 link/image 文本叶时，只继承同一源叶的 marks。

INK-PROT-018 新增受限 native bridge：空文档文字、paragraph/list split/join、remove strong、ATX heading level、行内 code 定界符增长与 fenced code language 均由真实 PM transaction/command 自动推导局部 patch。Markdown 无法表达的新建空段只暂存 PM state 与局部候选，不改 source/dirty/history 且阻断保存；后续输入/删除使候选可重解析等价后才原子提交。其它多步/跨叶/含未建模 source 元数据的事务仍明确拒绝。

真实链接语义与 010 选区接线在同一 prototype schema 上工作：

- 普通、完整/折叠/快捷引用和尖括号自动链接解析成真实 `link` mark 与 DOM `a[href]`；heading、paragraph、list、blockquote 结构保留。
- strong/em/code 与相邻 link 同时保留；显示文字不含 Markdown 定界符。裸 URL 按 CommonMark 普通文本处理。
- `image_ref` 只标记图片 alt 叶；DOM 占位显示该图片自身精确 `![alt][label]` / `![alt](…)` 原文，不创建 `img`、不加载资源，也不吞同段正文或其它 marks。
- 引用定义、原引用拼写、href/title、图片路径、BOM/CRLF 保留在原文账本；行内 href 修改只补丁目标字节并使用真实 `addMark`。
- 进入源码模式将 PM anchor/head 映射为 textarea LF 选区并保留方向；提交时将 textarea 当前选区映射到新文档。no-op、Cancel 和未提交草稿的 Undo/Redo 均不丢可信状态或草稿。
- 空文档/仅空白/仅引用定义提交到唯一空段落 `TextSelection@1`；纯保护块按源码光标 owner 落 `NodeSelection`，明确记录为非精确文本映射。

## 当前组合验证

2026-11-08 在本工作区实际执行：

- `make -C editor/prototypes/fidelity test`：PASS，离线重建 + 严格类型检查 + 37 项组合检查。
- `selection-check.mjs <冻结样稿目录>`：PASS，15/15；重复叶断言按 009 顺序叶映射更新，model 与模块都落在第二个真实叶。
- `crossval.mjs <冻结样稿目录> <最终 PROTOTYPE.html>`：02、03、09、10-open、10-create 全链通过；03 为真实 link/image DOM/model 语义与逐步 SHA；09 含方向、后向选区和 Cancel；10 的磁盘语义仍仅内存保存点模拟。
- 组合新增场景：含 link、image placeholder、邻近 strong/em/code 的文档进入源码，修改链接显示文字与图片 alt 后回到可视；后向选区、Undo/Redo、no-op、Cancel 均通过，且无 `img` 资源元素。

完整命令、最终 HTML hash、生产层命令口径和审计驱动结果见 `COMBINED-EVIDENCE.md`。

INK-PROT-018 的 audited native 矩阵为 16/16 累计步骤 PASS、三个独立结构分支 PASS、三个补充 probe PASS，`EXPLICIT_PATCH_DEMO=0`；05、06、11 与空文档 visual 输入均已走真实事务/命令。动作入口、局部 EOL patch、Undo/Redo、jsdom 与真实环境边界见 `NATIVE-TRANSACTION-EVIDENCE.md`。

## 明确限制与反例

1. **不是通用 inline source map。** `[a](later)later` 的目标/正文碰撞和转义显示文字仍安全拒绝，保持可信 source/state 并禁用保存；没有用整段源码化换取通过。
2. **marks/attrs 仍有限。** 已覆盖本轮 05 的 remove strong、ATX heading level、行内 code 定界符增长和 fence language，以及既有 link/image 路径；复杂嵌套定界符、跨叶与通用 attrs 仍未完成。
3. **任务列表仍是文本。** 没有 checkbox schema/控件。
4. **保护边界仍保守。** 行内 `$`、无闭合围栏、`> $$`、空围栏等进入 pending；问题片段原样保留且保存阻断。
5. **历史是原型快照。** 不是生产 prosemirror-history 分组；草稿内文本级撤销与 composition 分组未实现。
6. **原生结构是受限集合。** 已覆盖 paragraph/list split/join 与新 016 的 mixed-EOL visual 动作；blockquote、复杂嵌套列表、空列表退出、跨保护块等未纳入，不得外推为通用结构编辑器。
7. **仅模型/jsdom。** 普通文字和 marks/attrs 部分由 PM transaction dispatch，结构命令由 jsdom keydown 触发；未启动桌面，真实 WKWebView、系统中文 IME、磁盘保存/重开、App Sandbox、图片资源访问均未验证。

结论仅限于：当前受限 native transaction 集合、真实 link/image 语义、原文字节账本和源码选区闭环能在同一 prototype schema 中共存，并形成可复现证据。不得据此宣告 M0 完成或采纳生产架构。
