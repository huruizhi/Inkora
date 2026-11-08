# M0 原文、编辑投影与保存边界复核

Status: committee analysis pending; no architecture adopted

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
