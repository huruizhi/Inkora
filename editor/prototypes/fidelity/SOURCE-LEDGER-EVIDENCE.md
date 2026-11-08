# SOURCE LEDGER EVIDENCE：INK-PROT-019 行内原文范围账本

日期：2026-11-08。固定基线 `30b73530af2e8dac37399a0dc9df64f8a9689eb3`，分支 `task/INK-PROT-019-inline-source-ledger`。

本交付只新增纯模块、独立证据脚本与本文件；没有修改 `model.ts`、`main.ts`、`selection-map.ts`、HTML、生产代码、依赖或冻结样稿。模块尚未接入 UI、事务或保存链路，不代表 M0 或通用 Markdown source map 完成。

## 结论

旧实现把 PM 文本叶放进所属块原文做顺序 `indexOf`，006 又以正反贪心一致作为唯一性依据。两者都无法回答一个原文片段为什么属于正文、label 还是 href。新模块改为三段式证据：

1. 锁定的 `markdown-it` 块 token 只提供行范围与 raw inline content；账本用块前缀词法规则把 content 限定到具体原文行，不用展示文字做全块首现搜索。
2. 独立 inline lexer 将 raw content 分为可视正文、link/image label、href、title、引用标签、引用定义、定界符、code、escape、entity、softbreak 等 span。每个可视 grapheme/解码 atom 持有自己的 source span。
3. 只有词法投影全文等于真实 `model.parse()` 的 PM 文本叶，并且 link/image 的 PM mark `href/title` 与词法结果相同，才返回成功账本；不一致、未覆盖或歧义直接 `{ ok:false }`。

因此 `[a](later "later")later` 中三个 `later` 分别为 `href`、`title` 和正文；只有最后一个参与 PM 文本映射。href/title 内偏移返回失败，不会撞到同名正文。

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

## 明确边界与反例

- 引用定义词法器当前只承诺单行 CommonMark 形态；多行 label/destination/title、复杂 continuation 明确可能 build 失败，不能降级为猜测。
- block content 定位只承诺本证据覆盖的 heading/paragraph/list/blockquote 常见前缀；复杂 lazy continuation、深层混合容器必须先扩充词法规则和独立用例。
- emphasis/strike 当前支持可证明的配对形式。复杂 CommonMark delimiter-run 规则若与 PM 结果不同，会被“词法投影 != PM 文本”守卫拒绝。
- hardbreak、发生可视规范化的 autolink、跨行复杂 link、未覆盖内联语法均不宣称支持。
- 合法 `find closing delimiter` 使用局部 `indexOf`；它只在已经识别的语法结构内找同类闭合符。模块没有用展示文字的全局首现、顺序命中或正反贪心一致来声明 source ownership。
- `snap:'nearest'` 是审计可见的可选边界策略，不适合作为编辑事务的默认行为。

## 独立来源断言

`source-ledger-check.mjs` 在拼装 fixture 时同步记录 expected raw span；expected 不读取账本结果，也不调用旧 `sourcePosition`。脚本用 Vite 临时打包真实 `model.ts` 与新模块，随后立即删除临时入口/产物。通过的 8 组覆盖：

1. `[a](later "later")later` 的 href/title/body 三重同字；正文内部映射准确，另外两处拒绝。
2. `\*` 与 `&amp;amp;` 显示两端映射；entity raw 内部、emoji surrogate 中间、组合 grapheme 中间拒绝。
3. full/collapsed/shortcut reference、reference image、inline image；引用 label/定义不可视，alt 精确落在各自原文。
4. BOM + CRLF 下 heading/list/blockquote 内 inline/reference/autolink，邻接 strong/em/strike/code，前向和后向跨 marks 选区。
5. softbreak CRLF 与 inline-code 内 CRLF→空格、外层空格规范化。
6. 缺失定义保持字面量；protected block 内部拒绝。
7. link/strong 相邻叶共享 PM 边界时默认返回两个 raw 候选，left/right affinity 分别准确落边。
8. 调试输出同时含 source role/syntax 与 PM span，不以映射再反映射自洽代替来源断言。

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

## 时间与空间

- 块 parse、行表、PM 文本校验、span/gap 建立在正常文档上均随输入长度线性增长，账本空间为 `O(source UTF-16 units + PM text leaves)`。
- 当前 prototype 的局部 closing-delimiter 搜索和保守 mark 扫描在刻意构造的大量未闭合定界符下最坏可到 `O(n²)`；这是进入生产前必须用 parser instrumentation 或游标缓存消除的已知风险。
- 每个 grapheme 建立一个 atom，换取 entity/escape/Unicode 内部偏移可审计性；长纯文本的常数内存高于旧叶级顺序表。

## 未来接入步骤

1. 解析完成后以 canonical source、同一次 `parse()` 的 `doc/ranges` 构建 ledger；失败即保留源码模式/阻断该次结构化映射，不缓存半成品。
2. 用 ledger 的 `visualToSource` 替换 `model.sourcePosition`，事务 `from/to` 按方向选择 inward affinity；不得打开默认 nearest snap。
3. 用 ledger 的 `sourceToVisual` 替换 `selection-map.ts` 的叶文本贪心；源码端落在 href/definition/delimiter 时让 UI 明示“不可视语法”，由用户选择源码模式或显式边界吸附。
4. 018 的原生事务完成后由管理者在独立整合任务接线；本分支不改 018 正在使用的旧 `sourcePosition`。
5. 接线前增加复杂 delimiter、lazy continuation、多行 reference、hardbreak 与性能上限用例，再跑生产 editor 和原生 IME/selection/undo 验收。

## 实际命令与结果

```sh
/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm \
  --dir editor exec tsc -p prototypes/fidelity/source-ledger-tsconfig.json
# PASS（strict TypeScript，无输出）

node editor/prototypes/fidelity/source-ledger-check.mjs
# PASS：8 组独立来源断言；真实 model.parse/PM 路径；临时 bundle 已清理

python3 editor/prototypes/fidelity-cases/verify.py
# 用例 11，步骤 49；检查通过 582 项，失败 0 项

git diff --check
# PASS（无输出）
```

未运行 111/122 生产测试，也未运行 WKWebView、桌面、系统 IME、磁盘/Sandbox 或图片资源测试；本任务未修改产品代码，按任务边界不重复这些验收。
