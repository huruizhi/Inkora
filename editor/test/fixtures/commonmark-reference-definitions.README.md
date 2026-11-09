# CommonMark 引用定义示例

相邻 JSON 的 27 个 `examples` 原样摘自 John MacFarlane 的 [CommonMark 0.31.2 规范](https://spec.commonmark.org/0.31.2/#link-reference-definitions)，示例 192–218。[原始 JSON](https://spec.commonmark.org/0.31.2/spec.json) 的 SHA-256 记录在文件中。

这些示例数据沿用原规范的 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 许可及署名。采集时没有改写 Markdown 或 HTML oracle。测试代码属于本仓库；测试运行只读取本地数据，不访问网络。

编辑器需要为仅定义文档保留可输入的空 paragraph，并按既有投影规则隐藏 code_block 最后一个逻辑换行。测试适配仅处理这两项投影差异和块间 HTML 排版空白，不规范化原文、链接目标、title、marks 或字节。

例201的无效定义含原始 `<bar>` HTML。按本项目既有 `SYN-D004`，该片段以原文不透明保留而不执行 HTML；这一例另用明确的保护片段/未解析引用/原文字节断言验证，其余26例比较语义 DOM。
