# SOURCE LEDGER EVIDENCE：INK-PROT-020 常见块与空结构覆盖

日期：2026-11-08。固定起点 `738e5e0583e2f19f2ec2fa4e71cbf7fa10f43cd0`，分支 `task/INK-PROT-020-ledger-block-coverage`。

本交付延续 019 的纯词法模块，只修改 `source-ledger.ts`、独立证据脚本与本文件；没有修改 `model.ts`、`main.ts`、`selection-map.ts`、HTML、生产代码、依赖、native-host、manifest 或冻结样稿。模块尚未接入 UI、事务或保存链路，不代表 M0、生产完成或通用 Markdown source map 完成。

> 后续状态：INK-PROT-022 已完成隔离原型接线；本文件的“尚未接入”只描述 020 交付时点。真实入口与新增风险见 `LEDGER-INTEGRATION-EVIDENCE.md`。

## 结论

旧实现把 PM 文本叶放进所属块原文做顺序 `indexOf`，006 又以正反贪心一致作为唯一性依据。两者都无法回答一个原文片段为什么属于正文、label 还是 href。新模块改为三段式证据：

1. 锁定的 `markdown-it` 块 token 只提供行范围与 raw inline content；账本用块前缀词法规则把 content 限定到具体原文行，不用展示文字做全块首现搜索。
2. 独立 inline lexer 将 raw content 分为可视正文、link/image label、href、title、引用标签、引用定义、定界符、code、escape、entity、softbreak 等 span。每个可视 grapheme/解码 atom 持有自己的 source span。
3. 只有词法投影全文等于真实 `model.parse()` 的 PM 文本叶，并且 link/image 的 PM mark `href/title` 与词法结果相同，才返回成功账本；不一致、未覆盖或歧义直接 `{ ok:false }`。

因此 `[a](later "later")later` 中三个 `later` 分别为 `href`、`title` 和正文；只有最后一个参与 PM 文本映射。href/title 内偏移返回失败，不会撞到同名正文。

020 补上三类此前明确缺口：`fence`/`code_block` 块 token 直接建立逐行代码原文所有权；两种 CommonMark hardbreak 映射为真实 PM atom；空文档、纯空白、仅定义及空 textblock/code block 使用零宽插入锚点。固定起点上 case05 input 的范围 `72..100` 可重跑得到“有 PM 文本但没有可审计 inline token”；修改后 input 与四个 after 状态均能构建。

首轮 `8923def` 后的限定修正又封闭两个保真边界：只有 BOM 的文档把唯一插入边界设为 BOM 后的 UTF-16 offset 1，BOM 加空白的前候选也从 1 开始；缩进代码在 EOF 无物理换行时只投影真实源码单元，不把 markdown-it 补入 `token.content` 的逻辑换行伪造成 source span。

## 纯 API 与坐标契约

```ts
buildSourceLedger(source, pmDoc, ranges): BuildLedgerResult
visualToSource(ledger, anchor, head, options?): LedgerMapResult
sourceToVisual(ledger, anchor, head, options?): LedgerMapResult
debugSourceLedger(ledger): string
```

