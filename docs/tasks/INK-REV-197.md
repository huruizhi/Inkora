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


## 固定 2a1580e 限定后验

保留首稿与原两项 P2，仅追加固定产品 `2a1580eb0a0b7423e53093680b3ff507ac21f998` 的新增 hunk 审查。独立后验关闭两项 P2；新增授权的段落起点退格/标题起点回车范围无已证 finding。

- 本人命令：归档树 prepare-renderers 退出0；既有 list+heading 两文件111项通过；原首稿5项探针通过；新边界10项探针通过（含gap续输/Enter/Backspace/UndoRedo、标题ATX/Setext/BOM/CRLF、混X退出负控）。具体命令和日志见报告新增段。
- 修改仍仅为原两份文档追加；已用首稿字节副本确认前缀未改。产品只从固定 git 归档读取，未查看动态194/195内容。
- 临时源码日志保留 ignored `artifacts/INK-REV-197/post2/` 待备份，归档树自建 node_modules 软链结束时 unlink。
- 未运行完整套件、Native或GUI；作者1056/Native31不记为本人实跑。平台物理验收仍未完成，未扩大到未验证的中间嵌套/引用gap。
- 本次追加提交：`docs(review): close fixed list Enter spec findings`；实际commit与远端核对在回报中列出。
