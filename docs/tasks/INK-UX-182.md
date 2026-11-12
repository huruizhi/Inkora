# 表格首批交互实现

用户已选择审计建议首批五项 TP-TBL-02～06。基线 da76d7b（build9）；历史差距表基于 main@755dc6c，不能作为新代码验收结论。

## 实施路径

1. 参数插表：现有 Native/Bridge `insertTable` 打开本地对话框；列1～20、总行数1～100（含一个表头）。确认后首格编辑，取消不变。runtime 保留默认2×2兼容调用并支持参数。
2. 统一结构命令：扩展现有 TableCommandMeta，提供行、列目标索引和目标规模。数据行从1开始、表头固定；列移动连同表头及对齐。保留范围外字节、原单元格格式、隐藏额外格及各位置换行。缺格只在必要时补空格。
3. 拖动：工具中的行列手柄启动，移动显示范围高亮与目标线，放下调用同一结构命令一次。Esc、composition、选择或内容变更、销毁、失焦取消；提供手柄方向键重排入口。
4. 网格：二维选择器预览列×总行数，可用方向键；数字输入支持完整上限。所有缩减先明确确认删除风险，取消不变；隐藏额外源码格也纳入提示。扩展时新增空格插在隐藏尾格之前，避免尾格意外变成可见数据。

所有内容变更在当前原文事务中接受，使用完整候选投影证明；UI意图绑定当前EditorState，不能迟到写入其他文档。无新依赖、无联网产品功能、无格式迁移。

## 既定验证接缝

沿用审计指定真实 runtime / EditorView / 正式命令：验证原文、投影、定向选区、Undo/Redo与composition；不能证明物理输入。main/Bridge 验证菜单进入、取消不涨revision及一次发布。真实隐藏WK验证手柄/网格命中、宽窄布局与滚动，不冒称屏幕paint或物理拖动。必要Native保存重开沿用现有正式快照/磁盘链。

按垂直切片先红后绿实现。最终补全测试命令、结果与未验边界，再进行独立Standards/Spec审查。

参考：[审计](../../../../.worktrees/INK-AUDIT-179/docs/design/typora-homepage-gap-audit.md)、[官网表格](https://support.typora.io/Markdown-Reference/#tables)、官网insert-table/reorder-table/resize-table三段动画。

## 完成与实际验证

正式规格：[typora-table-parity.md](../design/typora-table-parity.md)。完成参数建表、列/数据行重排、拖动范围与位置反馈、网格/数字规模选择和缩减确认。保留原Native/Bridge入口，确认才生成正文变更；取消不改原文。复用锁定依赖，无新增依赖或产品联网。

修改：runtime/main接线；table-editing统一PM命令；source-transaction原文局部重排；纯table-commands类型/尺寸策略；table-interactions与table-size-dialog各自TS/CSS；main和公共runtime回归；新增TableParityHostlessTests.swift/专项脚本。没有修改Native生产保存、权限、Bridge协议、project版本或公开Release。

- `make lint test-editor test-ci` 最终退出0；54文件 **1002项通过**，包含21项新增表格公共runtime/DOM回归；TypeScript与Swift strict格式通过，生产Web构建通过，仅既有chunk体积提示。
- `pnpm --dir editor exec vitest run src/bridge.test.ts src/table-parity-runtime.test.ts`：补正前32项通过（Bridge16 + 当时表格16）；最终精确提交的完整Bridge/Native由CI门禁结算，不把旧数量冒充最终重跑。
- `tests/InkoraTests/TableParityHostless.sh` 最终 **4/4通过**：正式Native参数插表后保存自有临时Markdown并重读精确字节；合成PointerEvent拖动预览/取消/一次UndoRedo与行键盘重排；实际900/360 viewport宽度、长表局部滚动与滚动后手柄命中、网格范围；规模字段合成composition保留同控件/值/焦点，结束后取消。窗口始终不可见，未启动AppDelegate。
- 首次参数测试缺生成notices（0测试）后运行现有prepare-renderers；随后参数和列重排真实red→green均保留。首轮WK合成事件没有平台active pointer，setPointerCapture中断；仅trusted事件使用平台capture，合成事件通过同一document move/drop处理，原red保留，不称物理拖动缺陷已复现。
- 双轴固定efa5517审查发现Standards1硬项和Spec4项P2，8bb27ad补正。独立复验原稿保留并追加；来源/结果见[Standards](../reviews/INK-REV-183-table-standards.md)与[Spec](../reviews/INK-REV-184-table-spec.md)，不能把审查者有限复验当全量验收。

产品固定提交8bb27ad，分支`task/INK-UX-182-table-parity`。字节收据见[receipt.json](../evidence/INK-UX-182/receipt.json)，精确CI/PR由根整合结算。

## 未验边界和风险

未进行物理鼠标拖动、系统IME、VoiceOver、可见paint、macOS14实机测试。隐藏WK/DOM合成事件仅证明相应生产接缝。所有缩减有明确删除确认，但用户确认后被删除的数据仍需Undo恢复；保存前可检查源码。没有本轮安装/公开发行。其余54项保持审计原状，不能宣称完整Typora对齐。主工作树、审查工作树及ignored原始产物保留；只移除本任务自行建立的依赖软链，不清除真实依赖和用户文件。

原始输出在ignored artifacts中逐字保留；提交的证据使用JSON字符串无损承载输出（含CR与尾空白），逐项SHA256及解码字节相等已检查，避免把终端空白误作代码空白问题。
