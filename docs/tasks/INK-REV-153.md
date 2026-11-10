# INK-REV-153：写作预算 Standards 独立审查

仅新增本 task 与 [审查报告](../reviews/INK-REV-153-writing-budget-standards.md)。不修改产品、测试、依赖、阈值和既有证据，不读取另一轴审查结论。

固定受审 HEAD：`9bd139681a52c9d801158a0c4f9b899c91d263ee`；基线及 merge-base：`aef514c501cb33eb10cac121d300b67374c462a5`。初始 status 干净，唯一审查 diff 非空、49 文件；六提交按序 f09143d、412e295、69810d2、b9880fa、8bcf00c、9bd1396。交付提交是文档提交，不改变受审对象。

规范来源全文读取：AGENTS.md、GLOSSARY.md、ADR-0004、docs/testing.md、docs/performance.md、docs/acceptance.md、docs/bridge-protocol.md、docs/document-save.md、docs/save-barrier.md、docs/markdown-support.md、docs/markdown-codec.md、docs/markdown-safety.md、docs/text-format.md。AGENTS 的范围、诚实报告和保真要求适用；GLOSSARY/ADR/支持矩阵界定当前原文与保存点；Bridge/save 契约用于核查 harness 没有绕过生产屏障；testing/performance/acceptance 用于隔离与证据边界。旧 codec/safety/text-format 的 textarea/serializer 历史描述不能覆盖已采纳 ADR 与 canonical 支持矩阵。独立 `rg --files --hidden` 检索未发现 CODING_STANDARDS.md 或 CONTRIBUTING.md。原始规划票15通过固定规划分支 git show 读取，当前 scope 读取 docs/design/current-writing-budget.md；只核对规范适用性，不执行 Spec 轴裁定。

逐 hunk 检查范围：两个 Swift 文件、两个 shell 入口、当前 scope、performance 与任务/审计文档；证据文件核查类型、失败留存及声明边界，所有新增 JSON 解析通过。对十二项 Fowler baseline 逐项匹配：名称可解释；工作流主体已共享；无新增跨对象数据搬运、重复领域字段组、需小类型的领域 primitive、跨文件同逻辑散改、无关职责扩张、无当前需求泛化、长消息链、仅转交层或继承拒约的成立证据；重复分类分支仅列 possible。格式工具强制项不列规范 finding。

本人实际命令与结果：

- git status/rev-parse/merge-base/log/diff：固定对象、顺序与初始 clean 均符合；app/editor/project.yml 的固定两提交 diff --quiet 返回0。
- scripts/perf/test-safe-save-151-runner.sh：exit0，subset 归档及模拟失败两条 PASS；只在临时 fixture 运行 PATH stub，未启动 Xcode。
- Python 固定提交文件检查：49 文件，全部变更 JSON 可解析，生产目录身份不变，PASS。
- 固定受审 diff 的 git diff --check：exit2，仅原始日志末尾空行/尾空白；不重写日志、不将工具格式项升级 finding。
- 本次新增文档 git diff --check：交付前实际执行，结果见交付回报。

作者的 Node/WK/full-save 采样及 root 的输入、resource、source、N/median/p95 核验均是外部证据，不是本人重跑。full-save 每输入工作流 N=3、snapshot N=15；旧 URL 失败保留，unique URL 绿只支持夹具竞争解释。未运行 setup/install、产品构建、全量测试、采样重测、bench-full 或任何 App/GUI/XCU/物理 IME/macOS14 专测。正式预算、真实 paint、人工 VoiceOver 与 Sandbox 授权未由此验收；这属于已声明边界，不作为本切片新实现错误。

风险与退出：静态审查及 stub probe 不证明系统保存/授权体验；未完成产品层复验，符合本次只审范围。只 commit/push 两份文档，真实远端 SHA 与 clean 在交付时核对；保留 worktree 和 ignored 产物等待两层备份，不做 PR/merge/Issue/tag/Release/上传候选/安装。
