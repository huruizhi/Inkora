# 表格首批交互实现

用户已选择审计建议首批五项 TP-TBL-02～06。基线 da76d7b（build9）；历史差距表基于 main@755dc6c，不能作为新代码验收结论。

## 实施路径

1. 参数插表：现有 Native/Bridge `insertTable` 打开本地对话框；列1～20、总行数1～100（含一个表头）。确认后首格编辑，取消不变。runtime 保留默认2×2兼容调用并支持参数。
2. 统一结构命令：扩展现有 TableCommandMeta，提供行、列目标索引和目标规模。数据行从1开始、表头固定；列移动连同表头及对齐。保留范围外字节、原单元格格式、隐藏额外格及各位置换行。缺格只在必要时补空格。
3. 拖动：工具中的行列手柄启动，移动显示范围高亮与目标线，放下调用同一结构命令一次。Esc、composition、选择或内容变更、销毁、失焦取消；提供菜单键盘重排入口。
4. 网格：二维选择器预览列×总行数，可用方向键；数字输入支持完整上限。所有缩减先明确确认删除风险，取消不变；隐藏额外源码格也纳入提示。扩展时新增空格插在隐藏尾格之前，避免尾格意外变成可见数据。

所有内容变更在当前原文事务中接受，使用完整候选投影证明；UI意图绑定当前EditorState，不能迟到写入其他文档。无新依赖、无联网产品功能、无格式迁移。

## 既定验证接缝

沿用审计指定真实 runtime / EditorView / 正式命令：验证原文、投影、定向选区、Undo/Redo与composition；不能证明物理输入。main/Bridge 验证菜单进入、取消不涨revision及一次发布。真实隐藏WK验证手柄/网格命中、宽窄布局与滚动，不冒称屏幕paint或物理拖动。必要Native保存重开沿用现有正式快照/磁盘链。

按垂直切片先红后绿实现。最终补全测试命令、结果与未验边界，再进行独立Standards/Spec审查。

参考：[审计](../../../../.worktrees/INK-AUDIT-179/docs/design/typora-homepage-gap-audit.md)、[官网表格](https://support.typora.io/Markdown-Reference/#tables)、官网insert-table/reorder-table/resize-table三段动画。
