# INK-UI-042：写作辅助真实产品验收准备

状态：真实UI部分通过，源码范围滚动失败待修。范围为已合main的大纲重复标题定位/折叠空间、长文真实滚动、查找框焦点/键盘、source/bare-CR导航；不代替039新内核或整个首阶段验收。

基线：48258a93b3fc4a75df21a22ac0d175e01943b744。独立worktree/branch为INK-UI-042 / task/INK-UI-042-writing-tools-runtime。未修改产品代码、依赖或系统设置。

实际命令：

```sh
make build APP_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UITesting \
  PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
codesign --verify --strict build/DerivedData/Build/Products/Debug/Inkora.app
```

两项返回0。构建按项目入口包含editor TypeScript/Vite及Xcode Debug打包，不冒称运行产品测试或UI套件。包ID与正式App隔离，主二进制SHA-256为7b23475c1cce3e2318e96e5d2140b3a8e5720f7e2f817c1b640c261e91c8869a。完整日志/版本记录在artifacts/ink-ui-042/（忽略目录），只复用既有锁定工具链，临时.tools和editor/node_modules符号链接已移除。

随后持项目UI锁执行desktop preflight，返回78并报告屏幕锁定；包装器已释放锁。没有调用open、CUA启动App、XCUITest或任何输入操作。既有普通App与用户文档未接触，不能宣称滚动/键盘/IME通过。

合成fixture位于/tmp/inkora-writing-042-fd6d59ff-8fe0-4fd6-ad19-e43ad603f814：Structured Long、Source Long、Read Only CR及manifest。25个标题（两个“重复标题”）、24个定位标记、超过100个“技术”匹配，用于区分首次同文盲定位、截断计数和长文视口。source样本按48258a9既有策略进入源码；039之后须通过明确模式入口重新核对，不能把旧模式当未来目标。bare CR保持只读。

待桌面可用时按真实UI完成：选择后一个重复标题→目标章节可见；折叠后正文空间与独立滚动正确；大小写和截断提示；Enter/Shift-Enter及点击导航的目标/焦点；query持焦的Undo不改正文、回正文后历史可用；source/readonly长文选择目标实际可见。若发现产品错误先冻结真实反例再修，不从jsdom推断滚动成功。真实IME必须另用物理键盘，不把CUA输入算作搜狗证据。

后台039/040经本轮一次权威状态核验均仍running且无pending permission，未因等待或观察超时重复启动。后续通知返回时继续独立验收和回收。整个首阶段目标保持active。

## 后续真实WK运行（覆盖上方历史未执行状态）

desktop preflight返回0，独占UI锁运行同一UITesting签名包，二进制SHA未变；只通过CUA和系统文件面板打开三份自有合成fixture。

- 可视模式点击第二个“重复标题”，实际视口到达第24节标题，前方定位标记23可辨，排除首次同文字盲定位。
- 折叠大纲后正文实际变宽，保留展开入口。
- ASCII查询emoji超过100处，界面明确“匹配至少100处，仅显示前100处”；EMOJI在区分大小写时0处，关闭大小写后恢复截断提示。CUA中文注入未进入查询框，故未把该工具动作计作中文输入法证据。
- 自有正文标记TARGET-END-042改为TARGET-EDIT-042；查询框持焦Cmd-Z正文标记保持，重新聚焦正文Cmd-Z还原，Cmd-Shift-Z恢复，再Cmd-Z还原。此结果仅证明文档历史隔离和future保留，不证明查询框自身文字撤销实现。
- **失败**：源码长文先点击末尾重复标题，再点首标题，视口始终停留第24节尾部。查询Start-042按Enter显示“当前第1/1处”、查询框保持焦点，但正文仍在文末；预览中的高亮不等于正文匹配进入视口。截图及AX操作记录见本轮对话，机器摘要见docs/reviews/INK-UI-042-writing-tools-runtime.json。
- bare-CR样稿显示真实只读提示；未做转换、只读输入和导航覆盖，不宣称完整通过。窄窗与VoiceOver仍未执行。

系统GoTo面板的AX setValue显示路径后确认会退回根目录；实际键入完整路径后正常打开，未据此判产品失败。未改系统设置或用户文件。通过Cmd-Q退出，限定自有042二进制进程确认不存在，UI锁释放。三份fixture实际磁盘SHA均仍与manifest一致；未保存任何测试修改。

后续INK-M1-047修复textarea目标显露，不改变原文/选区/history或通过夺回查询焦点伪造滚动。045负责生产内核补正，046负责代码高亮，两者独立继续。
