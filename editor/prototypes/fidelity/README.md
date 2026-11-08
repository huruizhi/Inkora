# PROTOTYPE：增量原文补丁与真实 ProseMirror

本目录是可丢弃的 INK-PROT-001 原型，固定产品起点 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`。不修改生产入口，不锁定最终架构，不代表 M0/HITL 已通过。

直接双击同目录 **PROTOTYPE.html**，无需服务器、依赖安装或网络。自由按钮与四个引导演示均操作真实 PM 文档。所有内容为隔离内存样稿；“保存”只建立内存保存点，不写磁盘。

## 源码与产物

- `model.ts`：原文范围、PM 文档/事务、补丁重解析校验、共享历史快照、真实 UTF-8 diff。
- `main.ts`：真实 EditorView、直接输入、演示操作、可见状态、源码草稿与场景。
- `shell.html`：页面模板；不是可运行产物。
- `build.mjs`：用现有锁定 Vite 8.3.6 打包仓库 PM 依赖及生产 schema/parser/保护块预览，将 IIFE 内联为 `PROTOTYPE.html`。用户已允许此项打包例外；不新增依赖。产物无外部 JS/CSS/字体。
- `PROTOTYPE.html`：已提交的可直接打开产物（使用现有 Vite 压缩）。
- `check.mjs` / `evidence.json`：现有 jsdom 上运行真实 bundle 的非 UI 场景校验与计算结果；无新测试框架。
- `UI-EVIDENCE.md`：本轮真实 Chrome 的可见交互记录，与 WKWebView/IME 区分。

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

原文为保存依据，PM 为编辑状态。MarkdownIt 顶层行范围记录覆盖块；空白、换行、BOM 与引用定义作为间隙单独显示。文本叶只在所属块内唯一定位后才允许生成补丁；CRLF 映射回原始偏移。操作候选补丁只拼接未改范围，不整篇序列化；候选原文必须重解析且 `doc.eq(targetPMDoc)`，否则不提交原文或 PM 文档。原文偏移为 UTF-16，另显示 UTF-8 字节偏移和实际字节 diff。diff 是最长公共前缀/后缀后的包络，可能从多字节字符中间开始；它不是合法 UTF-8 文本切片。完整原文转义可用于复核。

非 UI 11 项真实计算校验已通过，细节见 `evidence.json`：正文、粗体 marks、标题 attrs、任务单字符、split/join 的实际补丁；源码仅格式变化的 selection 保留与跨模式 Undo/Redo；畸形边界阻断且可信字节/文档不变；真实 PM 事务替换 emoji；BOM 与混合 EOL；不支持的原生结构 split 被拒绝。

执行命令与结果（2026-11-08）：

```sh
node editor/prototypes/fidelity/build.mjs
# PASS，生成单文件（首次运行适配 Vite 返回数组后重跑成功）
make -C editor/prototypes/fidelity test
# PASS：专用严格类型检查 + 11 项场景校验
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
4. **高级边界识别是有限适配。** 表格/wiki 复用生产 `parseProtectedMarkdown`，保护预览复用生产 schema；独立公式围栏、Mermaid 与脚注片段借用相同 protected_block（按 raw 呈现）。非精确围栏、元数据等输入可能拒绝；不是全面高级语法支持。不能修改保护块 raw 的可视内容；主动源码可修改。
5. **共享历史为原型快照。** 每个实际 PM 事务保存 EditorState + 原文，源码提交进入同一栈；不是生产 prosemirror-history 分组方案。源码语义不变时 selection 保留；语义变化后明确重置，**选区映射门槛未通过**。源码 textarea 在浏览器中会规范化换行，提交可能主动修改 EOL；实际 diff 会显示，历史保留旧字节。用户必须查看转义可信原文才能核对 CRLF。
6. **IME 未验证。** 直接 PM composition 事务不被演示按钮 guard 拦截；composition 期间按钮与保存拒绝执行。但系统 IME、光标稳定性、组合历史分组与保存快照边界仍待真实 WKWebView 验收。
7. **故障恢复保守。** 有映射/语法错误时保留可信原文/视图、禁用保存，并留下主动源码草稿；有效源码提交或 Undo 可解除阻断。源码草稿不是独立历史，Undo 或重置会离开草稿；无文件恢复/冲突机制。
8. **独立样稿待交叉验证。** 本轮只使用自建临时样稿，不修改 OMP 的范围/预期；待管理者固定其提交后再验收。

结论仅限于：已有可操作的真实 PM/保护块原型和局部补丁正例，以及可复现的拒绝/未通过边界。选区、通用映射、历史分组、WKWebView/IME 与用户审阅尚不足以作架构采用结论。
