# GFM 自动链接示例

相邻JSON的14例来自 [GitHub Flavored Markdown 0.29-gfm §6.9](https://github.github.com/gfm/#autolinks-extension-)，示例622–635，包含来源HTML的SHA-256。Markdown和预期HTML从页面代码块提取，只移除页面用于显示空格的HTML包装并解码HTML实体，没有按本实现修改预期。

来源署名：GitHub Flavored Markdown Spec（GitHub），基于 John MacFarlane 的 CommonMark Spec。示例数据沿用官方的 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 许可。测试代码属于本仓库；执行时只读离线JSON，不访问网络。

本组均为普通段落；通过DOMSerializer比较实际PM与官方HTML的完整子元素，不丢弃链接、文字、属性或标点。另有公共生产会话/真实EditorView与main表单、查找面板回归，分别记录原文字节和历史，不以语义比较替代保真。
