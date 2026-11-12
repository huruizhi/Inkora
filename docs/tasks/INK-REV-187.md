# INK-REV-187 代码工具 Standards 审查

- 任务：按 Matt code-review Standards 轴独立审查固定 `9d9dca5`，基点 `1d07702`，只审不修。
- 分支：`task/INK-REV-187-code-tools-standards`；worktree `.worktrees/INK-REV-187`。
- 交付：[Standards 报告](../reviews/INK-REV-187-code-tools-standards.md)。仅新增该报告与本任务记录。
- 结果：1 项 P1 书面规范违反，0 项判断性 smell。查询框本地 composition 未进入 Native 命令资格，正式切源码命令销毁输入节点。已即时告知根任务。
- 验证：`node editor/scripts/prepare-renderers.mjs` 成功；editor 下有界 Vitest 3 文件 37 测试通过；真实 main/Bridge 公共 DOM 反例 1 测试如期失败。证据位于被忽略的 `editor/artifacts/INK-REV-187/`，保留供复验。
- 未完成：产品修复及固定修复点复验；全量、构建、GUI/App、隐藏 WK、物理 IME、VoiceOver 均未运行。
- 风险：候选丢失反例是合成 composition 公共入口证据，不能替代物理输入法验收。193 注册项目不能代表每种语法已验收。
- 提交：本记录与报告同一 Conventional Commit，准确 SHA 以本分支 `git log -1` 为准；worktree 保留。

## 限定复验追加

固定修复 `e8e976084170e32f2b7fd7b3d68828f4f80597ed` 后，本审查独立运行原 main/Bridge probe 及新增正向证明：2 文件 2 测试通过。确认活跃组合、compositionend 后稳定窗口及尾 input 重置期间正式 sourceMode 均拒绝，稳定后恢复；快照逐字原文、revision 0、dirty false。原 P1 关闭，Standards 未关闭发现 0 项。详细边界、根任务验证归属及忽略证据见报告追加节。临时固定产品增量已全部恢复，本人软链已 unlink；只追加这两份文档，保留 worktree 与红证据。
