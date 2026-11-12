# Standards

固定 `4b3fa6f...e6b6d20`。Hard 0；possible smell 0。

`source-transaction` 多步例外从输入规则还原局部补丁，须干净解析且整文 `eq(tr.doc)`；空任务首字仅补必要分隔空格，同样核对完整目标，符合 FID-002/003。

`source-authority` 核对同次账本唯一相邻 `[]` span、首段归属及插字后整文相等；局部构造任务后整文再等于 canonical，新 caret 严格双向映射、不吸附，调用限定 `!composing`，符合 ADR-0004/V1。

未见新增依赖、网络或有效测试删除。Fowler 全套基线未见可报告项；仓库优先，工具项不重报。

仅静态审查，不作 Spec/验收裁定；见[任务记录](../tasks/INK-REV-179.md)。
