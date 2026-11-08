# M0 原文、编辑投影与保存边界复核

Status: committee consensus recorded; contract frozen; bounded prototype running; no architecture adopted

## 已确认事实

- 最新采纳集成仍为 `ea63941a6ca320c5aa888eb18263c870fb361846`；当前本地验证目录 `/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PROT-008-VERIFY`。027的`76070797f52b0b71debbc59b30ce8d4da6cd6f38`未接入008。
- 027连续输入14组回归由管理者独立重跑为绿，是有效的部分进展；普通word+spaces+word在候选持续期间不再丢空格。
- 管理者另经真实HTML/EditorView/dispatch先定位a后光标再插Space：候选/ledgerSource=`a ␠\n`（准确内容a+一个空格+LF），model.source仍a+LF；parse(candidate).issues=0，new FidelityModel(candidate)可保留相同字节且pending=false/staged=null。当前actions.source与actions.save均throw，sourceMode=false。根断言`valid trailing whitespace cannot indefinitely block source access`实际exit1。
- 没有后续用户输入时，这个状态不会自行结束。把它称为短期staged并不能证明保存/重开/源码修复闭环。原任务已要求不把合法尾随空格一律长期阻断；不按14/14将完整交付改判通过。
- 025真实搜狗分组、026诊断恢复与真实WK普通路径已有分层证据；最新完整物理IME、整体用户审阅仍未通过，不因本次架构讨论或测试数量关闭M0。

## 本次需要回答

比较现增量PM路线的统一源/编辑投影边界、现candidate的安全finalize协议、独立source-primary投影验证。要区分原文字节、语义解析、可编辑投影和会话状态，避免把CommonMark隐藏的合法空白等同于不安全文档。

评价任何方案都须说明：停在合法尾随空格时安全save与主动源码可达；原文字节、caret/selection、Undo/Redo和saved/dirty一致；模式no-op不丢候选，不需要强迫再输入一字或Undo；保存时是否规范化投影及对后续输入/光标的影响。真正pending/不一致仍须阻断保存并保留修复入口。不能跳过等价检查、trim掉空格、全篇源码fallback或只把问题重命名为短期。

## 调度

已用paseo-committee只读复核，profiles为空后发现provider实际能力，选择不同family：GPT-5.6-Sol/high与OMP GLM-5.3/high。两者收到相同新上下文问题级prompt，禁止任何文件编辑/创建/删除、写代码、构建测试、GUI或再派Agent；不轮询或催促，等finish通知后交叉论证至收敛。

| 成员 | Agent | Workspace / 分支 |
| --- | --- | --- |
| Codex | dc14147b-c7e2-4e94-ab54-22042c5132b7 | wks_04d9eb8e03cfe611 / task/INK-REV-028a-projection-boundary |
| OMP GLM | ff88157f-a62d-420e-8aff-f2b317081eec | wks_0940ccd779fd77d1 / task/INK-REV-028b-source-authority |

host为srv_MEqRNkRW6fSx，两workspace均固定7607079、独立branch/worktree。创建回执running不等于复核完成；GLM历史配额不能从模型列表推断已恢复，若真实请求仍失败据通知处理，不循环重试。

027执行Agent7e29964b…已closed/archivedAt=2026-11-08T18:50:02.162Z；原实现workspace完成备份（310文件逐字节校验、Git bundle verify、HEAD=live origin）后归档。代码/证据保留在分支、两委员只读副本和备份目录`/Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed`；累计31个已结束执行workspace回收。任务闭环未接收不等于删除部分成果。

## 决策状态

等待两名委员结论及分歧收敛，再记录有限的后续设计/原型验收路径。11仍claimed，12仍未锁架构；不继续并行修改内核，不扩大到表格/主题/导出或生产接入。

## 第一轮返回与交叉复核

两位均已独立返回，完整意见留档于reviews/INK-REV-028a.md和reviews/INK-REV-028b.md。共同认可PM可复用、candidate已承担最新用户文档职责、相同合法字节不能因路径不同而禁save/source。分歧：Codex建议先隔离source-primary投影原型C再以A落地；GLM建议先统一settle协议B→A，按明确失败阈值再做C。第一轮并非最终共识，个别架构推断/生产漂移等观点不自动作为管理者实测事实。

原Codex委员dc14147b…已closed/archivedAt=2026-11-08T19:02:17.901Z；原OMP委员ff88157f…已archivedAt=2026-11-08T19:05:20.181Z（其provider状态为idle，非running）。两worktree未修改/clean，复核仍需交叉收敛，因此保留这两个workspace用于后续阶段，不新开侧栏workspace。

已将双方完整论证和同一交叉问题交两名新上下文委员，继续使用同一两个workspace/基线/只读硬约束。Codex de854022-23e5-4f57-b080-ebd7fdab8de1；OMP GLM 8c331853-44a0-47b4-b84d-d46f15936c40，模型/模式沿用5.6-Sol high和GLM5.3 high，profiles仍空。两者创建running且notifyOnFinish=true，不轮询或催促。

交叉草案见reviews/028-cross-check.md：隔离验证不等于重写内核；settle可为内部迁移接口，但需唯一公开当前字节权威、每个已接受编辑即时一致、save不改变投影/光标/历史。重开字节保留不证明续写边界正确；source-primary也不能被未经验证地描述成任意PM编辑永不拒绝。允许必要语法映射规则，不按kind计数机械判断；需要共享原文/保存/源码/历史契约与真实安全负例。等待双方是否接受此有限方案或提供实质反例，尚未采纳架构。


Current decision pointer: [M0-source-authority-consensus.md](M0-source-authority-consensus.md). Earlier pending sections are historical review records.
