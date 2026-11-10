# INK-REV-149：Beta2 候选 Spec 独立审查

## 摘要

结论：在固定审查范围内未发现可证的 Spec 缺陷；本地候选可继续由管理者结算最终 CI，不代表允许公开发行。missing/partial 仅有规格明确留给管理者的精确最终 HEAD 默认 CI pending；scope creep、implemented wrong 未发现。版本、旧版保留、签名措辞及人工验收边界符合契约。本人仅做静态与有界资产读取，没有运行构建、App、GUI 或物理专项。作者/根的检查属于引用证据，不计为本人测试。

## 固定范围与读取

初始工作区 clean，分支 `task/INK-REV-149-beta2-candidate-spec`，初始 HEAD `1e7c8389191addf53fc7fe6e89e105dbf8be8fcb`，基线 `c48d717e9235680142913448d1de80b54cb2890d`。唯一产品审查 diff：`git diff c48d717e9235680142913448d1de80b54cb2890d...HEAD`，非空，8 文件、234 行新增/1 行删除。四提交依次 2f7a9a2、e91bb4f、2abe54d、1e7c838。本报告提交不扩展受审对象。

完整读取 AGENTS.md、GLOSSARY.md、docs/release.md、docs/testing.md、候选规格、Beta1/Beta2 说明，以及全部受改文件。仓库文件检索仅发现根 AGENTS.md；CODE_STANDARDS.md、CONTRIBUTING.md 不存在，未据此推定额外标准。本任务仅审 Spec，不作 Standards 结论。

## 规格逐项结论

| 类别 | 规格原句及位置 | 结论与证据 |
| --- | --- | --- |
| missing/partial | preview-beta2-candidate.md:21：“版本候选的精确最终HEAD默认CI由管理者集中结算” | PROVENANCE 的 ci 与 Beta2 说明均明确 pending；仍待管理者完成，符合职责边界，不记作者缺陷。未要求本人重复全量 CI。 |
| implemented wrong | 同文件:8：“MARKETING_VERSION仍为数字`0.1.0`，CURRENT_PROJECT_VERSION从3单调增至4” | project.yml 唯一修改为 build4；本人读取 ZIP Info.plist 得到 0.1.0/build4、正式 bundle id、14.0。 |
| scope creep | 同文件:14：“不改editor/app生产逻辑、Bridge/依赖/lock/entitlement/既有release严格凭据策略” | 全部 diff 只有版本、CHANGELOG、规格、任务及证据；无对应生产路径或脚本变更。 |
| implemented wrong | 同文件:8：“既有beta.1的标签、说明和资产字节保持不变” | Beta1 说明无 diff，CHANGELOG 原 Beta1 内容保留。受审提交无标签或旧资产改写；远端历史资产未由本人重新下载验证，不声称独立验证其远端不变性。 |
| missing/partial | 同文件:9：“覆盖beta.1之后实际已合改动” | Beta2/CHANGELOG 涵盖900/760、右上统计与侧栏、图标、表格、技术修改、图片及许可；明确旧能力并非新增、图片跨节点草稿未实现，无完整 Typora 对齐声明。此审查不重验既有功能实现。 |
| implemented wrong | 同文件:19：“禁止重新打包而沿用旧校验值”“必须证明app/editor/project完全相同” | 本人验证候选 ZIP/DMG SHA256、字节数均与提交 provenance 一致；构建 source a5267f1 与受审 HEAD 的三项 Git 身份逐项相同。作者记录 cmp 原包成功；根独立结果 sourcePathsMatch/assetsSHA256Match 为 true。本人未重复原包 cmp。 |
| scope creep | 同文件:25：“不能因为本候选机器检查通过就自动写成beta.2公开授权” | Beta2、CHANGELOG、provenance 都明确本地/未发布；docs/release.md 未改，Beta1 例外未扩张。无 tag/Release/draft/上传操作。 |
| implemented wrong | 同文件:21：“候选检查不等于Developer ID发行门槛” | ad-hoc/runtime 与无 Developer ID/公证清楚区分；archive 未签名亦明确。Gatekeeper、真实 paint、VoiceOver、授权、干净用户仍未验，正式发行要求未放宽。 |

## 本人命令与结果

- `git status --short`、`git rev-parse HEAD`、`git log -4 --oneline`、`git branch --show-current`、`git remote -v`：clean、固定 HEAD/四提交/任务分支匹配，origin 为既有 Inkora 仓库。
- `git diff c48d717e9235680142913448d1de80b54cb2890d...HEAD` 及 `--stat`：已完整审阅上述限定差异。
- `rg --files --hidden -g AGENTS.md -g CODE_STANDARDS.md -g CONTRIBUTING.md`：仅 AGENTS.md。
- 单次 `python3` 有界检查：读取提交 PROVENANCE；对 source_commit/HEAD 执行 `git rev-parse <ref>:<path>` 比较 app/editor/project.yml；使用 hashlib 比较根保留 candidate 中两包 SHA256/大小；zipfile/plistlib 仅读 ZIP 内 Info.plist；断言 Beta1 说明、release.md、app/editor/scripts 无受审 diff。所有断言通过，exit 0。未解包运行 App、未挂载 DMG、未修改候选字节。

候选读取位置：`/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REL-146/artifacts/candidate`。ZIP SHA256 `f93d0d5d8355c3cf74f6577440ced348d28cf0170006bad87abda8cd2c677530`；DMG `73d4f2cab6356638eb35ae39cf81c5f28235429a656d0dae3482f6135729c5a5`。

## 引用证据与未验

作者：docs/tasks/INK-REL-147.md 与 docs/evidence/INK-REL-147/{PROVENANCE.json,SHA256SUMS}。根：`/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REL-146/artifacts/manager-candidate-check/result.json`，绑定本次初始 HEAD，记录 ZIP/DMG 双架构、strict ad-hoc/runtime、精确权限、离线 bundle、只读挂载且卸载、未启动 App。本人仅阅读这些结果，不把作者/根实跑计为本人测试或物理通过。

本人未跑 make setup/lint/test/test-ci/release、archive、签名或 GUI；无生产代码变化且任务明确限定有界审查。最终 CI 由管理者结算；正式发布仍受原 release 门槛约束。取消的 macOS14 专项/重复物理 IME 不构成此次缺陷。未创建临时资产或依赖链接，原候选与日志保留供根双备份后回收。无修复、无 PR/Issue/合并/标签/发行/安装。
