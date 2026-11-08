# 028 委员会收敛结论

Status: consensus on next experiment; not architecture adoption; M0 not passed

两轮完整独立意见与交叉答复见reviews/INK-REV-028{a,b}.md及对应-cross.md。共同建议：统一source-authoritative原文契约，保留PM；A是目标边界，C是隔离验证容器，B settle只能作为接受编辑时的内部迁移机制。不能等到Save才承认candidate，不能从语义AST反向覆盖原文。

共同判据：停在合法空白时Save/Source可达；Save不改原文、投影、光标、版本或历史；重开后显式定位同一raw边界再续写/删除不能错位；源码no-op不丢候选，dirty相对同一保存点。pending、未映射/过期意图、composition和未提交草稿仍有明确安全边界；不承诺source-primary可无条件接受所有PM事务。重开不恢复旧进程Undo栈，新epoch Undo只撤销新编辑。

第一轮的实质分歧已收敛为一个契约和一个有界原型，不是先在008上打settle补丁再无限扩kind。对“kind数量作熔断”的措辞尚有程度差异：管理者采用行为与公共契约反例作为实际go/no-go；kind扩张作为审查信号，不用数字替代证明。必要语法/映射规则允许，按入口/标签分别放行相同合法字节、不经审计trim或无条件doc.eq放行、Save改变会话、重开raw affinity失败才是实质失败。此处为管理者对执行边界的明确裁决，不声称两份原话在每个启发式细节完全一致。

INK-SPEC-029 已独立文档worktree冻结：branch task/INK-SPEC-029-source-authority-contract，commit6e6e2b8eb1f4ff49e3765cef4052daa419405eee，文件docs/prototypes/source-authority/{CONTRACT.md,ORACLES.json,ORACLES.sha256}及GLOSSARY。oracle SHA=c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08。包含8步主链、13边界vectors、保存历史/Enter/soft-hardbreak/隐藏空格Backspace/反向选区/格式/草稿/真实安全负例/组合历史判据。仅数据字面值UTF-16插入与UTF-8 hex一致性、JSON/hash和锁定MarkdownIt只读语义smoke已检查，未宣称新模型运行通过。委员确认原则，未冒称逐行签认该JSON。

已按共识授权一个隔离原型 INK-PROT-030，复用现PM/parser/ledger但只写新editor/prototypes/source-authority/目录；旧fidelity、冻结样稿和契约只读。原型API/投影表示未被假定已经可行，若主链/共同原文契约失败，则停止staged补丁扩张，比较投影表示方式，不先声称换PM或原文权威自动解决任意输入。

11仍claimed、12仍未锁架构；不写生产采纳ADR。最终固定实现须集中真实WK/物理搜狗及整体用户审阅，NSDocument/Sandbox/最低OS独立门槛不得以scratch写读替代。

