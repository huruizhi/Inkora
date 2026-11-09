# 写作辅助 PR 双轴审查与下一批入口

用户通过 ask-matt 确认后续路线后要求“推进”。本轮先收尾已交付能力，不扩张新的功能任务。

## 固定范围

- PR：[写作辅助集成](https://github.com/huruizhi/Inkora/pull/70)，当前 draft=true、merged=false。
- 审查 HEAD：`6ad325b41d74f270f6b8fd20e615259982f9a4f7`。
- 比较基线：`36e636578798510d240b23520122c88578cf3fe5`，实查 origin/main 仍为该 SHA。
- 命令：`git diff 36e636578798510d240b23520122c88578cf3fe5...HEAD`；24 commits，36 files。
- 已有默认非 UI CI success 仍对应上述 HEAD；两位审查者不重复无理由全量测试、不运行 GUI、不修改被审查代码。

## 执行者与回收

| 轴 | 模型 / 档位 | Agent | Workspace / 分支 |
| --- | --- | --- | --- |
| Standards | OMP GLM-5.3 / low | `59543e3f-a946-436d-986f-151c464adfc9` | `wks_51c7ad7af2a1fb81` / `task/INK-M1-015-writing-tools-standards-review` |
| Spec | Codex GPT-5.6-Sol / medium，default service tier | `f9f714cb-6cc6-42b1-9ed2-b47103e5df59` | `wks_bcb02ab53e638155` / `task/INK-M1-016-writing-tools-spec-review` |

host=`srv_MEqRNkRW6fSx`。两个独立 worktree 均从固定审查 HEAD 建立；notifyOnFinish=true，不轮询催促，不允许执行者再建子 Agent。当前无 profile，依据实时 provider 与模型清单选择。GLM 创建时错误传入 medium，模型清单确认仅 auto/low/high/max 后已通过 update_agent 更正为 low；不把无效档位写成实际支持。

规范源为 AGENTS.md 与相关既有协议、编辑器、保真、安全和测试文档；无额外 CODING_STANDARDS.md/CONTRIBUTING.md。Spec 以各正式任务契约和上游查找接入设计为来源。审查分开报告，不以同一套测试通过替代两轴结论；有具体反例再安排限定修复。

完成当轮先归档 Agent；保存最终报告、核对 worktree 状态并备份后回收受管 workspace。不回收用户其它管理会话或 Obsidian/OpenCSG workspace。

## 合并资格与阶段门槛分离

依 docs/testing.md，普通 PR 可以在最新 main 基线和默认非 UI CI 通过后合并；PR 描述须明确 UI 未验证及受影响套件。真实 UI 未验不是另加的普通 PR 硬性门禁。审查发现需修复的问题后，修复后的新 HEAD 必须重新执行受影响检查和默认 CI，再判断合并。

M0 与 M1 不能据 PR 合并宣布完成。M0 当前只剩 [收尾清单](M0-CLOSURE-CHECKLIST.md) 的 H1/H2/H3；U1 已关闭，已通过路径不重复验收。此次持生产 UI 锁运行 desktop preflight，实际 exit 78：屏幕锁定；未启动 App，包装器退出释放锁。

## 后续依赖

1. 接收两轴审查，修复真实阻塞问题，完成 PR 收尾。
2. 用户可用时集中完成 H1/H2/H3；该证据不由 synthetic 或用户授权代替。
3. 依据原型证据解决“保真架构是否采用”，记录 ADR 和适用边界；未完成前不关闭原型票、不宣告架构采纳。
4. 架构决定后用 to-spec 固定正式文档的原文权威、投影、选区、历史、composition、保存重开契约；再用 to-tickets 拆端到端纵向任务，交 implement-spec 调度。
5. 首张生产迁移任务覆盖打开、可视编辑、保护片段、主动源码往返、Undo/Redo、正式保存重开；不以孤立纯模块代替闭环。
6. 本地资源面板授权、书签跨启动、拖放/粘贴与 WK broker 可以另行独立验证；正式图片编辑依赖架构与平台证据。当前不增加第三个执行 Agent。

本记录是调度与入口，不是生产迁移规格，也不代替尚未取得的架构决定或真人验收。

## Standards 已返回

已接收 [规范审查](reviews/INK-M1-015-standards.md)：0 项书面规则硬违规，4 项判断类维护建议（3 中、1 低）。管理者已核对实现与引用，未将重复 helper 或理论 locale 风险误记为已证实产品故障。Agent `59543e3f-a946-436d-986f-151c464adfc9` 已及时归档；独立 worktree HEAD 仍为 6ad325b，clean。Spec 审查继续等待完成通知，不轮询，不提前合并 PR。

Standards workspace 已备份并回收，archive_workspace 返回 removedDirectory=true。归档根 `/Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed` 下 `ink-m1-015-standards-review` 的 bundle 校验通过，tar 的 224 个文件逐字节 SHA 核对通过，报告和独立 backup.json 已保留；累计完成受管 workspace 回收 43 个。

## Spec 已返回

[规格审查](reviews/INK-M1-016-spec.md) 发现 1 项中等行为错误：HTML 标签被计入标题及内容统计，最小 Vitest 已 red；未发现其他可行动缺失或范围扩张。Agent 已归档，后续只修该确定问题，再执行受影响检查和新 HEAD 默认 CI。

两轴各自结论：Standards 4 项维护判断，最高为中等重复映射/重验证；Spec 1 项中等 HTML 统计错误。两轴不相互抵消。维护建议先记录，当前不扩张到多模块重构。

Spec workspace 已备份并回收，removedDirectory=true；bundle 验证和 tar 224 文件 SHA 核对通过，报告/backup.json 在归档根 ink-m1-016-spec-review 前缀，累计 44 个完成 workspace 已回收。

## INK-M1-017 限定修正

当前仅一位执行者：OMP GLM-5.3 / low，Agent `dedd2092-7197-4ce6-9489-68ff734d9c54`，workspace `wks_97b8c36c09ed8465`，host `srv_MEqRNkRW6fSx`，路径 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-017-html-analysis`，分支 `task/INK-M1-017-html-analysis-correction`，基线 6ad325b，notifyOnFinish=true。

只允许 analysis 实现/测试、既有分析文档澄清与本任务记录四文件；先在实际 analyzeDocument 上复现 red，再做 HTML tokenization 与过滤的单变量诊断，覆盖 inline/block/comment/code/escape/entity/Unicode/EOL。不修改运行时、主界面或依赖，不把规范维护建议扩成此次重构。完成后独立复核、备份回收，再集成并对新 HEAD 运行默认 CI。
