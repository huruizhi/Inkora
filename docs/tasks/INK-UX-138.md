# INK-UX-138 紧凑表格上下文工具

基线：240b8bcde78347328ff049743cb8baeee1c3103a。

完成：主工具为后插行、后插列、更多；九项次级命令保留原标识、删除列禁用条件及局部原文补丁路径。更多具备中文名称、menu/menuitem、expanded，支持鼠标、方向键/Home/End、Tab关闭、Esc返回正文及原有Option+F10。菜单焦点保持工具可见，外部pointerdown或焦点离开关闭。

边界：菜单只持有打开时EditorState；选区或内容变化后拒绝旧动作。NodeView销毁、detached、不可编辑和composition均拒绝，compositionstart主动关闭。仅本地菜单行为改变，无runtime/parser/ledger/Bridge接线变更，无依赖变化。

测试保留原有composition F10不消费、pointerdown防blur、原文/status/snapshot/history强断言。冻结表格golden不改，仅让旧测试的点击助手先打开次级菜单。新增生产runtime+EditorView公开DOM事件测试覆盖表外选区后的仍连接按钮、取消、外部点击、键盘遍历、composing Escape、源码卸载旧动作、BOM/CRLF/Unicode局部补丁和一次Undo/Redo。

实跑：

- `pnpm --dir editor exec vitest run src/context-tools.test.ts src/table-menu.test.ts src/tables-tasks-runtime.test.ts src/editor-runtime.test.ts`，88项通过。
- `make lint`，通过。
- `make editor-build`，通过；保留既有大chunk警告。
- 自有artifacts/INK-UX-138临时Vite harness导入生产runtime、样式、EditorState，Swift裸runner创建不可见NSWindow/WKWebView并断言window.isVisible为false。360/900px长表均横滚；菜单在viewport内，九项完整可达，展开不移动表格。最终toolbar顶边80px，高于上一段底边78.59375px；菜单130×182.6875px。原始结果见同域evidence。

最小失败先红：新菜单入口缺失；修复后通过。真实WK加测发现旧继承行高造成工具遮上段约9px，独立CSS收紧工具行高后复测通过。不是以jsdom或class断言替代布局。

未验：物理IME、macOS14、屏幕paint、VoiceOver口述、全量Native/Release/CI和极端小于360px视口；遵照本轮禁止显示窗口及集中集成验证约定。无安装、PR、merge或Issue操作。临时harness在本工作树artifacts保留供主会话备份；依赖仅临时符号链接，交付前unlink。
