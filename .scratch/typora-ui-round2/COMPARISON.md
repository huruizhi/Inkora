# 第二轮 Typora 实机对照

2026-11-10，INK-UX-122。结论：**当前 Inkora 仍未达到 Typora 的整体写作观感**。优先差距在界面占位与信息层级；若要接近其光标进入格式时的编辑体验，还需要独立交互设计，不能只改 CSS。

## 固定基线与方法

- 规划代码：`3e26211713ff0f78f0e90286a6125ce613b3e442`，独立分支 `task/INK-UX-122-typora-comparison-plan`。
- 实际 App：`/Applications/Typora.app` 1.14.15 / 7789；`/Applications/Inkora.app` 0.1.0 / 3。当前浅色外观；未确认 Typora 主题名称、应用缩放或偏好值，未改变它们。
- 用户亲自统一窗口尺寸；留存的六张截图均为 JPEG、3714×2100。该数值是捕获栅格尺寸，不推定其等于逻辑窗口像素。同尺寸窗口不等于同正文列宽，也不构成像素一致验收。
- 两 App 实际打开同一自有文件：`.worktrees/INK-UX-110/.scratch/typora-experience/fixtures/Typora-Comparison.md`。其与本基线跟踪的[示例](../typora-experience/fixtures/Typora-Comparison.md)逐字节相同。
- 原文 SHA-256：`90885c3f2a22d54303c037cbd58e511bebbc192fdb2f41635709b146434c6293`；结束后复核未变。自有 `reference.png`：`358c81c341f665fed21c2d6175c8f5efc6f9a3bbb31191c325eafd74ab8f0dd8`。
- 已安装 Inkora `editor/index.html` SHA：`f66403d427565c8662f50f958d5c45be76eeba2bf4ee785702f6fca8368f6473`；`index-ByNkzaRX.js`：`00162cc8e32e74b844ec1dc11b6449356e7a15ed89e4e750ca747a267a189625`；可执行文件：`18e41f55bf55119ec167c054a1e99235399b6c6aa0828dac5811c096174dd1a2`。记录实际安装文件，不据版本号推断整包与源码完全一致。
- 操作为只读查看、滚动、大纲与表格聚焦、菜单查看；未输入正文、保存文档、切换主题或修改授权。用户其他真实笔记未编辑，未保存到对照材料。
- 后段 CUA 返回 `cgWindowNotFound`，重新绑定仍失败；未擅自判断锁屏原因。停止继续交互，保留已取得证据并释放 UI 锁。没有因此再向用户要求输入法或系统版本测试。

## 截图索引

所有图均为 CUA 原始截图，仅将错误的 `.png` 扩展名改为实际编码 `.jpg`，未重编码、裁剪或拼图。SHA 列表见 [SCREENSHOTS.sha256](SCREENSHOTS.sha256)。屏幕左上紫色共享标识是捕获环境覆盖层，不属于任一产品设计。

| 文件 | 状态及用途 | 不支持的结论 |
| --- | --- | --- |
| [Typora 阅读](screenshots/typora-user-sized-reading.jpg) | 文首、大纲展开 | 不证明其字体、主题与 Inkora 相同 |
| [Inkora 阅读，大纲展开](screenshots/inkora-matched-outline-open.jpg) | 与上一张作为首屏定性配对 | 正文列宽仍不同，不据屏内段落数计算间距差 |
| [Inkora 阅读，大纲收起](screenshots/inkora-user-sized-reading.jpg) | 记录默认收起后的空间利用 | 不与 Typora 大纲展开图直接比较横向对齐 |
| [Typora 表格/技术内容阅读](screenshots/typora-table-reading.jpg) | 滚动后阅读态 | 不证明表格激活工具或所有技术编辑交互 |
| [Inkora 表格/代码阅读](screenshots/inkora-table-reading.jpg) | 表格未激活，工具不显示 | 不属于技术内容同滚动位置配对 |
| [Inkora 表格激活](screenshots/inkora-table-active.jpg) | 光标进入“正文编辑”，11 个文字按钮出现 | 未成功取得 Typora 同单元格激活态，不能作双侧工具尺寸比较 |

窗口尺寸未统一前两图及 Typora 表格定位失败图不进入正式截图集；本地 `build/typora-ui-round2-outtakes/` 仅作排错，不作为验收证据。

## 差距与解释

| 项目 | 本轮证据 | 结论与调整建议 |
| --- | --- | --- |
| 文档上方界面 | 同尺寸、大纲同为展开，Inkora 仍有贯穿窗口的查找/模式/插表/插图行与分隔线，首标题更低 | **P1**：先建立菜单/快捷键与状态资格，再收起常驻行。现有 Native 只建 File/Edit 等菜单，不能先隐藏按钮造成操作失联 |
| 正文阅读节奏 | Inkora h1 底线到首段、h2 到紧邻 h3 的局部留白较大；760px 阅读列导致更多折行 | **P1**：先局部收敛标题/段落层次；列宽独立比较，不能把额外折行归因于所有垂直间距都错误 |
| 表格工具 | Inkora 阅读态隐藏，进入单元格才出现完整 11 按钮 | **P1**：保留显隐，调整为少量主操作与更多菜单，保留所有命令与键盘入口。Typora 官方紧凑工具描述仅作参考，实际激活态本轮未证 |
| 大纲 | 两者都有左大纲；Inkora 默认收起、宽窗展开240px是已完成选择；代码未派生当前章节 | **P2**：可加当前章节提示，暂不扩张文件树。一次点击标题已在可视范围时不滚到顶，不足以认定导航失效 |
| 代码工具 | 已有离线高亮、语言切换和上下文工具；低频许可入口与语言操作同级是代码事实 | **候选**：下一次针对激活态核对密度再细化，不报告“没有高亮/没有语言选择” |
| 公式、Mermaid、脚注 | Typora 阅读图显示真实技术内容；Inkora 生产已有块公式 MathML、Mermaid 点击编辑和脚注导航；本轮未完成所有进入编辑的实机配对 | **P2**：重点补修改路径与脚注就近阅读，而非再建渲染器。Mermaid 懒加载占位在未滚入视口时不当作渲染失败 |
| 图片 | Inkora 自有图片当前显示目录未授权及修复入口；代码在成功态仍附加“描述…”按钮 | 资源未授权本身不是排版 bug。成功态安静呈现是待实测候选；保留授权/定位可发现性，不改 `.assets`、恢复及保存政策 |
| 行内标记 | 普通 PM mark 没有随 caret 展开 Markdown 分隔符的实现；Typora 官方明确描述进入格式展开源 | **P2、待决策原型**：本轮没有成功完成两 App 同位置焦点对照，不把静态事实扩张为交互实测通过；后续原型须保原始分隔符/选区/历史 |
| 统计 | macOS Typora 官方是标题栏统计；Inkora 底部统计为用户已确认偏好 | 保留有意差异，不为仿照撤回既定布局 |

## 未验与来源

窄窗、深色、相同正文宽度、成功授权的图片、Typora 表格激活、行内标记进入退出、完整公式修改和脚注来回均未完成可靠配对；它们是后续切片的验证项，不是本轮新发现的确定 bug。

本轮没有运行产品测试、构建、XCUITest、物理 IME、保存重开或 macOS 14 实机验收；不使用旧绿灯替代本轮视觉证据。官方资料和固定代码位置见 [TYPORA-REFERENCE.md](TYPORA-REFERENCE.md)，具体推进见[第二轮计划](../../docs/design/typora-ui-round2-plan.md)。
