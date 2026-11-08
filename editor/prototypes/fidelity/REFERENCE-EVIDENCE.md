# REFERENCE-EVIDENCE：INK-PROT-009 引用式链接 / 图片 / 裸 URL

轮次：2026-11-08，分支 `task/INK-PROT-009-reference-links`（起点 `7c497a7`）。独立样稿仍为 INK-PROT-002 冻结件（`c85e1890`，只读，预期仅在事后比对）。本文只陈述实际运行观察到的结果，并按证据层级区分主张强度；未运行的层级一律写明「未执行」。

## 1. 表示契约（模型层不变式）

- `model.ts parse()`：顶级 token 范围内，若 markdown-it（带全文引用定义上下文）的行内 token 流解析出任一 `link_open` / `image`（覆盖行内链接、完整/折叠/快捷引用式、图片引用、尖括号自动链接），或该范围带 `gfm_autolink` / `image` 风险（裸地址、行内图片），该范围生成**保守字面叶**：整段源码字节（LF 规范化后）作为单一可编辑 PM 文本叶，`Range.literal` 标注，DOM 加 `literal-inline` 虚线与说明。不是 protected_block、不进 pending、保存资格不受影响。
- 其余风险码维持既有拒绝/保护路径；`task_list`/`gfm_autolink`/`image` 之外的风险码仍整段抛错（例如模板表达式 `{}` 与裸 URL 同段时依旧拒绝载入）。
- 字面叶的映射是恒等映射：文本叶 == 范围规范化原文，`sourcePosition` 的整叶唯一性定位天然成立；CRLF 由既有逐字符偏移换算处理。无「首次出现盲取」。
- 每次编辑仍走既有局部补丁 + 候选原文重解析 + `doc.eq(targetPMDoc)` 守卫；守卫失败即拒绝提交并保留可信状态。
- 引用定义行（含 ≤3 空格缩进）仍是原文间隙，不进入任何 PM 节点，字节不可能被改写。
- 列表 / 引用块内含链接：显式抛错拒绝（`链接/图片暂只支持段落与标题的保守字面表示：bullet_list` 等），不静默降级、不吞字节。

## 2. 修复前后（同一命令）

`node crossval.mjs <样稿目录>`（jsdom 载入真实 PROTOTYPE.html bundle，走真实 `sourceEdit` + `view.dispatch` + `actions.save` 入口）：

| | 载入 | 步1/2/3/4 |
| --- | --- | --- |
| 修复前 | `blocked: 不支持的语法边界：gfm_autolink`（整篇拒绝） | 全部未执行 |
| 修复后 | ok（`literalRanges=2`，pending=false） | 4/4 PASS |

## 3. case03 实际步骤证据（jsdom 层）

样稿：`cases/03-reference-links/input.md`（475B，sha `7dd2d074…`，LF，无 BOM）。驱动方式：`p.model.sourceEdit(input)`（真实 parse+commit 入口，随后仅清历史建立基线）→ 三步均为 `p.view.dispatch(p.model.state.tr.insertText(...))` 真实 PM 文本事务 → `p.actions.save`。预期文件只在步末读取比对。