- `source`、PM position、所有 span 均为 JavaScript UTF-16 偏移；没有混入 UTF-8 byte offset。
- `Range` 仅 `import type` 自 `model.ts`，模块不持有 `FidelityModel`、EditorState、DOM 或全局 parser/ruler，也不修改传入对象。
- anchor/head 分开映射。非折叠选区的较小端取右侧内容边界、较大端取左侧内容边界，前向/后向方向保持。
- 相邻 marks 共用一个 PM position、但 raw 中间有定界符时，折叠光标默认明确失败并返回候选；调用方必须给 `collapsedAffinity: 'left' | 'right'`。
- 默认不吸附。只有显式 `snap:'nearest'` 才记录吸附说明；href、title、引用 label/definition、delimiter、保护块内部不会静默映射到同名正文。
- direct emoji surrogate pair、组合 grapheme、escape 和 entity 只开放 atom 两端。emoji 的 surrogate 中间、`e\u0301` 的 grapheme 中间、`&amp;`/`\*` 的 raw 内部均安全拒绝。
- CRLF 的两个 UTF-16 单元由一个 softbreak/code-newline atom 持有；CR/LF 中间偏移拒绝。BOM、原始 EOL、定义拼写始终只读，模块没有 serializer 或 source 写入路径。
- PM `hard_break` 不是文本叶：其 `nodeSize=1`，账本以 `projection:'atom'` 将 PM `[pos,pos+1]` 绑定到完整的 `"  \n"`/`"  \r\n"` 或 `"\\\n"`/`"\\\r\n"` 原文 span。atom 左右边界分别映射 marker 起点和行尾终点；marker/CRLF 内部拒绝。
- 零宽 `insertion-anchor` 只用于真实空 textblock 的内容位置（节点 `pos+1`）。空 heading/quote/list 锚定在各自块前缀之后；空 fenced code 锚定 opening EOL 后、closing fence 前。
- 空源码只有一个 source 边界。纯空白或仅引用定义有“前/后”两个合法 gap；PM→source 默认返回候选并失败，调用方必须给 `collapsedAffinity:'right'`（前）或 `'left'`（后）。不会静默重置到文档头，也不会跨块借用下一个正文锚点。
- BOM 是文件前缀而不是正文前 gap：只有 `BOM` 时唯一边界为 1；`BOM + 空白` 的候选为 `[1, source.length]`。offset 0 不映射，BOM span 保留为非可视原文，模块不删除或吞并它。
- 缩进代码投影以物理 source 行为准。markdown-it 在无尾换行 EOF 处补给 `token.content` 的逻辑 `\n` 没有 source offset；账本既不创建零长伪换行，也不写回换行，最终仍以真实 PM code text 全量校验。

## 支持表

| 语法/上下文 | 当前行为 | 证据 |
| --- | --- | --- |
| paragraph、ATX heading、普通 list item、blockquote | 词法记录块前缀，正文建立可视 span | heading/list/blockquote 跨 marks 有向选区 |
| inline link（含 href/title） | label 可视；括号、href、title 非可视且分角色 | href/title/body 三处同字反例 |
| full/collapsed/shortcut reference | 可视 label 与引用 label、定义 label/href/title 分离 | 三种引用同一用例 |
| 尖括号 URL/email | 仅在显示文本不发生额外规范化时支持 | heading 中 `<https://example.test>` |
| inline/reference image | alt 以 `image_ref` 可视 mark 校验；路径/title 非可视；不创建/加载图片 | 两种 image alt 精确 span |
| strong/em/strike | 定界符非可视，内容保持原角色 | heading/list/blockquote 相邻 marks |
| inline code | 精确 backtick run；CommonMark 外层单空格和换行规范化有独立 span | 双反引号、CRLF→显示空格 |
| backslash escape、HTML entity | 解码后的 atom 绑定到完整 raw span | `\*`、`&amp;amp;` |
| softbreak、CRLF | 显示 `\n` 绑定原始 LF 或 CRLF span | CRLF softbreak |
| emoji、组合字符 | grapheme 两端可映射，内部拒绝 | 😀 与 `e\u0301` |
| 缺失引用定义 | 与真实 parser 一致，整段保持字面可视文本 | `[Missing][nope]` |
| protected_block | 仅记录不可视 protected span，内部无伪文本锚点 | 块内 source→visual 拒绝 |
| fenced code block | opening/closing marker、info、indent 非可视；内容按物理行和 UTF-16/CRLF 建立 `code-text` | BOM、4→5 长围栏、info、多行 CRLF、无文件尾换行、空块 |
| indented code block | 每行四空格或 tab 前缀非可视；内容与真实内部换行按字面映射 | 空格/tab、单/多行 EOF 无 LF、BOM 组合 |
| hardbreak | 双空格与反斜线写法分别拥有完整 raw span，对应真实 `hard_break` atom | atom 两侧选区与内部拒绝 |
| 空文档/纯空白/仅定义 | 显式零宽插入锚点；多个 gap 强制 affinity；BOM 后才是首个合法 gap | 默认/left/right 与 source→visual，不默认 nearest |
| 空 heading/quote/list/code block | 锚定块自身可视插入位置，不跨块猜测 | `#`、`>`、`- `、空 fence |

