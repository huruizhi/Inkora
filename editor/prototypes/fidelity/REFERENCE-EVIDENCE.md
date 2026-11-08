# REFERENCE-EVIDENCE：INK-PROT-009 引用式链接 / 图片 / 裸 URL

日期：2026-11-08。分支 `task/INK-PROT-009-reference-links`，接管起点 `d3c15c789b47be3e7cda3446e9ea8fb9571bcf40`。独立样稿固定为 INK-PROT-002 `c85e1890b2ef3938dd6853d97977d28ac54b309e`，只在每步操作后读取预期文件；未把预期内容喂给模型。

## 表示契约

- 普通行内链接、完整/折叠/快捷引用式链接和尖括号自动链接进入真实 ProseMirror `link` mark；DOM 为 `a[href]`，只显示文字，不显示 `[]()`、引用标签或标题的 `#`。
- 解析局部块时附加全文引用定义作为只读解析上下文。定义行、原引用拼写、href/title、空白、BOM 与 CRLF 仍由原文账本持有，不经 serializer 改写。
- 裸 URL 使用 CommonMark `linkify:false`，作为普通文本载入；`gfm_autolink` 风险不再单独拒绝整篇文档。
- 生产 schema 没有 image node。本原型只增加 `image_ref` mark：图片 alt 作为黄色「图片原文占位」显示，DOM 是 `span[data-image-ref]`，绝不创建 `img` 或加载资源；其同段正文、strong/em/code/link 仍保留真实结构。图片定界符、路径/title 与引用定义仍只由精确源码补丁维护。
- paragraph、heading、list、blockquote 均可包含真实 link mark；列表/引用内显示文字可编辑，不再拒绝载入。
- 文本叶按所属顶层范围中的 PM 顺序映射，重复显示文字按真实 PM 位置区分。候选补丁必须重新解析并与目标 `PM doc` 做 `doc.eq`；失败则保留可信 source/state 并阻断保存。
- `inclusive:false` link/image mark 在完整替换其文本叶时会被 PM 默认丢弃；`transaction()` 只对「替换完全位于同一文本叶」的单步文本事务继承原 marks。跨叶、多步、结构和一般 mark 事务仍拒绝。
- 005 的安全边界没有移除：数学/围栏等含混输入仍进入 pending 并阻断保存；除 `task_list`、`gfm_autolink`、`image` 外的未知 safety risk 仍拒绝。

## 冻结 case03：全链证据

输入 `input.md`：475B，SHA-256 `7dd2d074e44cca9c1f3dcedc38af29d13debd0697ba4bd0f7e59b8299703f223`。驱动为 `sourceEdit` → 真实 EditorView 刷新 → 三个真实模型操作 → 内存保存点；预期文件只在操作完成后读取。

| 步骤 | 模型动作 | 结果 SHA-256 | `refsKept` |
| --- | --- | --- | --- |
| 1 `Inkora 文档`→`Inkora 手册` | link-mark 文本事务 | `d9033db6a06e4f782239229a9cfb2d37f5de2d571e9bc64fd0ce6728c1624a0c` | true |
| 2 `图标`→`图示` | image-only placeholder 文本事务 | `7450c1259be4f65c8d0c58efc4f1f08d9a10aca2e19078fa72d03369ee54738f` | true |
| 3 行内 href 加 `-v2` | `actions.linkTarget`：目标字节局部补丁 + 真实 `addMark` | `4b5bfa9e8924e367fb0b6b96853915fb4e0569566fae251b8aa6b07d93d8e99d` | true |
| 4 保存 | 仅建立内存保存点 | 同上 | true |

载入后的模型和 DOM 另行断言：5 个 `link` mark / `a[href]` 分别显示行内、完整引用、折叠引用、快捷引用与尖括号自动链接；href/title 正确；标题只显示「链接保真」；裸 URL 不是 anchor；图片是 `SPAN` 且没有资源加载。两条定义（含引用 title 与 `/assets/icon.png`）及所有未操作字节每步保持不变。

## 独立反例与回归

`check.mjs` 当前 28 项通过，其中本轮覆盖：

- link heading 不显示 `#`/引用定界符；邻近 link 的 strong/em/code 不丢失；图片占位不吞同段正文、strong 或旁链。
- list / blockquote 内 link 载入为真实 anchor，显示文字可按 PM 位置修改。
- 同段两个「镜像」按第二个 PM 位置修改，第一处和同 URL 的两条定义不动。
- 缺失引用定义按普通文本载入；≤3 空格缩进定义、BOM、CRLF、图片路径/title 保持原字节。
- 通用 inline ledger 尚有真实反例：`[a](later)later` 的后一个 `later` 会先撞到 href；`[A \\* B][r]` 的显示文本经过转义规范化后无法直接定位。两者都被映射/重解析守卫拒绝，可信 source/state 不变且保存禁用；没有退回整段源码化。

## 证据分层

| 层级 | 已执行 | 本轮能主张 | 仍未验证 |
| --- | --- | --- | --- |
| 模型 | parse、顺序映射、局部 patch、`doc.eq`、pending/save gate | 上述样稿与反例的结构/字节行为 | 通用 Markdown inline source map |
| jsdom | 真实 bundle、28 项 check、完整 crossval | PM mark、DOM 结构、内存状态和字节 SHA | 像素、WKWebView 事件差异 |
| 生产 editor 回归 | 锁定工具链 `tsc` + Vitest | 10 文件 / 122 项通过 | 原生宿主 |
| WKWebView / 系统 IME | 未执行 | — | 光标、composition、系统输入法历史 |
| 磁盘 / Sandbox | 未执行 | 内存保存点字节 | 写盘、重开、授权、冲突 |
| 图片资源 | 明确未加载 | 占位范围与路径/title 字节 | 解码、布局、资源访问 |

## 与已合入 010（`713e922`）的冲突面

- `model.ts`：009 修改 schema/parser、`sourcePosition`/叶顺序账本、mark 继承；010 同文件增加 selection snapshot/content-anchor 映射。必须手工合并两套状态/映射契约。
- `main.ts`：009 增加 prototype schema、`linkTarget` 与带 side 的 source mapping；010 重写 source-mode selection、apply/cancel/undo/redo。预计直接冲突。
- `crossval.mjs`：009 增加 case03 semantic projection 与 `linkTarget` 驱动；010 更新 selection 操作。需保留双方驱动，不能让 010 的 09 结论替代 009 的 case03 oracle。
- `check.mjs`：010 在同一区域加入大量 selection/empty-document 检查，并在其分支差异中删除旧 009 引用块；集成时必须保留本轮 28 项中的引用语义/反例检查，并同时保留 010 的 selection 检查。
- `selection-map.ts`、`native-host/` 本轮未修改；本分支没有合并 010。

## 实际命令

```sh
make -C editor/prototypes/fidelity test
# PASS：build + prototype tsc + 28 checks

node editor/prototypes/fidelity/crossval.mjs
# case03 4/4 PASS；02、10 回归 PASS；05/06/11 保持旧驱动/旧预期差异；09 不宣称选区通过

/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor lint
/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor test
# PASS：10 test files / 122 tests
```

结论仅限本原型的模型/jsdom 与字节证据，不宣告 M0。
