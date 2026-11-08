# 验证增量路线的局部保真、混排与跨模式历史

Type: prototype
Labels: wayfinder:prototype
Status: claimed
Assignee: root; current Paseo executors tracked in execution/M0-dispatch.md
Blocked by: 04
Parent: ../map.md

## Question

复用当前 ProseMirror 和受保护原文块，加入原文范围记录与最小补丁后，能否满足[已确认的首阶段范围](03-first-milestone.md)和[路线验证门槛](04-fidelity-route.md)，同时保留中文输入、选区与撤销行为？

## Resolution criteria

使用独立、明确标识为原型的代码和可重复样稿验证；用户可以实际查看/操作，研究和自动化结果不能替代用户的交互审阅。每项门槛分别记录通过、失败或未执行，必须保存可复核证据，不能仅凭截图或现有基线 111 项测试宣布原型通过。

## Execution

初始通过 Paseo 派发 Codex 实现原型、OMP 独立准备验收样稿，具体任务、模型、host、workspace、Agent ID 和后续核验步骤见 [M0 调度记录](../execution/M0-dispatch.md)。创建回执均为 running；初始派发不构成交付或门槛通过结论。

原型 c76a200、独立样稿 c85e189 已交付，原执行 Agent 均已归档。INK-PROT-003 又交付 `692493508d4b5ac78f0b212045aae32a8b59b90e`：修复真实 textarea 的重复 ID、EOL/no-op 并交叉核验。发现多项失败，执行者已归档，当前分派 INK-PROT-004 独立审计样稿语义、INK-PROT-005 修正保护片段与含混输入。源码语义变化后的选区映射、通用原文范围、历史分组、真实 WKWebView/IME 与 HITL 仍有缺口，不关闭本票。当前模型分工见[成本与难度调度规则](../execution/model-routing.md)。

INK-PROT-004 已交付新样稿 `484ee81d924efd2a1038e8421b146f4ae5d5b743`，保留原字节覆盖并区分可视段落拆分和源码 softbreak；管理者复跑 557 项样稿完整性检查通过，执行者已回收。INK-PROT-006 独立实现选区映射纯模块，与005的既有model/main修正分工隔离；模块验证不等于集成或真实输入法门槛通过。

最新集成008固定5fbeb10，已接收022词法/原生接线、023宿主诊断和024源码composition守卫。管理者重跑原型/ledger/native/选区/样稿矩阵及独立反例，并在最终HEAD重建签名宿主、核对hash；原执行者均回收。用户已解锁并以搜狗/物理键盘完成本轮新bundle WK两区输入；可视Undo暴露中间拼音ce'shi，明确失败。源码提交/跨模式历史/内存保存点局部通过不替代总门槛。原始证据已冻结为025准备6f35866并派独立Agent修复；修复后仍需物理键盘复验。[人工验收与失败清单](../execution/M0-human-acceptance.md)。本票仍claimed，最终架构尚未锁定。

### 最小验证范围

- 一份混排样稿覆盖普通中文正文、非规范空白、LF/CRLF、emoji/组合字符、引用式链接及稳定边界高级原文片段；展示修改前后原文和字节差异。
- 先证明小范围正文修改、marks/attrs 修改、任务状态单字符切换、split/join 与 Undo/Redo。原文范围不应出现缺口、重叠或无法归属的变更；仅保存整块 raw 不能代替块内局部编辑证明。
- 对同一文档执行主动源码查看/编辑与返回，检查选区映射、dirty、保存点和跨模式撤销，包括只改格式而语义不变的输入。
- 制造边界含混或映射失效，检查视图可信性、保存阻断、完整原文保留及主动修复；不得静默切换整篇源码或先有损序列化再修复。
- 在真实 WKWebView 中检查系统中文输入法组合、选区、Undo/Redo 和保存快照边界；如本轮无法执行，明确保留待验收，票据不能标记已全面通过。

### 证据与边界

- 执行前核对并固定产品基线；当前已研究起点为 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`，证据见[基线刷新票](10-fidelity-baseline-refresh.md)。不得把规划分支的旧产品代码误当最新实现。
- 以现有锁定依赖为起点；原型保持可一键运行，显示原文、可视内容、范围、选区、history、revision 与 dirty 等相关状态。
- 遵循项目独立 `task/<TASK-ID>-<slug>` worktree/分支约束，原型分支独立保存并推送，提供固定提交指针；不直接合并原型代码到 main。
- 使用隔离样稿和临时文件，不覆盖用户文档；真实 UI 操作沿用项目隔离与锁规范。
- 本票验证数据与状态路线，不交付完整表格编辑器、图片资源系统或高级语法渲染器。完整编辑交互另见[交互边界票](05-editing-interaction.md)。

### 判定与后续

全部必要门槛有实际通过证据、且用户审阅认可后，记录增量路线可行的边界，交给[最终架构选型票](12-fidelity-architecture-verdict.md)。失败时记录最小反例和原因，先评估修正；若无法满足门槛，以同一判据比较原文作为主数据的路线。未执行项不是失败结论，也不是通过证据。

025接收更新：当前008固定5bde76b（旧真人运行固定5fb，不外推）。管理者独立旧版红/新版绿及矩阵通过，已接入008并重建签名宿主；Agent和完成workspace均归档，真实失败材料/交付存008与备份。修复后物理键盘复验仍待用户配合，本票保持claimed，12依赖不解除。

025真实复验更新：5bde在物理搜狗输入下两个composition各一条历史，Undo2/Redo2未暴露中间拼音。实际轨迹包含普通输入/删除，原始证据冻结于026准备abd4c58。另有正常正文历史恢复点保存误阻断/等价错误，已交INK-PROT-026先建红回归并独立验证安全状态；不能据目标局部成功解除本票或架构票12门槛。

026最终ea63941已由管理者旧红/新绿独立矩阵与真实WK普通输入保存恢复路径接收，已进入008；执行Agent和workspace均备份回收。当前本地验证目录为主仓.worktrees/INK-PROT-008-VERIFY。真实WK发现的合法空格输入拒绝，已由正确caret原生alpha/space/beta红回归确认会丢分隔符，027正修。该基础写作缺口不能当作安全拒绝的最终体验；本票保持claimed、12依赖不解除，最新完整物理IME/整体审阅未过。

027交付7607079未被接收完整验收：管理者确认连续输入14组通过，但合法尾随空格在当前视图无法save/主动source，虽候选已可parse/reopen，仍是原写作闭环缺口。执行Agent/workspace已备份回收，部分成果保留。已交paseo-committee只读比较统一源/投影边界、安全finalize及source-primary验证路径，见execution/M0-projection-boundary-review.md；不据子集PASS解决本票或锁12架构。
