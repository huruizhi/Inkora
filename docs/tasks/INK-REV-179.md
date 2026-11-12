# INK-REV-179：任务空格补正 Standards 独立复审

完成 Matt code-review 的 Standards 轴，只审不修，不作 Spec 裁定。报告见[评审正文](../reviews/INK-REV-179-task-space-standards.md)：hard 0、possible smell 0。

## 固定评审边界

- 工作树：`/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REV-179`。
- 分支：`task/INK-REV-179-task-space-standards`；开始工作树 clean。
- HEAD：`e6b6d20801f637ebc6067b122fec39742c01b7aa`。
- base 与 merge-base 均为 `4b3fa6faa21f2a46bbcab3cc3329e681c2cf2401`。
- 两提交：`fa2ae55 test(editor): reproduce task marker space repair failures`、`e6b6d20 fix(editor): accept proven task marker space repairs`。
- 唯一评审范围：`git diff 4b3fa6faa21f2a46bbcab3cc3329e681c2cf2401...e6b6d20801f637ebc6067b122fec39742c01b7aa`，非空，共14文件、685行新增、3行删除。分文件参数只用于阅读同一固定范围。

## 书面标准与核对

使用 `/Users/rayhu/.codex/plugins/cache/mattpocock/mattpocock-skills/1.3.2/skills/engineering/code-review/SKILL.md` Standards 流程。已检索仓库 `AGENTS`、`CODING_STANDARDS`、`CONTRIBUTING`；仅发现根 `AGENTS.md`，后两者不存在。

已读 `AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/design/source-authority-production-v1.md`、`docs/tables-tasks.md`、`docs/design/tables-tasks-production-v3.md`、`docs/editor-session.md`、`docs/save-barrier.md`，以及 Markdown 支持矩阵的数据保真/编码/空白条款。`docs/markdown-codec.md` 与 `docs/text-format.md` 的旧架构描述按 ADR-0004 和支持矩阵当前生产说明解释，不用旧源码回退描述覆盖现行契约。阅读任务178、固定 diff 全部产品/测试/证据变更及相关调用上下文。

重点核对：多步 input rule 仍需原输入 metadata、局部原文补丁与干净的整文目标相等，非无条件重解析放行。空 label separator 是保持既有 task 语义所需的最小额外源字符。新 marker caret 使用同次投影上下文 ledger，核对 sourceLength/docSize、唯一可见方括号、首段位置、原始插字的整份目标，以及局部任务转换后的整份 canonical 文档；候选账本从同次 parsed 依据生成，严格往返并拒绝 snapped。该 caret 例外只在 `!composing` 调用，未另建组合状态或修改历史/保存机制。

完整 Fowler 基线逐项检查：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。均未见足以报告的新增 possible smell；均只作启发判断，仓库书面规范优先，工具强制项不重报。

## 实际执行与交付

本人实际执行 `git status --short`、`git rev-parse HEAD`、`git merge-base`、`git log`、固定三点 `git diff` 与 `rg`/静态阅读，固定点及范围核对通过。文档提交前执行 `git diff --cached --check`，通过；暂存文件范围核对仅含本次两文档。评审正文含标题和链接共393字符。

未运行 `make setup/lint/test/run`、editor 测试、构建、Native/WK/UI；未新增依赖、访问网络或启动其他 Agent。根报告151、固定矩阵16通过及旧build8 Native21例红均仅属外部证据。完整981/Bridge16/新资源Native21当时仍在运行，本文不声明其成功，不借静态审查替代行为验收。

仅新增本任务记录及评审正文，产品、旧测试与既有首稿均未修改。未完成事项：本静态评审无；产品验证与验收由根任务继续。风险：静态核对不能证明真实输入法、caret/选区、撤销重做或原生保存行为均通过，亦不构成安装/发布结论。

提交 subject：`docs(review): record task space standards review`；SHA 由交付回报。工作保留于上述独立分支，不 push、不建 PR、不 merge。
