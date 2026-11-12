# INK-REV-191：独立输入修复规范审查

状态：完成审查；只新增本任务记录与[审查报告](../reviews/INK-REV-191-ime-input-standards.md)，不修产品。

- worktree `.worktrees/INK-REV-191`；分支 `task/INK-REV-191-ime-input-standards`。
- 固定受审提交 `c22e6841a3b5c69197a0556cfe457bd3dcdbb081`；base `3dac317feef5c3850c245c3b1ba634cfad6a58eb`；初始clean，merge-base准确，diff非空且仅一个提交。
- 实跑及结果：`git diff --check 3dac317feef5c3850c245c3b1ba634cfad6a58eb...c22e6841a3b5c69197a0556cfe457bd3dcdbb081` 通过；`make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` 通过；`/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/heading-entry-runtime.test.ts src/list-input-runtime.test.ts` 首次缺生成资源、0测试，执行 `node editor/scripts/prepare-renderers.mjs` 后92项通过。
- 日志：ignored `artifacts/INK-REV-191/`，保留首次失败；仅为本树创建 `editor/node_modules` 软链并已unlink，未安装依赖。
- 结果：书面硬偏离0；possible Mysterious Name低优先级1项；不混入Spec。
- 未验/风险：未跑完整editor/build、Native/WK、App/GUI、物理IME、paint、VoiceOver/macOS14验收；作者125/Native25未当本人证据。真实候选框/光标行为仍需单独验收。
- 无代码未完成项；建议重命名未执行，符合只审不修。审查提交与真实remote核验结果由完成回报给出。
