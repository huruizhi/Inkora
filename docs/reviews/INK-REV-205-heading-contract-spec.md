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

## 追加复验：4cad6f1 新空段发布（原文逐字保留）

新固定受检 `4cad6f10ec8520afd25f3139c046764ea82b89cb`；限定新增 hunk：`git diff 27b5180ad6ba4ba40ac05b0d1e8f21699b0009f3...4cad6f10ec8520afd25f3139c046764ea82b89cb`。从 git 对象提取冻结源码，在原审查工作树隔离运行，不改变旧受审产品。

追加结论：**新增实现 finding 0**。

(a) Missing/partial：新契约 `INK-STAB-203.md:79–82` 明确标题起点 Enter 后点击新空段输入的继承缺口。本人用同一新增第4项公开会话测试，仅切换源码 import，build14、bdbd 均在输入 X 时失败，诊断相同；4cad 的4项契约测试全部通过。此前172差分明确包含继承拒绝，其“新增问题0”不等于旧路径正确，故与本次红绿不矛盾。物理输入/可见光标/保存关闭、精确HEAD软件交付门槛仍另行结算。

(b) Scope creep：未发现。`:80` 要求“只撤销该点的旧raw别名”；`source-authority.ts:1441–1449` 仅完整契约 placement 发布点进入替换分支，其他 visual 点不清理；原标量 sourceBoundary 继续追加原 anchor。当前唯一完整 placement 提供方仍是标题起点模块，未扩到其他 planner。

(c) Implemented wrong：未发现新增反例。`:80–82` 的目标行为有公开红绿实证；`:21,39` 的完整doc/Selection凭据绑定未变，仍先验证再进入 accept，异常仍由会话恢复 snapshot。原拒绝后原文/doc/完整选区/历史及随后输入、只读保护、重开epoch测试继续通过，没有以消除alias放宽无法证明事务。

本人实跑：4个测试文件 **192/192**，其中契约4、原172有界对照、14个其他位置/旧标量关闭语法affinity对照、2个源码边界测试。对照含marks、Setext、BOM/CRLF、其他位置双affinity、UndoRedo/save与拒绝状态；差分仍包含不适用分支和继承行为，不是192条成功输入证明。未跑全量、Native、构建、GUI或物理验收；主任务1077/34结果未作为本人证据。原始证据与夹具失败日志保留，见任务追加。
