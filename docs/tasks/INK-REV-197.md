# INK-REV-197：列表回车 Spec 独立复审

任务：按 mattpocock code-review 技能独立核对 INK-FIX-194 的 Spec 轴，固定 base `928929faf0a1da764415c38e241999f9287f1f83` 与产品 HEAD `b2a321a411f227f207c99449e8b2df06a3f20a17`，只审不修。

- 分支：`task/INK-REV-197-list-enter-spec`。
- 报告：`docs/reviews/INK-REV-197-list-enter-spec.md`。
- 完成：核对用户空项两次 Enter 需求及冻结任务规格；核心发现为中间空项第二次退出未闭合、非空选区命令回落改变拆项结构；未发现独立 scope creep。
- 修改文件：本任务文档及上述审查报告；无产品修改。
- 本人验证：既有 list runtime 90项通过；有界 v2 探针5项，2通过/3失败（2个finding）。renderer准备退出0；未运行全量、Native或GUI。
- 未完成：产品修复、重新验收由原实现任务负责；物理IME、绘制与平台验收未做，不算本审已验证。
- 风险：固定产品在所述第二次退出后 unresolved、不可保存；选区命令结构变化已证，未证明其runtime拒绝为新增回归。
- 临时探针和日志留在 ignored artifacts；自建软链在提交前解除。
- 提交：本分支的 `docs(review): record list Enter spec findings`；实际 commit 与远端一致性在任务回报列明。
