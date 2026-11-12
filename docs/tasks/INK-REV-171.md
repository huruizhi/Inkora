# INK-REV-171：基本写作回归 Standards 独立审查

## 完成内容

仅按 Matt code-review 的 Standards 轴审阅固定提交新增 hunk，区分书面规范违规与 Fowler possible smell；没有修产品、调整测试或作 Spec 裁决。

初始工作树干净；分支 `task/INK-REV-171-writing-standards`，固定 HEAD `4b389169d746c785cbfeafce9f11c2854968d653`，base/merge-base 均为 `d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e`。

提交新到旧：`4b38916,c2c9bf5,42bf087,1e64324,ba00e4a,b7391c0,5c8243f,bc1f739,0d6d7fd`。

唯一产品 diff 命令：

```sh
git diff d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e...4b389169d746c785cbfeafce9f11c2854968d653
```

diff 非空：20 文件，2126 增加、40 删除。完整固定 diff 存于 ignored `artifacts/INK-REV-171/pinned.diff`，按 hunk 静态阅读；没有审阅动态管理分支。

## 规范来源

全文读取 `AGENTS.md`、`GLOSSARY.md`、`README.md`、`docs/adr/0003-project-and-bridge.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/bridge-protocol.md`；并读相关 `docs/markdown-codec.md`、`docs/editor-session.md`、`docs/block-editing.md`、`docs/testing.md`。

用 `rg --files --hidden -g AGENTS.md -g CODING_STANDARDS.md -g CONTRIBUTING.md -g CLAUDE.md -g '!*node_modules*' -g '!.git'` 搜索，仓库内只找到根 `AGENTS.md`，未发现另三个命名规范文件。

基线 smell 仅作可能判断；仓库书面规范优先，工具已强制项不重复报告。结论 hard 0、possible 2，详见 `docs/reviews/INK-REV-171-writing-standards.md`。

## 实际检查及结果

- `git status --short`：初始为空。
- `git rev-parse HEAD`、`git branch --show-current`、`git merge-base <base> <head>`：均符合上述固定身份。
- `git log <base>..<head> --oneline`：核对九个提交一致。
- 固定 diff 静态审阅：完成；含产品、三份新增 runtime 测试、hostless 测试及作者任务/证据。作者与管理者日志仅为被审材料，不计为审查者实跑。
- `zsh -n tests/InkoraTests/WritingInteractionHostless.sh`：退出码 0，仅 shell 语法检查，没有执行脚本。

## 修改文件、未完成与风险

仅新增本任务记录及 Standards 报告。不改共享依赖或产品，不创建 Agent/PR/Issue，不 push、不 merge。

未运行 `make lint`、`make test`、构建、Native/WK/App/UI、全量或性能；本次没有产品变化，且遵守管理者要求的静态/轻量边界。没有行为验收或物理 IME 通过结论。两个 possible smell 是维护判断，不是已复现缺陷，也不要求为了评审立即重构。

分支：`task/INK-REV-171-writing-standards`；本次提交由 `git log -1 --format=%H` 查询，最终交接同时回报确切 SHA 与 clean 状态。

## 追加：固定补正后验 Standards 审查

工作树初始 clean，HEAD 为原报告提交 `ea0e0b8f2438b2678da67432c6d6c8a0a9435b32`，分支不变。修改前以 `git show` 与本地 bytes 比较，两个文档均与原提交完全一致；追加后再核对原文 byte prefix，原报告两项低优先级 possible 判断未改写、删除或升级。

固定原受检提交 `4b389169d746c785cbfeafce9f11c2854968d653`；最终补正由 `git rev-parse 53ffb58` 确认为 `53ffb58ab56f4269503f7936e0db3e639654fc66`。历史基线仍为 `d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e`，与最终补正的 merge-base 核对相同。只审以下固定新增范围，不重审旧范围或动态管理分支：

```sh
git diff 4b389169d746c785cbfeafce9f11c2854968d653 53ffb58ab56f4269503f7936e0db3e639654fc66
git log --oneline 4b389169d746c785cbfeafce9f11c2854968d653..53ffb58ab56f4269503f7936e0db3e639654fc66
```

非空 diff 共 10 文件，538 增加、45 删除；提交为 `f2c2e95`（两项真实 WK fixture、close prepare）、`717f104`（marked/link/quote 空白投影、sourceBoundary）、`53ffb58`（loose/quote list lift/join）。产品与相关上下文均通过固定 `git show 53ffb58:<path>` 阅读；作者任务与红日志仅为受检材料。

规范依据沿用上文来源，并读取最终固定版本的 `AGENTS.md`、`GLOSSARY.md`、`README.md`、ADR-0003/0004、`docs/design/source-authority-production-v1.md`、Bridge/codec/session/block-editing/testing 对应规则。重点核对：当前原文与局部位置依据、未编辑格式字节、组合输入守卫、原子接受/拒绝、既有 Bridge/NSDocument 接缝、离线与依赖边界。旧 codec 的规范化描述不得覆盖 ADR-0004 与生产 V1 的原文权威约束。

Fowler 基线继续仅作为 possible 启发式；仓库规范优先，工具强制项不重复。新增范围未见可据书面标准认定的 hard 违规，亦无新增须独立报告的 possible smell。命令层与规划层的相似容器守卫分别约束 PM 操作和源补丁，不能单凭重复外形要求合并证明边界。原 possible Duplicated Code/Data Clumps 均保留为低优先级维护建议；本次不裁定 Spec 覆盖或行为正确性。

本次实际只运行 Git 身份/范围/静态读命令、Python 原文 bytes/prefix 校验及 `git diff --check`。没有运行 lint、产品测试、build、WK、App、UI、全量套件或依赖安装；原作者与管理者的测试记录不计为本人实跑，统一集成测试由管理者负责。close prepare 仅作新增测试接缝阅读，不据此宣告真实关闭/重开或物理 IME 验收通过。

仅追加本报告与本任务记录，不改产品，不 push、PR 或 merge。后验静态审查已完成；行为验证未执行是本次边界，两个既有 possible 判断与运行时风险仍保留。提交 SHA 和最终 clean 状态在交接中回报。

管理者随后要求仅静态查看 `.worktrees/INK-FIX-168/tests/InkoraTests/WritingInteractionHostlessTests.swift` 的 list fixture 小段：单键后 snapshot 验中间源，另一 fresh session 连续两键后才 snapshot，不在两键间 refocus/取快照。查看时该调整尚未提交，未纳入上述固定 diff 结论，亦未由本人运行；其后固定与真实 WK 重跑结果由管理者另记。此次特定小段是明确授权的未固定测试补充观察，不扩展产品审查端点。

该测试调整随后固定为 `059483300b37342554eb7c787b6ed05c3ac06f28`。本人用 `git show` 静态核对其 fixture 小 hunk 与任务/日志追加，并用 `git diff --stat 53ffb58 0594833 -- app editor project.yml` 确认产品范围无变更；仅测试补充新增 hard 0、possible 0。管理者报告真实 WK 16 项 0 失败，固定日志作为外部证据阅读，不冒充本人实跑；产品审查端点仍为 `53ffb58`。
