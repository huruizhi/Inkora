# 原文查找替换模块

`editor/src/source-search.ts` 提供不依赖 DOM、编辑器状态、网络或磁盘的纯函数 API。它只处理调用方提供的当前 Markdown 原文快照，不写文件，也不创建 dirty、history 或保存点。

## 快照与范围

输入快照为 `{ raw: string, revision: number }`。所有范围均是 `raw` 上的 UTF-16 半开区间 `[from, to)`，不规范化 Unicode，不转换 LF、CRLF 或混合行尾。搜索结果保留其绑定的 `raw` 与 `revision`；任何替换计划都再次同时校验二者，避免同 revision 异原文或 revision 已变化时写入旧内容。

模块拒绝会切断 surrogate pair、字素簇或 CRLF 的匹配。文件开头的 BOM 可以保留在搜索快照中，但不会作为可替换正文返回。`rejected` 会记录被筛掉的原始范围、文本和原因。

## 搜索

```ts
const result = searchSource(snapshot, query, {
  caseSensitive: true,
  maxResults: 10_000,
});
```

- `query` 始终按字面值处理，正则特殊字符没有特殊含义。
- 默认大小写敏感；关闭后使用 ECMAScript Unicode 简单大小写匹配，不做规范化，也不做 `ß` → `ss` 一类多字符完整折叠。范围来自实际匹配文本的 UTF-16 长度。
- 匹配默认不重叠。空查询返回有限的零匹配结果。
- 默认上限为 10000；调用方只能指定更小的正整数。存在更多合法匹配时 `truncated` 为 `true`。
- 搜索覆盖整个 `raw`，包括引用、代码和未来适配器可能标记为保护片段的源码。

`findSourceMatch` 从有向选区查找前一个或后一个匹配，可选择是否回绕。若当前选区正好是一个匹配，会越过它，避免重复卡住；返回选区保持调用方原来的正向或反向语义。非法 UTF-16、字素或 CRLF 选区边界会抛出带 `code: "invalid-selection"` 的 `SourceSearchError`。

## 替换计划

`planSourceReplacement` 规划单个匹配，`planSourceReplaceAll` 规划全部匹配。成功结果包含：

- 精确的 `expected` / `insert` patch；
- 由 patch 推导出的 `resultRaw`；
- 实际变化计数与 `changed`；
- `applyOrder: "descending"`，且 patch 数组已按原文位置从后向前排列；
- 结果文档上的建议有向选区。

替换文本完全按字面插入，`$&`、`$1` 等不会被展开。无匹配和 no-op 返回零 patch，不凭空制造编辑。全部替换拒绝使用 `truncated` 搜索结果。

失败返回 `{ ok: false, failure }`，其中保留原始替换意图、当前快照、稳定原因码和说明，不返回部分计划。以下情况会失败：

- revision 或原文与搜索绑定快照不一致；
- 指定匹配不存在，或全部替换基于截断结果；
- 替换文本含未配对 surrogate；
- 输入选区非法；
- 替换后建议 caret 位于合并后的字素簇或 CRLF 内部，例如替换尾部 ZWJ 与后缀 emoji 组合，或尾部 CR 与后缀 LF 组合。

## 适配器边界

本模块是源码能力，不代表可视模式的保护区可以直接编辑，也没有实现查找面板、匹配高亮、ProseMirror/WKWebView/Bridge/NSDocument 接入或保存流程。未来实际编辑器适配器必须在应用计划前重新落实 composition、保护片段和文档安全守卫，并把完整计划作为一个历史事务提交；不能逐 patch 形成多个撤销步骤。真实 WKWebView、中文输入法、安全保存和性能预算仍需独立验收。

测试中的较大字符串仅验证结果上限和有界执行，不是 WKWebView 或整机性能预算结论。
