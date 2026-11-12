# INK-FIX-198：标题栏双击在桌面放大窗口

基线6eddd086899ee79eeff12855271856442adbf86c；分支task/INK-FIX-198-titlebar-maximize。
用户要求双击窗口最上方后在当前桌面最大化。双击填满当前屏幕visibleFrame，避开菜单栏和Dock；再次双击恢复原尺寸和位置，不切换全屏Space。

## 实现与诊断

使用Matt diagnosing-bugs流程；核读GLOSSARY及ADR-0001/0003。原生产WindowTitlebarDragSurface对所有leftMouseDown无条件performDrag。
真实隐藏NSWindow+原生产surface的合成双击（count1→2）RED：12项中1项失败、3个断言失败；窗口尺寸不变，拖动调用两次。
排查方向：双击分支缺失、标题几何命中错误、系统缩放内容限制。原事件确实两次到达performDrag，确认第一项；不需新增Bridge日志或系统设置修改。

原生层区分clickCount：单击保持原事件拖动；双击在当前screen.visibleFrame和保存的frame之间切换。恢复状态绑定弱window引用，几何clear不丢失它。
手动移动/调尺寸后，下次最大化重新保存恢复点；恢复位置按当前可用屏幕约束。全屏/不可调整/最小化窗口和附着sheet不进入尺寸切换。
标题工具、正文和系统按钮沿原hitTest边界排除；不进入Markdown/IME/选区/保存/退出链。无依赖、协议、权限、网络或用户设置变更。

## 文件与已跑验证

- app/Sources/WindowTitlebarDragSurface.swift：桌面尺寸切换及恢复。
- tests/InkoraTests/SidebarNavigationTests.swift：两项实际NSWindow回归，覆盖最大化/恢复、几何失效、手动移动后的恢复与命中边界/不可缩放窗口；原10项保留。
- tests/InkoraTests/SidebarNavigationHostless.sh：精确计数10→12。
- project.yml：本机候选build12→13，marketing0.1.0不变。
- 本任务及docs/evidence/INK-FIX-198：真实RED/GREEN与构建证据。

`make editor-build`成功；`zsh tests/InkoraTests/SidebarNavigationHostless.sh`修复后12/12通过；两份Swift严格格式和git diff --check成功。
测试无可见窗口，用实际NSScreen可用frame；不等同物理鼠标双击、可见paint、VoiceOver或macOS14实机验收。
全量lint、Release构建和最终精确HEAD默认CI待本轮结算；本机当前仍build12，未提前安装。

## 本机安装门禁

准备build13后需用户保存退出并验证所有Inkora进程消失，再做恢复目录与旧/新App私有ZIP备份、逐文件SHA核对及原子替换。
安装后重新核对版本/双架构/签名权限/全包资源，使用真实安装包资源跑同一Native12项，再正常启动。
不沿用上一轮对build11的强退授权；无公开Release/tag/feed或Keychain操作。仍为本机ad-hoc预览，不冒称公证或完整桌面验收。
保留原始产物与工作树待两层备份，不删除用户文档或共享依赖。
