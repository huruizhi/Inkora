# INK-SPEC-099：V2生产保护片段契约

范围：docs/design/protected-syntax-production-v2.md、docs/fixtures/protected-syntax-v2、docs/evidence/INK-SPEC-099与本文；基线main11773c6。依据canonical和用户已确认首阶段范围，先记录必须成立的内容、范围、位置、历史、源修复、组合与安全快照契约，以及096三红一绿和有限验收矩阵。

097/098两路只读规划及cross-check已收敛：parser-owned canonical结果、PM block/inline atom与ledger共同消费，复用S mapper渐进迁移；定稿18例oracle并单独SHA。保留初始16例、规则编号修正与两路原始输出。未写产品代码、未宣称实施完成。初稿纯文档未跑全量；随后为GATE-004建立公开会话单项红例并实际1/1失败，冻结于docs/evidence/INK-SPEC-099，临时editor副本与symlink已清理。未跑完整产品套件，不借用713结果。后续按冻结契约和oracle进入有限纵向实施；不降低矩阵或解除物理门槛。分支task/INK-SPEC-099-protected-syntax-contract。
