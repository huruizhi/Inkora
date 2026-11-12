# 代码语言与行号

用户“继续推进”，按既有审计顺序进入代码块批次，基线1d07702，分支task/INK-UX-186-code-language-tools。[正式规格](../design/typora-code-tools.md)。复用锁定依赖的自建软链，不安装新依赖。

按公共highlighter→真实runtime语言选择→行号显示的垂直切片实施，保留red/green。测试接缝沿用审计和既有代码块测试，不新增测试专用产品入口。尚未运行的Native/CI/物理验收不能宣称完成。
