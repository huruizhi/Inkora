# Standards

## 书面标准

未发现硬性背离。仓库未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`；`AGENTS.md` 要求的中文文档、英文 Conventional Commit、独立 `task/<TASK-ID>-<slug>` 分支、任务范围内修改及不新增依赖，均未见 diff 证据违反。未运行产品测试，符合本票“仅 Standards 轴、无需跑产品测试”的范围。

## Fowler smell（均为判断性意见）

- **Duplicated Code**：`editor/src/source-authority.ts:1578-1580` 的 no-op 成功路径与 `:1607-1610` 的变更成功路径，都直接构造 `this.sourceCommit = { raw: this.currentRaw, doc: this.state.doc, epoch: this.epoch }`。这是同一保存来源证明逻辑在同一方法两个 hunk 中重复；可提取私有的 `recordSourceCommit()`，减少未来字段变更时的分叉风险。

未观察到其余基线 smell 的可靠证据；书面标准优先，且不重复报告工具可直接检查的格式问题。
