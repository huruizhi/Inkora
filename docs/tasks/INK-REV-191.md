# INK-REV-191：独立输入修复规范审查

状态：完成审查；只新增本任务记录与[审查报告](../reviews/INK-REV-191-ime-input-standards.md)，不修产品。

- worktree `.worktrees/INK-REV-191`；分支 `task/INK-REV-191-ime-input-standards`。
- 固定受审提交 `c22e6841a3b5c69197a0556cfe457bd3dcdbb081`；base `3dac317feef5c3850c245c3b1ba634cfad6a58eb`；初始clean，merge-base准确，diff非空且仅一个提交。
- 实跑及结果：`git diff --check 3dac317feef5c3850c245c3b1ba634cfad6a58eb...c22e6841a3b5c69197a0556cfe457bd3dcdbb081` 通过；`make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` 通过；`/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/heading-entry-runtime.test.ts src/list-input-runtime.test.ts` 首次缺生成资源、0测试，执行 `node editor/scripts/prepare-renderers.mjs` 后92项通过。
- 日志：ignored `artifacts/INK-REV-191/`，保留首次失败；仅为本树创建 `editor/node_modules` 软链并已unlink，未安装依赖。
- 结果：书面硬偏离0；possible Mysterious Name低优先级1项；不混入Spec。
- 未验/风险：未跑完整editor/build、Native/WK、App/GUI、物理IME、paint、VoiceOver/macOS14验收；作者125/Native25未当本人证据。真实候选框/光标行为仍需单独验收。
- 无代码未完成项；建议重命名未执行，符合只审不修。审查提交与真实remote核验结果由完成回报给出。

## 限定静态后验追加

首稿全文保留；只审 `c22e6841a3b5c69197a0556cfe457bd3dcdbb081...a37ed683237589e27a5212a1095de99bbdb36977` 新增 hunk。`87ad9b3` 的证据文档不算本人实跑。

- 原命名判断项：已改名 `literalParagraphProjection` 并更新两处调用，关闭。
- 新硬偏离0、新判断项0；尾部空段受多一个空paragraph、LF/CRLF结尾、已证明裸标记及精确EOF插入锚点限制，未见无条件放宽未知事务。
- Native新增方法与计数26对应；仅静态核对，不声称本人运行。
- 此次实跑仅 `git diff --check c22e6841a3b5c69197a0556cfe457bd3dcdbb081...a37ed683237589e27a5212a1095de99bbdb36977`（退出0）、diff/提交范围及首稿前缀完整性核对；不重复全量/DOM/Native/WK/GUI/构建。
- 后验原始diff和检查输出：ignored `artifacts/INK-REV-191/post-review.log`。实际输入、光标绘制与最低平台仍未验；本次无产品修复。
