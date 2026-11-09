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

017 已交付 cf71e3944a837c15b777dab5c6e1db00036bb2a7。管理者独立最小 API 检查确认 HTML 标签排除、代码及转义字面保留正确。两个越界面板/main测试预期从错误的标签字面展示改为既定HTML口径，DOM零危险元素断言保留，管理者接受该必要连带。执行者报告299非bridge通过，不能冒称包含bridge的完整套件。

但文档原有“标题 end 不含尾随 EOL”的约定被替换掉，管理者要求恢复；不得用删验收解决行为错误。执行者发现的 CRLF 问题已由管理者真实 API 独立复现：ATX及Setext标题后跟空行时，end多含CRLF；冻结8项中6绿2红，LF/裸CR和HTML为绿控。冻结文件与输出在归档 root-m1-checks/html-and-heading-boundary-review.test.ts、HTML-AND-HEADING-BOUNDARY-RED.txt。

017 Agent已归档，workspace已备份回收，removedDirectory=true；227文件tar逐SHA与bundle校验通过，远端tip一致。累计完成受管workspace回收45个；未合入PR。

## INK-M1-018 标题 EOL 补正

当前仅一位执行者：GLM-5.3/low，Agent `9365bf81-1fb2-44a8-9676-d0fd8111c28c`，workspace `wks_d38a5a5ab5d19725`，路径 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-018-heading-eol`，分支 `task/INK-M1-018-heading-eol-boundaries`，基线cf71e39，host=srv_MEqRNkRW6fSx，notifyOnFinish=true。

仅analysis实现/测试、分析文档及新018任务记录4文件；恢复原EOL约定，修复原文范围映射，保持HTML口径、raw和revision不变。先复现冻结2红，再单变量诊断；补ATX/Setext/BOM/混合EOL/EOF与容器范围控制。最终 editor test 必须含bridge，未执行GUI/IME/磁盘不改门槛；完成后统一独立验收与新HEAD默认CI，不扩大重构。

018交付 c0e9de9b69c50d45ec54f3ff0b698bd8a221149f：CRLF 映射先记录起始 CR，再跳过 LF，原 EOL 契约已恢复。管理者复核确认生产变更仅限该映射，并将017/018快进集成至014。独立27冻结控制、干净315项（含bridge）、lint/build、最终git diff --check通过，TypeError=0。

执行者323项包含临时冻结8项，清理副本后的产品套件实际315项/18文件；交付文档已纠正计数口径。管理者首次复制6条旧控制文件时放错相对import目录，产生模块解析失败；按原文件相对位置纠正后27/27，失败单独归档为harness-path-failure，不记产品错误。HTML/EOL原始冻结用例及RED日志 SHA均未改变。

018 Agent及workspace已归档回收，removedDirectory=true；228文件逐SHA核对和bundle验证通过，归档ink-m1-018-heading-eol前缀。累计46完成workspace回收；本轮没有闲置执行Agent。

集成最终HEAD `b294e6b5d03ea930326f2add767688873fc01a94` 已推送，包含交付计数与验证说明。新默认非UI CI [42576854657](https://github.com/huruizhi/Inkora/actions/runs/42576854657) 已触发，verify job129026403876；旧6ad CI不外推。仅该最终HEAD实际通过、main仍为固定基线且PR状态核对后才合并；等待中发现checkout抓取网络超时，action正在自行重试，不修改产品或runner配置来绕过。

### CI 传输恢复

前两次 attempt 都在 HTTPS checkout 抓取超时失败（curl56 / 443连接失败），lint及测试未执行，不记为产品测试失败，更不能记通过。保留两次实际失败日志。根进程和runner代理环境、Git全局代理均未设置；HTTP HEAD联通不等于Git pack传输成功，不据此判网络已恢复。

管理者在runner工作副本与临时HOME条件下，用命令级URL重写验证现有SSH读取同一仓库，返回准确b294e6b，exit0。随后仅对runner单一工作副本 `/Users/rayhu/.local/share/github-actions-runner/inkora/_work/Inkora/Inkora` 增加精确仓库URL的临时 insteadOf（此前该键不存在），重跑失败job。未改系统代理、全局Git、产品、workflow、凭据或检查项；CI仍自行从GitHub获取同一提交。

第三次attempt的job129030166656已经checkout/toolchain/lint通过并进入非UI测试。临时URL设置由独立watch进程finally清除并校验恢复不存在；清理结果必须以 artifacts/logs/ink-m1-018/temporary-ci-route.json 的 restoredAbsent 为准，当前仍待整轮实际结论。

### 已完成合并

attempt3 实际 completed/success，HEAD仍为b294e6b；lint、非UI测试层、Release离线资源检查成功，light bench步骤success但warn-only，UI及full bench按参数skipped。watch exit0，finally已清除临时URL设置，配置读回不存在，marker restoredAbsent=true、cleanupRequired=false。

PR已标记ready后通过expected_head_sha=b294e6b的受检提交保护squash合并，结果merged=true，主分支commit `48258a93b3fc4a75df21a22ac0d175e01943b744`；合并前main仍36e6365。主工作区clean后安全快进，主分支Git tree与受检b294e6b完全一致。无新依赖、生产内核迁移或UI验收冒称；回收完成的4位Agent/workspace，不保留闲置执行会话。

当前交付是写作辅助功能进入main。Standards维护建议作为后续改进候选，未将它们泛化成无限重构门槛。M0只保留H1/H2/H3物理证据，架构票仍未解决；下一批生产内核任务必须先形成架构结论与规格，不将原型直接合入产品。
