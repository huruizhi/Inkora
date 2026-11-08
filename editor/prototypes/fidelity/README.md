# PROTOTYPE：增量原文补丁与真实 ProseMirror

本目录是可丢弃的 fidelity 原型，固定产品起点 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`。它不修改生产入口、不锁定最终架构，也不代表 M0/HITL 已通过。

直接打开已生成的 `PROTOTYPE.html` 即可查看隔离内存样稿；无网络、无文件写入。“保存”只建立内存保存点。

## 文件

- `model.ts`：原文范围、prototype schema/parser、PM 事务、局部补丁、重解析等价守卫、pending 与共享历史。
- `main.ts`：真实 EditorView、源码草稿、演示操作与行内链接目标操作。
- `shell.html` / `build.mjs` / `PROTOTYPE.html`：模板、离线构建器和提交的单文件产物。
- `check.mjs` / `evidence.json`：jsdom 载入真实 bundle 的 28 项可复现检查及结果。
- `crossval.mjs` / `CROSS-VALIDATION.md`：只读驱动 INK-PROT-002 冻结样稿的交叉验证。
- `BOUNDARY-EVIDENCE.md`：INK-PROT-005 保护边界与 pending/save gate 证据。
- `REFERENCE-EVIDENCE.md`：INK-PROT-009 真实链接语义、case03 SHA、inline ledger 反例和 010 冲突面。

本机复用主仓库的锁定依赖；临时 `editor/node_modules` symlink 不提交。未执行 setup 或新增依赖。

```sh
make -C editor/prototypes/fidelity build
make -C editor/prototypes/fidelity lint
make -C editor/prototypes/fidelity test
node editor/prototypes/fidelity/crossval.mjs
```

## 当前模型

原文是保存依据，PM 是编辑状态。MarkdownIt 顶层 token 提供块范围；空白、换行、BOM 和引用定义是不可由 PM serializer 触碰的原文间隙。数学围栏、Mermaid、HTML、callout、脚注、表格/wiki 继续复用既有保护与 safety 分支；不稳定边界进入 pending，用户缓冲保留且保存阻断。

INK-PROT-009 不再把含链接的整段变成字面文本叶：

- 普通、完整/折叠/快捷引用和尖括号自动链接解析成真实 `link` mark 与 DOM `a[href]`；heading、paragraph、list、blockquote 的结构保留。
- strong/em/code 与相邻 link 同时保留；显示文字不含 Markdown 引用定界符，带 link 的 heading 不显示 `#` 源码。
- 裸 URL 按 CommonMark 普通文本处理，不因 `gfm_autolink` 风险拒绝文档。
- 图片用 `image_ref` 标记 alt 叶，并由 DOM 占位显示该图片自己的精确 `![alt][label]` / `![alt](…)` 原文；不创建 `img`、不加载资源，也不吞同段正文或其它 marks。
- 引用定义、原引用拼写、href/title、图片路径、BOM/CRLF 始终保留在原文。行内 href 修改使用专用目标字节补丁与真实 `addMark`。

文本叶按块内 PM 顺序映射到原文，CRLF 再换算回原始 UTF-16 偏移；重复显示文本可按 PM 位置区分。每次候选都必须重新解析并 `doc.eq(targetPMDoc)`，否则不提交可信 source/state。完整替换 `inclusive:false` 的 link/image 文本叶时，只继承该单一源叶的 marks；跨叶、多步、结构事务仍阻断。

## 实际结果（2026-11-08）

```text
make -C editor/prototypes/fidelity test
PASS: build + prototype tsc + 28 reproducible checks

node editor/prototypes/fidelity/crossval.mjs
case03: 4/4 PASS, each SHA exact and refsKept=true
case02 / case10: PASS regressions
case05 / 06 / 11: existing old-driver or unsupported differences remain
case09: byte results only; no selection-pass claim

locked pnpm --dir editor lint
PASS
locked pnpm --dir editor test
PASS: 10 files / 122 tests
```

冻结 case03 的 full/collapsed/shortcut reference、行内链接、尖括号链接、裸 URL 与图片引用混合文档可正常打开；三步编辑和内存保存的 SHA 与预期逐字节一致。详细 SHA 与 DOM/model 断言见 `REFERENCE-EVIDENCE.md`。

## 明确限制

1. **不是通用 inline source map。** `[a](later)later` 会让后一个文本先撞到 href；转义/实体规范化显示文字也可能没有直接子串。守卫会拒绝、保持可信状态并禁用保存；没有用整段源码化绕过。
2. **marks/attrs 仍有限。** 本轮覆盖 link 显示文字、图片 alt 和受限行内 href；通用 removeMark、复杂嵌套定界符重写、跨叶编辑仍未完成。
3. **任务列表仍是文本。** 没有 checkbox schema/控件。
4. **保护边界仍保守。** 行内 `$`、无闭合围栏等仍进入 pending；未知 safety risk 未被全局忽略。
5. **历史是原型快照。** 不是生产 history 分组。此分支未包含已合入 010 的 source selection 实现；09 不能据此宣称通过。
6. **仅模型/jsdom。** 未启动桌面；真实 WKWebView、系统中文 IME、磁盘保存/重开、App Sandbox、图片资源访问均未验证。
7. **未合并 010。** `model.ts`、`main.ts`、`crossval.mjs`、`check.mjs` 与 `713e922` 均有集成冲突面；见 `REFERENCE-EVIDENCE.md`。

结论仅是：真实 link 语义与原文字节账本可在当前受限 prototype 中共存，并且 case03、02、10 形成了可复现证据。不得据此宣告 M0。