## 明确边界与反例

- 引用定义词法器当前只承诺单行 CommonMark 形态；多行 label/destination/title、复杂 continuation 明确可能 build 失败，不能降级为猜测。
- block content 定位只承诺本证据覆盖的 heading/paragraph/list/blockquote 常见前缀；复杂 lazy continuation、深层混合容器必须先扩充词法规则和独立用例。
- emphasis/strike 当前支持可证明的配对形式。复杂 CommonMark delimiter-run 规则若与 PM 结果不同，会被“词法投影 != PM 文本”守卫拒绝。
- 发生可视规范化的 autolink、跨行复杂 link、复杂 lazy continuation、tab/空格混合且依赖列展开的缩进代码、未覆盖内联语法均不宣称支持；投影不一致时整个 build 明确失败。
- 未闭合 fenced code 继续遵循 `model.parse()` 的 protected/issue 路径；账本不自行修复 closing fence，也不自动切换整篇源码模式。
- 多个空 textblock 共处同一 model range、且无法把每个 PM 插入位置唯一定位到对应物理行时，当前明确失败，不猜第一个位置。
- 合法 `find closing delimiter` 使用局部 `indexOf`；它只在已经识别的语法结构内找同类闭合符。模块没有用展示文字的全局首现、顺序命中或正反贪心一致来声明 source ownership。
- `snap:'nearest'` 是审计可见的可选边界策略，不适合作为编辑事务的默认行为。

## 独立来源断言

`source-ledger-check.mjs` 在拼装 fixture 时同步记录 expected raw span；expected 不读取账本结果，也不调用旧 `sourcePosition`。脚本用 Vite 临时打包真实 `model.ts` 与新模块，随后立即删除临时入口/产物。通过的 17 组覆盖：

1. `[a](later "later")later` 的 href/title/body 三重同字；正文内部映射准确，另外两处拒绝。
2. `\*` 与 `&amp;amp;` 显示两端映射；entity raw 内部、emoji surrogate 中间、组合 grapheme 中间拒绝。
3. full/collapsed/shortcut reference、reference image、inline image；引用 label/定义不可视，alt 精确落在各自原文。
4. BOM + CRLF 下 heading/list/blockquote 内 inline/reference/autolink，邻接 strong/em/strike/code，前向和后向跨 marks 选区。
5. softbreak CRLF 与 inline-code 内 CRLF→空格、外层空格规范化。
6. 缺失定义保持字面量；protected block 内部拒绝。
7. link/strong 相邻叶共享 PM 边界时默认返回两个 raw 候选，left/right affinity 分别准确落边。
8. 调试输出同时含 source role/syntax 与 PM span，不以映射再反映射自洽代替来源断言。
9. BOM、两空格缩进、四反引号 opening/五反引号 closing、info、CRLF、多行内容、文件末尾无换行的 fenced code 精确 span。
10. 缩进代码的逐行前缀与字面内容；代码内反引号、美元、强调 marker 不进入 inline lexer。
11. 双空格与反斜线 hardbreak 各自命中真实 PM `hard_break`，并断言 `nodeSize=1`、atom 两侧 source 边界及内部拒绝。
12. 空文档、纯空白、仅定义、空 heading/quote/list/code block 的 expected source/PM 插入位置；块间 gap 拒绝。
13. 读取冻结 `cases.json` 但不修改它：15 个 variant input 加 case05 四个 after 状态，共 19 次真实 `model.parse()` + `buildSourceLedger()`。
14. 10,560 UTF-16、160 块、三次重复构建的有规模测量。
15. `BOM` 与 `BOM + 空白` 的默认/left/right、source→visual、offset 0 拒绝和 BOM 前缀不变。
16. 四空格/tab 缩进代码的单行、多行末尾无 LF，以及 BOM 组合；断言真实 PM 文本端点、raw offset 和所有 span 不越过 source length。
17. code/link 混排：fence、缩进代码、HTML literal、受保护数学块内的同名定义不污染正文；仅代码定义保持正文为字面量；合法重复定义 first-wins，ledger 只把真实定义范围标为 definition spans。

