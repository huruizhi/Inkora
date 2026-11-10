# INK-REV-148：Beta2 候选 Standards 审查

## 摘要

仅审 Standards，只审不修。固定受审 HEAD `1e7c8389191addf53fc7fe6e89e105dbf8be8fcb`，基线 `c48d717e9235680142913448d1de80b54cb2890d`（PR #89）；唯一内容 diff 为 `git diff c48d717e9235680142913448d1de80b54cb2890d...HEAD`，在新增本报告之前读取。

结论：书面硬违规 **0 项**；Fowler judgement **0 项**。不代表 Spec、发布门槛或完整 Typora 对齐通过。八个受改文件仅含 build 3→4、候选说明、任务/契约和证据；没有新增产品逻辑、依赖或 entitlement。版本保持数字 0.1.0。Beta2 明确为本地未发布候选，未扩大 Beta1 未签名公开发行例外；旧 Beta1 说明未改。

逐项筛查 Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest。没有可引用的新增代码 hunk 支持这些判断；说明和证据重复版本事实不自动构成代码 smell。

## 规范与阅读范围

完整读取根 AGENTS.md、GLOSSARY.md、docs/release.md、docs/testing.md、docs/design/preview-beta2-candidate.md、两版发行说明和全部八个受改文件。`rg --files` 搜索只找到根 AGENTS.md，未发现 CODE_STANDARDS、CODING_STANDARDS 或 CONTRIBUTING 文件。规则优先于 smell；工具强制项不作为人工发现。

AGENTS.md 的中文文档、隔离分支、真实测试报告、编辑器保真及平台约束均无本 diff 可证违反；release.md 的数字版本/递增 build、旧标签不可覆盖和严格凭据策略亦未见违反。发行说明沿用 GLOSSARY 的原文权威与草稿边界，不声称跨节点草稿恢复完成。

## 本人命令与结果

- `git status --porcelain`：初始空输出；`git rev-parse HEAD` 与基线均解析到指定完整 SHA。分支为 `task/INK-REV-148-beta2-candidate-standards`。
- `git log c48d717e9235680142913448d1de80b54cb2890d..HEAD --oneline`：依次 1e7c838、2abe54d、e91bb4f、2f7a9a2，恰四提交。
- 上述唯一内容 diff 及其 `--stat`：8 文件、234 insertions、1 deletion。`git diff --check c48d717e9235680142913448d1de80b54cb2890d...HEAD`：exit 0。
- Python 3 + `git rev-parse <ref>:<path>`：app/editor/scripts 与基线 tree 相等；Beta1 说明 blob 相等。HEAD 的 app/editor/project.yml 与 PROVENANCE.identities 三项相等。
- Python 3 JSON/清单解析：PROVENANCE 两资产 SHA256 与 SHA256SUMS 一致；四提交 subject 长度 62/59/59/50，均 ≤72。以上仅静态一致性，不是本人重新散列候选字节。

首次文件搜索含未引用 shell glob，zsh 报 no matches；随后使用带引号的 rg glob 完成搜索，无文件遗漏。

## 借用证据

读取管理者 `/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REL-146/artifacts/manager-candidate-check/result.json`：其记录 sourceHead 为受审 HEAD、sourcePathsMatch/assetsSHA256Match 为 true，以及 ZIP/DMG build4、双架构、strict ad-hoc/runtime、精确权限、离线 bundle、只读挂载和卸载。本报告仅引用该结果，没有本人执行这些包验证的声明。

作者 INK-REL-147 的 dry-run、lint/test-ci、缺凭据 fail-closed 及 archive/ZIP/DMG 检查同样为借用证据，未重复执行。

## 未验与风险

本人未运行 make setup/lint/test/build、NativeReleaseCI、archive、App、UI、CUA、浏览器、系统面板、XCU、物理 IME 或 macOS14 专项，未挂载 DMG。精确候选最终 CI 仍由管理者结算。Developer ID、公证、quarantine/Gatekeeper、干净用户、真实 paint、人工 VoiceOver、真实系统授权仍无本审查新增证据；不得据此公开发行或宣称物理门槛通过。

本任务只新增本报告及 docs/tasks/INK-REV-148.md；无代码修复、依赖修改、PR/Issue/merge/tag/Release/上传/安装。候选与既有临时证据未删除，待根双备份后回收。
