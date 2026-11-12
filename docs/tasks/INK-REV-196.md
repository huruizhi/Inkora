# INK-REV-196：普通列表连续回车 Standards 独立复核

## 范围与结果

只审不修，固定候选 `b2a321a411f227f207c99449e8b2df06a3f20a17`，基线 `928929faf0a1da764415c38e241999f9287f1f83`。分支 `task/INK-REV-196-list-enter-standards`，独立工作树 `.worktrees/INK-REV-196`。创建后 HEAD、merge-base 与初始 clean 均已核对。

完成书面规范和12类 Fowler baseline 检查，报告 hard 0、possible 0；详见[复核报告](../reviews/INK-REV-196-list-enter-standards.md)。规范优先于启发式，工具覆盖项不重复报告。规格仅辅助界定范围，不混入 Spec 结论。

## 修改文件

仅新增本任务文档与 `docs/reviews/INK-REV-196-list-enter-standards.md`；不修产品、不改实现测试。

## 实际执行

1. `git status --porcelain`、`git rev-parse HEAD`、`git merge-base 928929faf0a1da764415c38e241999f9287f1f83 HEAD`：初始 clean，固定HEAD及base正确。
2. 固定三点 diff、单提交列表核对：6文件，211新增、7删除；完整阅读。
3. `rg --files -uu -g 'CODING_STANDARDS*' -g 'CONTRIBUTING*' -g 'AGENTS.md' -g '!node_modules' -g '!.git' -g '!build' -g '!.worktrees'`：只发现根 AGENTS.md；另读取 GLOSSARY、ADR-0004、V1。
4. 自建依赖软链后 `node editor/scripts/prepare-renderers.mjs`：退出0。
5. `make lint`：退出0；Swift严格格式及 `tsc --noEmit` 通过。
6. `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-input-runtime.test.ts`：退出0，synthetic DOM 90/90。
7. 结束时仅 unlink 本人软链，ignored `artifacts/review-196/` 日志及既有脚本生成资源保留待备份。

## 未完成与风险

复核范围内无待修项。未跑全量 editor/完整 Native、GUI/App、安装发布或物理IME/paint/VoiceOver/macOS14实机；作者1043/Native28不可记作本人结果。未进行依赖安装、Keychain操作或子Agent委派。无全产品验收或发布结论。

以英文 Conventional Commit 提交并推送本分支；最终实际 commit、remote=HEAD 与 clean 核对结果由完成回报给出，避免在本提交内引用自身SHA。

## 限定后验追加：2a1580e

首稿保持原文。首稿提交 `2ec3bf757441c12a414c2e9d2164110aab700bc6` 已推送，实际 `ls-remote`=HEAD，工作树 clean。

后验固定 `2a1580eb0a0b7423e53093680b3ff507ac21f998`，只审相对 b2a321a 的新增 hunk；继续采用既定四份规范与12类 Fowler baseline。重点复核有界字节位置、未知事务负控、parser tightness 的完整同内容证明；hard 0、possible 0。没有把197的规格结论合并到本轴。

本人用 `git archive` 提取固定候选至 ignored `artifacts/review-196/postreview-source/`，只自行软链既有依赖。执行：

- 既有 renderer 准备脚本：退出0。
- `make lint`：退出0。
- `pnpm --dir editor exec vitest run src/list-input-runtime.test.ts src/heading-input-runtime.test.ts`：111/111，退出0。
- `pnpm --dir editor exec vitest run src/review-196-controls.test.ts`：本人 ignored 两项有限负控2/2，退出0；检查完整内容/marks/非tight属性和空段anchor拒绝边界。
- 固定差分 `git diff --check`：退出0。

实际 pnpm 使用副本下 `.tools/node_modules/.bin/pnpm`。测试为 synthetic DOM/纯模块；作者1056/Native31不作本人验证。无全量 editor/Native、GUI/App、安装、Keychain、子Agent或新依赖。本人软链结束时 unlink，冻结副本、控制夹具及原始日志保留待管理者两层备份。

本轮只追加196报告和任务文档，不修产品；后验范围无待修项。物理IME/paint/VoiceOver/macOS14及完整回归仍未验，风险未解除。最终提交SHA、远端等于HEAD与clean由完成回报给出。