典型调试输出：

```text
0..1 delimiter/link-label-open
1..2 link-label/literal -> PM 1..2 "a"
2..3 delimiter/link-label-close
3..4 delimiter/inline-link-open
4..9 href/inline-href (later)
10..17 title/inline-title (later)
18..19 delimiter/inline-link-close
19..20 text/literal -> PM 2..3 "l"
```

实际 span 以 `debugSourceLedger()` 为准；上例仅展示角色关系。

## 时间、空间与实测

- 本次固定 workload：10,560 UTF-16、160 个段落块，在当前机器三次构建为 `4.41 / 3.31 / 4.16 ms`。测试每次都会输出当次测量；该数字只证明此 workload 可重复构建，不是复杂度证明，也不是生产 SLA。
- 当前 prototype 对每个 range 过滤整组 token，局部 closing-delimiter 搜索和保守 mark 扫描也会重复搜索；已知最坏时间仍为 `O(n²)`。本任务没有声称线性，也没有用上述计时推翻最坏界。
- `fillGaps` 使用与源码 UTF-16 长度相同的覆盖数组；每个 grapheme 建 atom。空间成本至少为 `O(source UTF-16 units + spans + PM projection units)`，常数明显高于旧叶级顺序表。
- 每个 grapheme 建立一个 atom，换取 entity/escape/Unicode 内部偏移可审计性；长纯文本的常数内存高于旧叶级顺序表。

## 未来接入步骤

1. 解析完成后以 canonical source、同一次 `parse()` 的 `doc/ranges` 构建 ledger；失败即保留源码模式/阻断该次结构化映射，不缓存半成品。
2. 用 ledger 的 `visualToSource` 替换 `model.sourcePosition`，事务 `from/to` 按方向选择 inward affinity；不得打开默认 nearest snap。
3. 用 ledger 的 `sourceToVisual` 替换 `selection-map.ts` 的叶文本贪心；源码端落在 href/definition/delimiter 时让 UI 明示“不可视语法”，由用户选择源码模式或显式边界吸附。
4. 018 的原生事务完成后由管理者在独立整合任务接线；本分支不改 018 正在使用的 `model.ts`/`main.ts`/native transaction，也不等待 018。接线时 hardbreak 必须按 atom `[pos,pos+1]` 处理，空文档多 gap 必须传 affinity 或展示歧义，不能继续套文本叶偏移。
5. 接线前增加复杂 delimiter、lazy continuation、多行 reference、复杂缩进列展开与性能上限用例，再跑生产 editor 和原生 IME/selection/undo 验收。

## 实际命令与结果

```sh
editor/node_modules/.bin/tsc \
  -p editor/prototypes/fidelity/source-ledger-tsconfig.json
# PASS（strict TypeScript，无输出）

node editor/prototypes/fidelity/source-ledger-check.mjs
# PASS：17 组独立来源断言；真实 model.parse/PM 路径；临时 bundle 已清理
# 冻结 fixture input + case05 after：19 次构建通过

python3 editor/prototypes/fidelity-cases/verify.py
# 用例 11，步骤 49；检查通过 582 项，失败 0 项

git diff --check
# PASS（无输出）
```

固定起点回归探针（一次性 detached worktree，临时 `node_modules` link、entry、bundle 和 worktree 均已清理）：

```text
EXPECTED BASELINE FAIL: 范围 72..100 有 PM 文本但没有可审计 inline token
```

未运行 111/122 生产测试，也未运行 WKWebView、桌面、系统 IME、磁盘/Sandbox 或图片资源测试；本任务未修改产品代码，按任务边界不重复这些验收。
