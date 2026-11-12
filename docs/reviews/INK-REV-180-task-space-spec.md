# Spec

（a）缺失/部分：未发现。本次符合“减号与左括号之间”及“保留GFM标准”（[规格](../tasks/INK-FIX-178.md:12)）：两处空格均接受，裸 `[]` 仍为正文；空任务继续输入保留checkbox。

（b）范围扩张：未发现。首label补必要分隔空格服务同一写作回路；测试资源包可选只用于复现原build8，未改产品分发。

（c）错误实现：未发现。符合“未知情况下不放宽原文/投影保存守卫”（[规格](../tasks/INK-FIX-178.md:7)）。多步规则须局部补丁干净重解析并整doc相等；marker完成须当前ledger精确span、首列表段及完整目标证明；label边界严格往返，组合期不发该光标例外。既有字节、marks及历史守卫仍在。

## 审查固定点

- 分支：`task/INK-REV-180-task-space-spec`；初始工作区干净。
- 基线：`4b3fa6faa21f2a46bbcab3cc3329e681c2cf2401`。
- 固定HEAD：`e6b6d20801f637ebc6067b122fec39742c01b7aa`。
- merge-base与基线相同；提交恰为`fa2ae55`、`e6b6d20`。
- 唯一产品差异：`git diff 4b3fa6faa21f2a46bbcab3cc3329e681c2cf2401...e6b6d20801f637ebc6067b122fec39742c01b7aa`，非空，共14文件。
- 规格来源：`docs/tasks/INK-FIX-178.md:3-7,12-16,24-46`；`docs/tables-tasks.md:15-23`；`GLOSSARY.md:7-20`；`AGENTS.md`；`docs/adr/0004-source-authoritative-editing.md:6-12`；`docs/design/source-authority-production-v1.md:7-18,31-36`。

## 实跑与边界

2026-11-12于该固定HEAD实跑：

- `node editor/scripts/prepare-renderers.mjs`：退出0。
- `cd editor && ./node_modules/.bin/vitest run src/task-space-input-runtime.test.ts`：1文件、16例通过，退出0。

使用现有依赖目录的临时symlink，完成后仅移除本人创建的链接；无依赖安装。16例由真实`createEditorRuntime`、EditorView及`handleTextInput`驱动，jsdom几何shim仅支持选区滚动。已核对FIX-178第36-39行：尾空白投影夹具通过实际PM选区定位`[]`中点，不能将raw导航被拒当成本次产品失败。该组包含两处补空格、连续输入、裸括号对照、首label、strong label、BOM/CRLF/容器/重复项、Undo/Redo与无关事务混入拒绝。

未执行App、Native、WK、Xcode、UI、物理IME、全库测试或构建。旧build8的21例中2case/6断言失败为任务记录中的外部证据，本审查没有复跑；完整981例及其他矩阵结果亦不作为本任务实跑成果。0项Spec发现仅覆盖本固定差异与上述验证，不能替代最终Native/IME验收。
