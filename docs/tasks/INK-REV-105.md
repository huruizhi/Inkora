# INK-REV-105：canonical 保护解析 Spec 独立审查

状态：完成审查，未修改产品、既有证据或冻结 oracle；受检任务仍为 WIP，不据此宣告 V2 完成。

## 固定范围

- HEAD：`47c0d54735c70b9e55268ad43f9f085f08ff4dd6`
- 基线与 merge-base：`acf33923081e066812603269da6a332b7c8e02e3`
- 分支：`task/INK-REV-105-protected-parser-spec`
- 唯一 diff 命令：`git diff acf33923081e066812603269da6a332b7c8e02e3...HEAD`
- 初始门禁：HEAD/merge-base 匹配、diff 非空、工作区干净。
- 冻结 oracle：18 例，SHA-256 `f411d52edea301c3a09de072fd2f8b1de1e82bba75b46a41c1eccde4c7afd636`，未改动。

## 结论

Spec 报告记录 3 个 P1：相同 raw 重开后的旧 epoch 事务穿透；闭合 Mermaid 被错误降级为只读保护块；EOF-only `---` 被错误放行为水平线。详情见 `docs/reviews/INK-REV-105-protected-parser-spec.md`。

## 实际命令与结果

- `pnpm exec vitest run src/ink-rev-105-counterexample.test.ts`：2/2 failed，分别证实 EOF-only `---` 无 issue、闭合 Mermaid 首节点为 `protected_block`。临时测试已删除。
- `pnpm exec vitest run src/ink-rev-105-epoch-counterexample.test.ts`：1/1 failed，证实旧 epoch 事务 dispatch 实际返回 `true`。临时测试已删除。
- 两次正式反例均临时链接 `/Users/rayhu/Documents/projects/Inkora/editor/node_modules`，结束后已 unlink；未运行 GUI/CUA/XCUITest/bench-full。
- 首次反例前误用了嵌套相对链接，`pnpm exec` 在 worktree 物化了锁文件对应依赖（store 全复用、无下载、锁文件未改）；该临时目录已完整删除，随后用正确 symlink 重跑并取得上述同样 2/2 失败结果。

## 未验证与风险

未自行重复完整 Web/Native/Bridge/Release/perf 或 lint；根报告的 760/760 + lint 不作为本审查自跑证据。未做 Standards 轴、rerank、GUI 或物理输入。除报告与本记录外无持久文件变更。
