# INK-REV-205：标题起点事务契约 Spec 审查

固定范围：`6b392fc6a2a50a3335b3c548390ee1c8774c1c29...bdbd5827b29fb92a214fc3bdfce0b5cb32f5f967`；两提交 cdd2d12、bdbd582。初始工作树 clean，merge-base 等于固定 base，18 文件非空 diff。只审不修。

## 核心报告

结论：新增代码缺陷 finding 为 **0**；仅通过有界 Spec 代码审查，候选交付门槛尚未结算。

(a) Missing/partial：`INK-STAB-203.md:28–29` 要求“完整既有回归/Native/构建及独立复核、精确HEAD CI”后，完成当前系统物理输入/光标/保存关闭旅程。受审任务 `:50,58–59` 已明确最终回归和真实验收待办；本审查不把初轮结果或公开会话测试当完成证明。这是已披露的交付缺口，非新增实现错误，不允许据此安装。

(b) Scope creep：未发现。对应 `:4,21–24`“只迁移”标题起点及“调用方规则减少”：`block-editing.ts:134` 删除本地标题分支，`source-transaction.ts:1068` 单次委托；旧 headingBackwardPlan、headingSourceParts 和 splitPlan 起点分支确已删除。新模块 operation 同时构造键盘事务和 Native 目标证明，包含实际规则；不是仅换转发包装。独立通用数据模块不建第二套历史或内核，build15用于候选识别。

(c) Implemented wrong：未找到可复现的新增反例。`heading-start-edit.ts:99–107` 核完整 doc/Selection；`:83–90` 绑定实际 doc 引用与 Selection；`source-authority.ts:1585–1597,1643` 消费绑定并绕过旧标量推断。未迁移 planner 继续使用旧标量。保护片段检查仍先于规划，旧事务 doc 身份/epoch 闸门保留，符合 ADR-0004:6,10 与 GLOSSARY:7–18 的原子内容/位置/历史和拒绝意图要求。

本次实际：公开会话新3项通过；额外17种源文×10模式差分及2项明确边界检查，共172项通过，冻结116份源码与6b39逐字节一致。涵盖空标题、marks、Setext、多步/净零/零步、双向选区、BOM/CRLF、重复同文、邻接列表/引用、UndoRedo、save/reject、保护删除和同字节重开epoch。差分包括继承的拒绝或未处理，不宣称每种操作都成功；无新增差异。直接 composing 命令链的既有回退也相同，不能推论物理IME已验。

## 证据与限制

独立工作树 `task/INK-REV-205-heading-contract-spec`。命令、原始日志、SHA与测试夹具见任务记录。未运行全量/Native/构建/GUI/CI/物理输入；不新增macOS14实机要求。没有更改产品、有效测试、用户文档或安装App。
