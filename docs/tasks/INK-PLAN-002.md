# INK-PLAN-002：旧路线图历史标识与状态对账

- 分支：`task/INK-PLAN-002-roadmap-reconcile`，基于规划分支 `2a89a80`。
- 用户授权：保留历史记录，通过标记历史/被替代和后续关闭避免新旧路线冲突；本轮优先纠正错误完成标记。

## 核实结果

2026-11-08 通过 GitHub connector 重新读取路线图和所有 30 张子 Issue。旧路线图将全部子任务勾选完成；实际 #2～24 为 closed/completed，#25～31 为 open。所有子 Issue 的验收条件仍未勾选，因此任务关闭只能作为历史状态，不能代替测试、人工验收或发布证据。

`docs/tasks/INK-025.md` 明确真实 Developer ID、公证、Gatekeeper、干净用户安装与 Beta 发布尚未执行，且要求保持 #25 开放。本轮保留子 Issue 状态，将旧路线图中的 #25～31 恢复为待完成。

## 变更范围

- 旧路线图标题增加历史/重新规划标识，正文增加当前决策地图入口、状态解释及迁移约定。
- 保留原路线图正文和已关闭任务的历史勾选，只纠正七项 Open 任务的完成勾选。
- 旧的 1.x/2.0 分界作为历史记录；新阶段范围由 wayfinder 决策，不沿用为当前承诺。
- 新路线尚未定稿，旧路线图仍保持 Open；子 Issue 的复用、重写和替代关系待范围决策后逐项处理。
- 原始 Issue 元数据保存在 `.scratch/typora-parity/history/issue-1-before.json`。不删除 Issue，不改产品代码。

## 验证与结果

- GitHub connector 已更新 [旧路线图](https://github.com/huruizhi/Inkora/issues/1)，并重新读取验证标题、完整正文和 Open 状态一致；未修改子 Issue，也未删除任何 Issue。
- 当前路线图为 23 项历史勾选、7 项待完成；七项是 #25～31，与重新读取的 Issue 状态一致。
- 地图和对账资料位于独立分支，已提供旧路线图可访问的地图链接；本分支未合并 main。
- `git diff --check`、JSON 快照与勾选变更范围校验通过。本轮为文档和 Issue 元数据维护，未运行产品构建、原生/UI 或编辑器测试。

## 尚待处理与风险

新阶段范围和验收门槛仍待 wayfinder 决策；之后才能决定旧子 Issue 的复用或替代关系，并关闭旧路线图。历史 closed/completed 不是完整验收证明，本轮没有重新审计所有历史提交和 CI 结果。
