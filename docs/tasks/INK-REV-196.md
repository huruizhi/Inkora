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
