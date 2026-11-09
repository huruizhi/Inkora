# 文档大纲与统计（document-analysis）

`analyzeDocument` 是基于不可变快照 `{ raw, revision }` 的纯函数：返回文档大纲（标题索引）与原文/内容双口径统计。不修改输入、不读写文件、不触 DOM；不执行 HTML、不生成或改写 slug。

## 输入契约

```ts
analyzeDocument({ raw, revision }, { excludedRanges?: SourceRange[] })
```

- `raw: string`：原文，**不做任何归一化**。BOM、LF/CRLF/混合 EOL、孤立 CR 均保留，所有返回偏移都是 `raw` 的 UTF-16 半开区间 `[start, end)`。
- `revision: number`：原样带回结果，用于调用方校验快照一致性。
- `excludedRanges`：调用方已识别的高级原文/元数据范围。校验通过后在**解析副本**上等长屏蔽（保留 EOL 字符与行结构），原文本身不变。

非法快照（`raw` 非字符串、`revision` 非有限数字）抛 `TypeError`。

### 排除范围校验（抛 `ExcludedRangeError`）

- 偏移必须是整数且 `0 <= start <= end <= raw.length`；
- 范围之间不得重叠（相邻 touching 允许）；
- 边界不得落在 `\r` 与 `\n` 之间（切断 CRLF）；
- 边界必须落在字素簇边界（切断代理对、ZWJ 序列、组合重音均拒绝）。

校验后按 `start` 升序回显在结果的 `excludedRanges`。

## 大纲规则

解析复用锁定的 `markdown-it`（`commonmark` 预设），不使用正则标题扫描器：

- 识别 ATX 1–6 级与 Setext 1–2 级；`---` 分隔线与 Setext 下划线按 CommonMark 区分；
- 嵌套引用/列表中的标题照常识别；重复标题原样保留，不去重；
- 代码围栏与缩进代码块中的 `#` 不是标题；不闭合围栏延伸到文末；
- 显示文本来自 inline token：链接取 label、行内代码取内容、图片取 alt；换行位显示为空格；HTML token 不执行也不显示；
- 尾随 EOL 指 LF、CRLF 或孤立 CR；标题 `end` 均不含尾随 EOL，其余按原文折算。

## 统计口径

两组统计结构相同：`characters`（字符数）与 `writingUnits`（写作单元数）。

### 字符（characters）

- 按 Unicode 字素簇计；纯空白字素不计；
- BOM 计 1 个字符；emoji 组合 / ZWJ 序列各计 1；`e` + 组合重音计 1。

### 写作单元（writingUnits）

- 每个 Han 字素计 1；
- 其他 Unicode 字母/数字的**连续串**计 1（附着组合符不拆）；
- 标点、emoji、空白、下划线/连字符只起分隔作用，不计单元；
- 不同块（段落/代码块）之间、块内换行处不延续字母数字串；跨格式定界符的相邻文本（如 `**加粗**`）视作连续。

### 原文口径（result.raw）

对整份 `raw` 计数：包含 Markdown 符号、链接目标、引用定义、格式定界符、BOM，**不受排除范围影响**。

### 内容口径（result.content）

只计可读文本：

- 计入：普通文本、行内代码内容、代码块内容（围栏内部行；定界符、信息串、闭合围栏行与引用/列表容器标记不计，不闭合围栏计到文末）、图片 alt、链接 label、标题显示文本、HTML 实体按解码后的解析文本；
- 不计：URL 与链接 title、引用定义、格式定界符（`*`、`#`、反引号等）、HTML 标签、排除范围（屏蔽为等长空白，UTF-16 偏移不变，天然不计）。

不承诺是 Typora 所有语言计数口径的精确复刻；未提供 `excludedRanges` 时只承诺 CommonMark 可见内容，不理解公式/元数据方言。

## 已知边界

- 排除屏蔽发生在解析副本上：若范围覆盖标题定界符等结构字符，大纲结构随之改变（这正是"排除已识别片段"的语义）；
- 词首 BOM 在解析副本中剥离（markdown-it 会将其视作正文文本），原文口径仍计入 1 字符；
- 规模烟测仅覆盖约 2000 行样本，不宣称真实 WK 性能预算。
