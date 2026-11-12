# INK-REV-175：标题创建呈现 Standards 独立评审

状态：完成仅审不修的 Standards 轴；不作 Spec、发布或合并裁定。

## 固定范围

- worktree：`/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REV-175`
- 分支：`task/INK-REV-175-heading-entry-standards`
- 开始时工作树 clean，HEAD `aec23e2663ac5c624a0bdf071bf7a2a13c16feca`。
- base：`4d762fa44b8bf94c5afdd0ca3eda33db1f338615`。
- 唯一评审 diff：`git diff 4d762fa44b8bf94c5afdd0ca3eda33db1f338615...aec23e2663ac5c624a0bdf071bf7a2a13c16feca`。
- 提交：`285b92e`、`aec23e2`；`INK-UX-174.md` 仅供理解背景。

## 规范与方法

使用 Matt code-review 技能的 Standards 轴；本任务为上层已拆分的独立评审，不启动子 Agent。已读 AGENTS.md、GLOSSARY.md、README.md、ADR-0003/0004、source-authority-production-v1.md、bridge-protocol.md、editor-session.md、source-search.md、offline-editor-host.md，并检索 markdown-support.md、markdown-safety.md、save-barrier.md、text-format.md 的相关保真与安全规则。全仓（含隐藏文件、排除生成物）未发现额外 CODING_STANDARDS、CONTRIBUTING 或 CLAUDE 文件。

Fowler 基线逐项检查：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。所有 smell 只作 possible judgement，仓库规范覆盖，工具已强制项不重复列为发现。结果 hard 0、possible 0，详见[报告](../reviews/INK-REV-175-heading-entry-standards.md)。

核对重点为本地 WeakMap 文档身份及已有 snapshot/restore、CSS 伪标记、接受事务后的 runtime 接线和组合收尾；只读相关生产上下文，未修改生产/API/测试文件。

## 实跑边界

- `git status --short`：初始为空；分支、HEAD/base 与两提交均已实际核对。
- `git diff --check 4d762fa44b8bf94c5afdd0ca3eda33db1f338615...aec23e2663ac5c624a0bdf071bf7a2a13c16feca`：退出 2；六份既有 evidence 文本末尾空行告警，未改证据，属工具检查项，不纳入 Standards 发现。
- `zsh -n tests/InkoraTests/WritingInteractionHostless.sh`：退出 0，只做 shell 语法检查。
- 本次文档提交前 `git diff --cached --check`：通过（仅本次新增文档）。

未运行产品测试、lint/build、WK/App/UI、依赖安装或网络操作。作者 evidence 中 entry 11、editor 963、Bridge 16、WK 18 的通过记录仅为外部证据，非本人实跑，不能据此扩张本次结论。

## 交付与风险

只新增本任务记录和 `docs/reviews/INK-REV-175-heading-entry-standards.md`。未完成事项：本任务无；行为、物理 IME、可见 paint、VoiceOver 与最低系统的验收不在本次范围。风险：静态检查无法证明组合候选、选区/复制或真实界面的所有行为；无 Standards 发现不等于这些行为已通过。

评审文档 commit 以本任务分支最新 `docs(review): record heading entry standards review` 为准；其 SHA 随最终交付回报。不 push、不建 PR、不 merge。

## 限定静态后验（512ad4e）

在原评审提交 `6749baeb3d6cc9762705e9fc5c3c87f6d2f37afc`、clean 工作树上追加。固定产品为 `512ad4e41660355fe14dd6a7db6fa0c2672fa2a9`；唯一新增评审范围为 `git diff aec23e2663ac5c624a0bdf071bf7a2a13c16feca...512ad4e41660355fe14dd6a7db6fa0c2672fa2a9`。未将产品提交合入本审查分支，只用 git 静态读取对象。

限定原因：根与独立 Spec 发现 strong 后尾空格使显示状态提前消失；SourceAuthority 接受时会向同一可变 Transaction 附加 removeMark，原先接受后检查 steps 数量误判用户输入。本次只检查 capture-before/receipt-after 的规范边界，新增 hard 0、possible 0；不重判 Spec。原输入资格保留，收据没有写入正文、历史或 Bridge。按原 Fowler 全套基线复查，无新增可报告 smell。

新 runtime 红→绿及 Native strong 例均为外部证据；根报告 editor 964、Bridge 16，Native 套件新增到 19，本人未执行这些产品验证，也不把先前 963/16/18 累加成本次实跑。提交内 evidence 仅删除六份日志的末尾空行，失败断言与事实保留；ignored 原件按根说明保留，本人未读取验证该 ignored 副本。

本人实跑：固定新增范围 `git diff --check aec23e2663ac5c624a0bdf071bf7a2a13c16feca...512ad4e41660355fe14dd6a7db6fa0c2672fa2a9` 退出 0；本次文档 `git diff --cached --check` 通过；以原提交 blob 对两文件作 byte prefix 校验通过。未跑产品测试、build、WK/App/UI、新 Agent 或网络。

只向原两文档末尾追加；未完成事项无。静态结论仍不证明输入法、选区/复制、真实 paint 或最低系统验收通过。后验 commit subject 为 `docs(review): append heading entry standards follow-up`，SHA 随交付回报；不 push、不建 PR、不 merge。
