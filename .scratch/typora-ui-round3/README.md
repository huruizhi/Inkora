# 安静顶栏后的760/900px实际阅读对照

2026-11-10，INK-UX-124。固定生产代码`6c5b749ca560a0064fb08ade472e3915a0ea1302`；与INK-UX-123最终门禁同一生产实现，本轮不修改默认宽度或其他产品代码。前序[第二轮对照](../typora-ui-round2/COMPARISON.md)仍为独立历史证据，不覆盖其截图。

## 方法与来源

- 用户明确解锁并允许只读查看自有示例，不重复输入法或macOS14专门验收。
- 本轮`make build APP_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UITesting`通过，在独立工作树构建/启动隔离的Debug App；未替换`/Applications/Inkora.app`。进程路径核对为本工作树`build/DerivedData/Build/Products/Debug/Inkora.app/Contents/MacOS/Inkora`，与既有安装版同时存在且为不同bundle ID。
- 自有文件[Reading-Width.md](fixtures/Reading-Width.md)为既有示例的逐字节复制；SHA-256 `90885c3f2a22d54303c037cbd58e511bebbc192fdb2f41635709b146434c6293`。图片也仅复制自有`reference.png`，SHA `358c81c341f665fed21c2d6175c8f5efc6f9a3bbb31191c325eafd74ab8f0dd8`。
- 用户解锁后desktop预检通过，持有UI锁期间用CUA操作自有窗口；结束时释放锁。通过标准窗口AX公开的“zoom the window”动作放大，不改变系统外观或Typora主题。
- 同一窗口、同一文档、文首、浅色、侧栏关闭，依次从真实“显示”菜单选760/900。两图均为原始JPEG、3718×2100捕获栅格，不把栅格等同逻辑px。未缩放、裁剪、拼图或重编码；左上紫色标识属于系统捕获覆盖层。
- [SCREENSHOTS.json](SCREENSHOTS.json)记录编码、尺寸和SHA；[SCREENSHOTS.sha256](SCREENSHOTS.sha256)可从本目录校验。新包主JS SHA为`550fd6b30c1d23f6e5dbfeede2fae2db527a8432bb3b283f96a1387fc35977e0`。

## 已观察结果

| 760px | 900px |
| --- | --- |
| [原始截图](screenshots/reading-760.jpg) | [原始截图](screenshots/reading-900.jpg) |
| 首段3行，较短的扫读跨度；表格标题在首屏下部 | 首段2行，首屏可见表格表头；正文横向空间利用更多 |

两图的字号、行高、标题间距和原文完全相同；额外可见内容主要由折行减少造成，不能用来断言垂直间距已经改善。900px更接近此前Typora宽列的方向，但本轮没有重新匹配Typora正文宽度、主题和缩放，不作像素一致结论。

常驻模式/插表/插图整行已收起；左侧轻量大纲、查找和底部统计仍可见。表格、代码工具重排与局部标题间距仍是后续独立切片，没有借宽度变化冒称完成。

## 真实入口核对（有限范围）

- “显示”菜单可见两档阅读宽度，可视模式在可视态禁用，源码入口可用；未提交时提交/取消资格按当前模式呈现。
- CUA发送系统快捷键⌘⌥⇧2，实际进入`Markdown source draft`并聚焦源码输入区；随后⌘⌥⇧1返回可视`Markdown editor`并聚焦正文。没有输入或提交内容。
- ⌘⇧O确实展开/收起大纲，另留[900px大纲展开图](screenshots/outline-open-900.jpg)。随后收回大纲，留下900px对照窗口供阅读。
- 结束后fixture SHA仍相同，文件无落盘修改。该哈希仅证明磁盘示例未改，不夸大为本轮重新验证所有内存history/dirty；这些自动断言见INK-UX-123。

以上是当前系统真实桌面、合成系统按键的只读入口观察，不等同物理键盘/真实中文IME、所有菜单、双文档路由、系统图片面板、深色或窄窗验收。图片授权成功态未在本轮查看，未扩大资源权限。

## 默认选择

本轮已把两图提供给用户，并建议宽窗900px、保留760px可选、窄窗自动收缩；**尚未据此修改默认值**。用户选择和后续实现另行记录，当前生产默认仍760px。

2026-11-10补记：用户查看上述同窗口对照后，已明确选择宽窗默认900px、保留760px可选及窄窗自动收缩。实现见INK-UX-126；上面的原始捕获事实与截图未改。
