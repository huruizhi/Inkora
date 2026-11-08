# PROTOTYPE：增量原文补丁与真实 ProseMirror

本目录是可丢弃的 INK-PROT-001 原型，固定产品起点 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`。不修改生产入口，不锁定最终架构，不代表 M0/HITL 已通过。

直接双击同目录 **PROTOTYPE.html**，无需服务器、依赖安装或网络。自由按钮与四个引导演示均操作真实 PM 文档。所有内容为隔离内存样稿；“保存”只建立内存保存点，不写磁盘。

## 源码与产物

- `model.ts`：原文范围、PM 文档/事务、补丁重解析校验、共享历史快照、真实 UTF-8 diff。
- `main.ts`：真实 EditorView、直接输入、演示操作、可见状态、源码草稿与场景。
- `shell.html`：页面模板；不是可运行产物。
- `build.mjs`：由管理者选择复用仓库现有锁定 Vite 8.3.6 工具链，打包 PM 依赖及生产 schema/parser/保护块预览，将 IIFE 内联为 `PROTOTYPE.html`；不新增依赖。产物无外部 JS/CSS/字体。
- `PROTOTYPE.html`：已提交的可直接打开产物（使用现有 Vite 压缩）。
- `check.mjs` / `evidence.json`：现有 jsdom 上运行真实 bundle 的非 UI 场景校验与计算结果；无新测试框架。
- `crossval.mjs` / `CROSS-VALIDATION.md`：对 INK-PROT-002 独立样稿（`c85e1890`，只读）的交叉核验驱动脚本与结果报告。
- `BOUNDARY-EVIDENCE.md`：INK-PROT-005 保护片段边界/含混输入门槛的修改前后证据、行为契约与剩余限制。
- `REFERENCE-EVIDENCE.md`：INK-PROT-009 引用式链接/图片/裸 URL 的表示契约、case03 步骤证据、最小反例与模型/jsdom/WKWebView/IME/磁盘分层主张。
本机已使用忽略提交的临时链接 `editor/node_modules -> /Users/rayhu/Documents/projects/Inkora/editor/node_modules`，复用已安装锁定依赖；交付提交不包含链接。在具备同一锁定依赖的 checkout 中执行：

```sh
# 若本 worktree 尚无依赖链接，复用本机已安装依赖（不安装）
ln -s /Users/rayhu/Documents/projects/Inkora/editor/node_modules editor/node_modules
make -C editor/prototypes/fidelity build
make -C editor/prototypes/fidelity lint
make -C editor/prototypes/fidelity test
# 仅人工桌面操作时，先取得项目 UI 锁并通过 preflight，再 make ... run
```

本轮未执行 setup/安装依赖。根目录已有 `make lint`、`make test-editor` 仍按既有入口运行。

## 验证路线与实际结果

原文为保存依据，PM 为编辑状态。MarkdownIt 顶层行范围记录覆盖块；空白、换行、BOM 与引用定义（含 `[^1]:` 脚注定义行）作为间隙单独显示。数学围栏/Mermaid、HTML 注释（内部 `$x$`、`[[bad` 等按字面量）、callout、脚注片段按 token 精确行范围转为保护块与正文混排，原字节保留；表格/wiki 复用生产 `parseProtectedMarkdown`。INK-PROT-009 起，链接/图片/裸 URL 段落（行内链接、完整/折叠/快捷引用式、图片引用、尖括号自动链接、裸地址）不再因 `gfm_autolink` 整篇拒绝：这些段落生成保守字面叶——整段源码字节作为单一可编辑文本叶（恒等映射、DOM 虚线标注），不包 raw、不 pending；定义行仍为间隙字节。边界含混（无闭合围栏、行内 `$` 定界等）不再使打开或编辑整体失败：缓冲保留用户输入并进入 pending，视图为该缓冲的保守投影（问题片段原样标注），结构化保存阻断，主动源码修复或 Undo 恢复一致性；最近可信快照供修复。文本叶只在所属块内唯一定位后才允许生成补丁；CRLF 映射回原始偏移。操作候选补丁只拼接未改范围，不整篇序列化；候选原文必须重解析且 `doc.eq(targetPMDoc)`，否则不提交原文或 PM 文档（pending 路径明确例外：不提交事务、只提交投影并阻断保存）。原文偏移为 UTF-16，另显示 UTF-8 字节偏移和实际字节 diff。diff 是最长公共前缀/后缀后的包络，可能从多字节字符中间开始；它不是合法 UTF-8 文本切片。完整原文转义可用于复核。

非 UI 27 项真实计算校验已通过，细节见 `evidence.json`：正文、粗体 marks、标题 attrs、任务单字符、split/join 的实际补丁；源码仅格式变化的 selection 保留与跨模式 Undo/Redo；真实 PM 事务替换 emoji；BOM 与混合 EOL；不支持的原生结构 split 被拒绝；源码草稿 no-op 往返（字节/dirty/revision/history 全不变）、仅改一处格式时其余 CRLF/LF 逐字节保留、CRLF 行内新换行继承 `\r\n` 且 Undo 字节精确还原、取消草稿不改可信内容并重置 textarea；畸形源码提交进入 pending（缓冲保留/保存阻断/DOM 标注）、Undo 与主动修复恢复一致性；混排样稿打开（BOM+注释+callout+脚注，359 字节）、混排样稿片段前后正文编辑后片段原字节不变、可视编辑制造含混（pending 中正文仍可编辑、Undo 字节级恢复）、畸形打开观察 + 源码修复 + 保存 + 内存基线重开；本轮新增（INK-PROT-009）：链接/图片/裸 URL 字面叶正例（三处编辑仅目标字节变化、引用定义逐字节不变、Undo 字节还原）、同 URL 双定义 + 同段重复显示文字按位置编辑第二处、定义缺失不阻断、定义前后空白、BOM+CRLF 引用文档、列表内链接显式拒绝。

执行命令与结果（2026-11-08，INK-PROT-009 引用式链接轮；005 轮命令见 REFERENCE-EVIDENCE.md 引用的 git 历史）：

```sh
node editor/prototypes/fidelity/build.mjs
# PASS，重建单文件 PROTOTYPE.html
make -C editor/prototypes/fidelity test
# PASS：专用严格类型检查 + 27 项场景校验
node editor/prototypes/fidelity/crossval.mjs
# 03（reference-links）三步 + 保存全部通过（byte-exact + refsKept）；01/02/04/07/08/09/10 保持通过；
# 05/06/11 保持既有失败（06/11 驱动动作仍是审计改稿前旧序列，输出只作现状记录）
make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
# PASS：swift-format 与生产 TS 检查
make test-editor PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
# PASS：生产 TS/Vite 构建，9 个文件 111 项现有测试
```

没有执行完整 `make test`、原生构建/测试、App Sandbox、文件系统保存/重开、真实 WKWebView 或系统中文输入法。Chrome 仅验证打开与部分按钮，不能替代这些验收。

## 明确限制、反例与下一步

1. **映射不是完整 source map。** 重复/转义/规范化文本、空段、跨块等可能没有唯一叶映射，拒绝操作并阻断保存；例如原生 Enter 的结构事务被拒绝，需专用 split 按钮。重解析等价只能证明当前 PM 语义，不证明所有 Markdown 变体的语法意图。
2. **marks/attrs 范围有限。** 专用粗体插入与一级 ATX → 二级标题通过。通用 marks 去除/嵌套、link href/title 修改没有实现；不能据此宣告全 marks/attrs 验收完成。
3. **任务仍是列表内文字。** `[ ]` → `[x]` 只替换一个字符，复用真实列表 PM 文本；没有新增任务 schema/checkbox 控件。
4. **高级边界识别为分层保守。** 稳定形态（闭合 `$$` 围栏、闭合 Mermaid、HTML 注释、callout、脚注引用/定义、表格/wiki）按 token 精确范围保护混排，注释内部按字面量处理。非稳定形态（行内 `$…$`、无闭合围栏、`> $$`、`$$\n$$` 空围栏等）按 Issue 处理：片段原样保留 + pending + 保存阻断，不猜测边界、不伪造渲染；含两个 `$` 的普通文本也会进入该保守分支。不能修改保护块 raw 的可视内容；主动源码可修改。
5. **共享历史为原型快照。** 每个实际 PM 事务保存 EditorState + 原文，源码提交进入同一栈；不是生产 prosemirror-history 分组方案。源码语义不变时 selection 保留；语义变化后明确重置，**选区映射门槛未通过**。源码草稿复用生产 `TextAreaEditorKernel`：textarea 换行虽被浏览器规范化，内核按行记录原始 CRLF/LF 并在提交时逐字节还原，新换行继承当前行样式，BOM 原样保留；无修改提交为 no-op（不改字节/dirty/revision/history），但 **语义变化后的 selection mapping 与 history 分组仍未通过、不在本轮范围**。
6. **IME 未验证。** 直接 PM composition 事务不被演示按钮 guard 拦截；composition 期间按钮与保存拒绝执行。但系统 IME、光标稳定性、组合历史分组与保存快照边界仍待真实 WKWebView 验收。
7. **故障恢复保守且区分状态。** 打开畸形文档不再失败：保留完整原文与保守投影，标注问题位置，打开不置 dirty，保存阻断。编辑制造含混时保留用户输入缓冲（pending）与可恢复历史，可信投影继续展示普通正文，pending 中片段前后正文仍可编辑；有效源码提交、提交最近可信快照（repair）或 Undo 恢复一致性；pending/异常均不写内存保存点。源码草稿不是独立历史，Undo 或重置会离开草稿；无文件恢复/冲突机制。
8. **独立样稿交叉验证已有结果。** 已对固定 `c85e1890` 的 INK-PROT-002 样稿（只读、未改预期）驱动真实入口核验，详见 `CROSS-VALIDATION.md`、`BOUNDARY-EVIDENCE.md` 与 `REFERENCE-EVIDENCE.md`：01/02/03/04/07/08 在可执行范围内字节全通过（02 为 005 轮新增；03 为 009 轮新增：引用式链接/图片/裸 URL 三步 + 保存，定义逐字节保留）；10 open-malformed 打开/阻断/修复/重开通过（磁盘仅内存基线模拟）、10 create-ambiguity 含混缓冲保留/修复通过；09 字节通过但选区映射为现状差异（选区由后续任务负责）；05/06/11 存在真实阻断/失败（marks 移除、定界符重写、单换行拆分；06/11 驱动动作仍是审计改稿前旧序列）。不据此宣告 M0 通过。
9. **链接为源码字面表示。** 链接/图片/裸 URL 段落是可编辑的保守字面叶：定界符、标签、URL/title、路径逐字节保留，编辑走既有补丁与重解析守卫；渲染式链接、链接面板、marks 式 href/title 修改、图片资源加载均未实现。列表/引用块内的链接仍显式拒绝载入。

结论仅限于：已有可操作的真实 PM/保护块原型、局部补丁正例、保护片段混排与含混输入的保守可恢复路径、引用式链接/图片/裸 URL 的字面保真路径，以及可复现的拒绝/未通过边界。选区、通用映射、历史分组、WKWebView/IME 与用户审阅尚不足以作架构采用结论。
