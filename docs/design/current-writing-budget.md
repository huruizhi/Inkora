# 当前写作路径补测与完成审计

基线 `main@aef514c501cb33eb10cac121d300b67374c462a5`（PR #90）。上一轮候选已合并、包和源码备份、四工作树回收；Beta 2 发布确认仍待用户答复。本轮推进原定“完成开发”目标中的性能与完整性证据，不以发布选择阻塞可独立进行的后台工作，也不把候选通过称为整体完成。

## 已有边界

- 原始首阶段范围与质量门槛在规划分支 `task/INK-PLAN-005-paseo-orchestration` 的 `.scratch/typora-parity/issues/03-first-milestone.md`、`07-quality-gates.md`、`15-writing-performance-budget.md`；后来用户增加真实公式/Mermaid/脚注及 Typora 低干扰 UI。当前生产依据包括 ADR-0004、支持矩阵、`typora-ui-round2-plan.md` 与各切片记录。
- 旧 light bench 的 serializer/旧 session 不能代表当前原文权威输入；085 有固定旧组合的真实离屏 WK 数据，但没有当前 main 的分层安全写盘/全部预算。保留所有旧样本、阈值和结果，不能修改基线让警告变绿。
- 用户不再重复实体输入法测试，不做 macOS 14 专门验收。禁止启动 App、显示窗口/面板、CUA/browser/XCU、全屏截图、bench-full 或访问用户文档。仅允许真实不可见 WK/NSWindow、临时文件、hostless 和注入 UI 选择；不冒称 paint、真实授权/VoiceOver 或物理输入证据。

## INK-PERF-151：当前路径分层测量

1. 先阅读当前真实入口和既有 078/079/085 方法，以相同 small/medium/large/large-crlf 及 production-mixed 字节/哈希复用现有 Node 与 WK workflow。先建立并实际运行基线，禁止先优化或改 parser/runtime/session。
2. 仅在现有 seam 能准确支持时补混排 WK、真实 snapshot→NSDocument 保存屏障→原子写盘→字节核对的测量。不能把直接 data/write、JS snapshot 或纯编码当完整安全保存。若 seam 不具备，明确报告缺口及最小接口方案，不加产品调试入口。
3. 固定 source/bundle/input SHA、系统/架构/工具链、预热/样本/计时边界；保留原始分布、median/p95/CV、超时与失败。暖路径/首次、JS/Native 分开。小样本 p95 不声称尾延迟保证；禁止删慢样本、合成 IME 或 rAF 冒充 paint。
4. 使用既有方向性 150KB 输入尽量 <200ms、1MB 尽量 <1s 作为对照，报告达成/未达成，不擅自冻结正式体验预算或缩减 1MB/功能范围。明显慢/失败时先给最小 red-capable 命令、3–5 个可证伪假设，再与管理者协调，不自行优化。
5. 归属仅 `PerformanceWebViewTests.swift`、`PerformanceBaselineTests.swift`、`PerfSupport.swift`（以实际存在文件为准）、相关 perf 脚本/独立临时 harness、自身 task/evidence；需改 Makefile 或其他测试先提案。不改产品、依赖、有效旧断言或默认 CI。仅跑必要构建/定向采样，不重复全量门禁。

## INK-AUDIT-152：原始需求到当前证据

只读生产/原始规格/旧交付与当前记录，为完整目标建立有界逐项对照：首阶段八场景、质量六维度、后来确认的 UI/侧栏/真实技术渲染、资源/恢复/正式文件、性能和发布。每行给固定提交/动作/证据来源及覆盖层；区分完成、明确反例、待验、用户已排除、尚待决策，不能将测试名当已执行结果或把旧结果重标当前。查找可在后台独立完成的真实缺口，给下一步优先级；不以不断新增能力代替完成。只新增自身 `docs/tasks/INK-AUDIT-152.md` 与 `docs/reviews/INK-AUDIT-152-completion-evidence.md`，不改产品或历史报告，不运行重测/构建/UI。

## 协作与退出

151 独占本机重测；152 只做静态核对，避免并发污染。无 configured profile 时经实际 provider/model discovery 选择可用执行者。不得再建子 Agent。可暂借主仓锁定工具/依赖 symlink，只 unlink 自建链接，不 setup/install。中文记录、英文 Conventional Commit ≤72 字符。回报完成内容/文件、真实命令与结果、未验/风险、branch/full SHA；push 并核对真实远端和 clean，保留 ignored artifacts 待管理者两层备份。不得 PR/merge/tag/Release/上传/安装或改 Issue。
