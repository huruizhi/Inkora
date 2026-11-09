# 表格与任务列表：实现前冻结验收资料

12个互相独立场景，每份有input.md、expected.md以及cases.json中的动作、允许范围和人工推导的语义预期。内容全部为合成技术写作样稿，不含用户文档。

当前没有驱动产品。请分别看清三个证据层：

1. `python3 docs/acceptance/tables-tasks/verify.py`：12用例、100项字节/哈希/意图推导检查。operations仅用来独立证明expected从input如何变化，不得在产品验收驱动中替代真实动作。
2. `node docs/acceptance/tables-tasks/verify-tables.cjs /path/to/locked/editor/package.json`：8个表格的数量/列数/数据行/可见格/对齐语义，使用已锁定markdown-it的table规则；无新依赖，无产品代码导入。任务checkbox交互/语义不由此脚本验证，期待值来自动作规范。
3. 待实施者通过真实生产EditorView/控件/键盘/Bridge/文件路径完成同样操作后，才能判产品通过；还有真正WK/IME和文件保存重开层。

基线271922e仅提供架构与V1规格。V3依赖V1生产API，节点/映射接口待V1落定后接线。规范语法参考官方GFM，当前产品行为仍以主仓实现为准，不把新资料当成已实现。

fixture冻结后若发现语义/动作歧义，须独立解释和审查，旧文件/hash与旧失败保留；不能因为实现失败而直接改expected。
