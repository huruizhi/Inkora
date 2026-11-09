# INK-UI-042：写作辅助真实产品验收准备

状态：构建与样稿准备完成，真实UI **未执行**。范围为已合main的大纲重复标题定位/折叠空间、长文真实滚动、查找框焦点/键盘、source/bare-CR导航；不代替039新内核或整个首阶段验收。

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
