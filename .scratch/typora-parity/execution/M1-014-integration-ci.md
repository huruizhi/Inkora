# INK-M1-014：写作辅助集成与默认 CI

## 当前完成状态

写作辅助 [PR #70](https://github.com/huruizhi/Inkora/pull/70) 已完成双轴审查及017/018修正，squash 合并为 main `48258a93b3fc4a75df21a22ac0d175e01943b744`；本地主工作区已安全快进，工作区干净。最终受检 HEAD 为 `b294e6b5d03ea930326f2add767688873fc01a94`，已逐 Git tree 核对合并树完全相同。

最终本地验证：干净 editor 18文件/315项（含bridge）、独立27冻结控制、lint/build通过，TypeError=0。[最终默认 CI](https://github.com/huruizhi/Inkora/actions/runs/42576854657) attempt3 实际success，job129030166656；lint、非UI层、Release离线资源检查通过，轻量基准步骤成功但仍warn-only，UI/完整启动基准skipped。

前两次仅因HTTPS checkout超时失败；第三次对runner单一工作副本临时采用现有SSH路径获取同仓库/同HEAD，未改检查项。临时URL设置已移除并验证恢复原先不存在状态，无系统代理或全局Git改动。完整CI日志108311 bytes，SHA256 `99c220ab074ecbd25161d6620606b7aec5d9a43e5946ee1aba4af0d0e6c1bcbc`；本地 artifacts/logs/ink-m1-018 与归档 root-m1-checks/INK-M1-018-final 保留两次失败及最终成功、验证摘要和路由恢复证据。

本轮4位审查/修复Agent及workspace均已备份回收，累计46完成workspace回收，无功能执行Agent。真实UI与M0/M1整体门槛不变；不会把此次辅助功能合并写成首阶段写作闭环完成。最新逐项状态与后续依赖见[双轴审查记录](M1-015-016-pr-review.md)。

## 首轮集成记录（历史）

固定基线main 36e636578798510d240b23520122c88578cf3fe5，产品最终0f17f22，集成受检SHA **6ad325b41d74f270f6b8fd20e615259982f9a4f7**。本地 `.worktrees/INK-M1-014` / task/INK-M1-014-writing-tools-integration，包含001/002纯模块、大纲/统计/标题定位、查找面板、源码/只读导航和可编辑源码原子替换。没有实验内核、依赖或Swift/Bridge协议迁移。

管理者独立19根控制、干净303项、lint/build、main dot44项TypeError=0通过；隔离com.huruizhi.Inkora.WritingToolsReview App构建/严格签名校验成功。预检exit78锁屏，真实窗口未启动；UI门槛、M0/M1状态不变。42个完成受管workspace已备份回收，当前无执行Agent；本地集成目录保留。

## 草稿与运行

- 草稿PR：[70](https://github.com/huruizhi/Inkora/pull/70)，已核实draft=true、merged=false、head=6ad325b，尚未合并。正文按pr skill格式记录范围/证据/回退及明确UI未验与受影响套件。
- GitHub连接器可建PR，但无workflow dispatch能力；使用现有已认证gh CLI执行 `gh workflow run CI --ref task/INK-M1-014-writing-tools-integration -f ui-tests=false -f full-bench=false`，成功返回运行链接。
- 默认非UI CI：[42568188093](https://github.com/huruizhi/Inkora/actions/runs/42568188093)，当前已触发，最终结论待实际检查；不把dispatch成功当作CI通过。
- 不在受检分支追加运行状态提交，以免改变受检SHA；后续结论写本记录及PR。CI不包含真实UI/完整启动基准，不能替代滚动、候选窗、键盘、VoiceOver或最低系统实机证据。

## 首轮 CI 结论（历史）

实际运行 completed/success，2026-11-09 05:37:11 UTC 更新；verify job 128999252230耗时1m34s。受检head仍为6ad325b，与PR#70 head一致。lint、Test non-UI layers、Release bundle check (offline)、Performance baseline (light, warn-only)、诊断上传均success；UI acceptance、UI release launch smoke、Full performance baseline为skipped，不当作通过。完整日志/状态JSON已存本地artifacts/logs/ink-m1-014及归档root-m1-checks/INK-M1-014-native，PR正文已更新准确CI链接。

PR仍draft=true、merged=false，main未改变。代码与默认CI证据已可审阅；本轮不新增功能Agent或在未实际取得证据时宣布M0/M1/真实UI通过。后续集中点验大纲长文滚动、查询/替换焦点与键盘/IME/宽窄窗；PM全文raw映射仍是后续独立任务。
