# INK-REV-154：写作预算 Spec 独立审查

- 固定受检HEAD：`9bd139681a52c9d801158a0c4f9b899c91d263ee`，基线`aef514c501cb33eb10cac121d300b67374c462a5`。初始clean，merge-base等于基线，唯一三点diff非空；六提交依次f09143d、412e295、69810d2、b9880fa、8bcf00c、9bd1396。
- 只新增本task及自身review；未读另一review结论，未改产品、测试、旧证据、阈值或依赖。分支`task/INK-REV-154-writing-budget-spec`。
- 标准来源：AGENTS、GLOSSARY、ADR0004、testing、performance、acceptance、bridge-protocol、document-save、save-barrier、markdown-codec/safety；以ADR当前原文权威原则理解历史codec文字。独立全仓文件名检索（含hidden）未发现CODING_STANDARDS.md/CONTRIBUTING.md。原15和07从规划分支git show读取；当前契约及152矩阵按固定HEAD读取。
- 本人实际执行：git status/rev-parse/merge-base/log/diff/show/branch/remote、rg/cat/sed/nl/head；`zsh scripts/perf/test-safe-save-151-runner.sh` exit0，两条PASS，真实runner的子集成功与模拟exit23失败均验证旧输出归档且canonical清空，未启动Xcode。
- 本人Python固定证据核对exit0：baseline-webview 16项、safe-save-full 30项均匹配N=3（snapshot为15）、median及nearest-rank p95；四输入bytes/SHA与manifest及两workflow一致，mixed匹配530-byte fixture；两workflow五项resourceHashes相同。两测试源码SHA匹配固定HEAD；runner记录SHA匹配b9880fa测量版本，8bcf00c隔离补正后不同，不能称该旧SHA覆盖新脚本。app/editor/project.yml git tree/blob与基线一致。
- 一次rg误用app/Inkora路径返回不存在，随后用rg --files定位app/Sources并读取；一次Python最初读取不存在的resources键比较None无证明力，随后明确检查真实resourceHashes五项通过。均非产品失败。
- 作者151的真实model/WK/full-save通过及root独立核验仅为外部证据，非本人自跑；Xcode exit0/no-output与旧URL竞争红例均不独立构成产品bug。未运行setup/install、make lint/test/build、WK/Xcode、bench-full、GUI/CUA/XCU、物理IME或mac14。
- 完成：Spec三类检查及报告。未完成/风险：正式体验预算、paint、VoiceOver、真实Sandbox授权仍未验；用户排除的14专测和重复实体IME不复做、不填通过。不能由小样本或后台分布推出总体尾延迟/完整阶段完成。保留worktree与ignored产物等待两层备份回收。
- 交付检查：git diff --check；commit/push及真实ls-remote=交付HEAD、最终clean结果见交付回复（避免自引用commit）。通知使用paseo技能，无新增Agent、PR/merge/Issue/tag/Release/上传/安装。
