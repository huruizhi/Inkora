# INK-PERF-150：当前路径预算与完整目标审计管理

固定起点 aef514c501cb33eb10cac121d300b67374c462a5。前轮候选已实际合并并备份，属于进展；尚未发布的确认不影响本轮独立后台工作。审计确认原始性能票 15 尚未冻结正式预算，旧 light 指标及 085 数据不能直接替代当前生产路径。

实施范围、归属与禁止占屏等约束见[契约](../design/current-writing-budget.md)。委派151测量、152只读需求证据审计。此时尚无新测量或通过结论，整体目标保持 active，不把本切片定义成开发完成。

## 实际委派

2026-11-11 通过 Paseo 实际 provider/model discovery 核对：无 configured profile，Codex 可用；选择 GPT-6.1 Sol / medium / full-access。两项均从契约提交 f09143d 的独立 worktree 开始，通知完成开启：

- 151：agent `059f0623-93ef-4c3b-8ed4-8108b263ae1f`，workspace `wks_31a4e670320a437e`，分支 `task/INK-PERF-151-current-production-measurement`，独占重测、无产品优化授权。
- 152：agent `3d3e60c0-cffc-4f77-b4aa-63eded3853df`，workspace `wks_46f12696a8e86782`，分支 `task/INK-AUDIT-152-completion-evidence`，仅静态需求与证据对照，不运行构建/性能。

两项都禁止新建子Agent、占屏、发布或安装；收到固定结果后再独立核对，不把创建成功当执行完成。

## 实际结果与根核对

152静态完整目标报告 c9c4729 已接回：未确认新的未关闭产品反例，但真实Sandbox/VoiceOver/paint与完整性能预算仍缺失，不把“候选可用”缩成整体完成。用户取消的14专项、重复实体IME单独保留范围。其任务本轮未运行产品测试，报告未冒称自跑。

151基线544bd29与追加dd4ef46已接回。原Node五向量、WK四尺寸、独立五输入完整安全保存均实际通过，所有字节/dirty/revision断言保留。首个保存harness竞争红例与单变量unique-URL绿例留存，不称产品bug修复。根另发现新runner合并旧JSON风险，已交原Agent以真实脚本隔离probe先红后绿，只补runner，不重跑未改变的有效测量。

根实际运行该脚本隔离probe通过，并以只读Python核对：Node/WK/supplement输入SHA相同，两个WK批次resourceHashes完全一致，各工作流N=3、snapshot N=15、median/p95与原samples相符；app/editor/project与main aef514c完全相同。根未冒称本人重跑作者的WK/保存采样。机器结果保存在管理artifacts；完整新分层说明已追加performance文档，历史结果未覆盖。下一步固定组合后做两轴独立复核与默认CI，不重复占屏或完整采样。