| 步 | 动作（manifest ops） | 结果 | sha256（缓冲区） | 引用定义 |
| --- | --- | --- | --- | --- |
| 1 | visual，「Inkora 文档」→「Inkora 手册」 | PASS，字节 == `after-step-1.md`（475B） | `d9033db6a06e…` | refsKept=true |
| 2 | visual，「![图标]」→「![图示]」 | PASS，字节 == `after-step-2.md`（475B） | `7450c1259be4…` | refsKept=true |
| 3 | visual，「(https://example.com/inkora 」→「(https://example.com/inkora-v2 」 | PASS，字节 == `after-step-3.md`（478B） | `4b5bfa9e8924…` | refsKept=true |
| 4 | 保存（内存基线，`to_disk` 仅内存模拟） | PASS，保存点 sha == after-step-3 | `4b5bfa9e8924…` | refsKept=true |

每步同时验证：`blocked=''`、`fragsKept`（无保护片段被改动）、定义两行（`[inkora-doc]: https://example.com/docs "引用定义标题保留"` 与 `[inkora-icon]: /assets/icon.png`）与折叠 `[inkora-doc][]`、快捷 `[inkora-doc]`、尖括号 `<https://example.com/bracket>`、裸地址 `https://example.com/auto` 全部未改字节。Undo 三次逐字节回到输入。检查口径来自 manifest 的事后比对，未作为输入喂给模型。

## 4. check.mjs 新增反例（jsdom 层，样稿字符串与冻结样稿不同源）

27 项中的 6 项新增（`make -C editor/prototypes/fidelity test` 实际通过）：

1. **字面表示正例**：含引用/折叠/快捷/图片/裸 URL 的自造样稿载入即净（pending=false、无 protected_block、`.literal-inline`×2）；显示文字、图片替代文字、裸 URL 三处编辑后仅目标字节变化、引用定义逐字节不变、重解析 `doc.eq` 成立、保存点更新、Undo×3 字节还原。
2. **同 URL 双定义 + 同段重复显示文字**：按 PM 位置编辑第二处「镜像」，首处不动，两条同 URL 定义原样（映射按位置，不盲取首现）。
3. **定义缺失**：`[ghost][nope]` 无定义 → 载入不阻断（未解析引用按普通文本），正文可编辑。
4. **定义前后空白**：空行 + 3 空格缩进定义 → 间隙干净、字节保留。
5. **BOM + CRLF**：BOM 保留、`\r\n` 逐字节保留（字面叶经 CRLF 偏移换算）、Undo 字节级还原。
6. **列表内链接**：显式抛错拒绝并保留原可信状态（记录为已知限制，不静默处理）。

## 5. 证据分层与主张边界

| 层级 | 本轮实际执行 | 可主张 | 不可主张 |
| --- | --- | --- | --- |
| 模型（纯逻辑） | parse/sourcePosition/apply 守卫在上述输入上运行 | 恒等映射、重解析等价守卫、定义间隙字节不可达 | 任意 Markdown 变体的语法意图 |
| jsdom（真实 bundle） | check.mjs 27 项、crossval.mjs 12 变体 | 真实 PM 事务/生产 parser/schema 之上的字节与状态证据 | 渲染像素、WKWebView 行为 |
| 真实 WKWebView | 未执行 | — | 任何桌面端行为 |
| 系统中文 IME | 未执行（composition 拦截仅原有 jsdom 观察） | — | IME/光标/composition 组合历史 |
| 磁盘 | 未执行（保存=内存基线；case03 `to_disk` 仅内存模拟） | 缓冲/保存点字节 | 真实写盘、重开、Sandbox 授权 |
| 图片资源 | 未执行（仅源码表示与路径字节） | `![alt][label]` 与定义路径逐字节保留 | 图像解码、占位渲染、资源加载 |

链接显示为**源码字面**（保守投影，非渲染式链接）；Typora 式渲染、链接编辑面板、链接 marks 修改均不在本原型能力内（与 README 限制 2 一致）。样稿 05/06/11 既有失败未变；06/11 的驱动序列仍是审计改稿前旧动作，只作现状记录。

## 6. 交接（INK-PROT-010 及后续）

- **潜在冲突点 model.ts**：本轮改动集中在 `parse()` else 分支（`streamHasLinkOrImage` + 字面叶构造）与 `Range.literal` 字段；若 010 的选区库重写 `sourcePosition`/`transaction`，两者不重叠但 `Range` 类型新增字段需保留。
- **潜在冲突点 main.ts**：新增 `annotateLiterals()`（render 尾部调用）与 shell.html 的 `.literal-inline` 样式；010 若改 render/selection 展示请保留该调用。
- `selection-map.ts` 未触碰（属 006/010 范围）。
- 完整源范围 ledger 未宣称完成：重复/转义/规范化文本、空段、跨块仍按 README 限制 1 拒绝；字面叶恒等映射只覆盖本轮引入的链接/图片/裸 URL 段落。

## 7. 实际运行命令（2026-11-08）

```sh
ln -s /Users/rayhu/Documents/projects/Inkora/editor/node_modules editor/node_modules   # 复用锁定依赖，交付前移除
make -C editor/prototypes/fidelity test      # PASS：build + 严格 tsc + check.mjs 27 项
node editor/prototypes/fidelity/crossval.mjs /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-002-fidelity-cases/editor/prototypes/fidelity-cases
# 03 三步+保存全 PASS（refsKept=true）；01/02/04/07/08/09/10 保持通过；05/06/11 保持既有失败（旧driver，未按审计纠正）
make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm        # PASS
make test-editor PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm # PASS：9 文件 111 项
```

样稿 `verify.py` 本轮未重跑（样稿只读未改，005 轮已记录 508 项通过）。不宣称 M0 通过。
