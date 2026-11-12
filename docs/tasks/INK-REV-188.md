# INK-REV-188：代码工具 Spec 审查

- 分支：`task/INK-REV-188-code-tools-spec`，独立 worktree `.worktrees/INK-REV-188`。
- 产品固定 `9d9dca5b1458596aa984c07dc17c0e7e0a18b311`，基线 `1d07702e1144011803b846df1b6ac2f873ad65fc`；仅审不修。
- 产出：[Spec 报告](../reviews/INK-REV-188-code-tools-spec.md)。新增文件仅本任务记录和该报告。
- 本人定向 Vitest：35 例，33 通过、2 红，均指向同一过期候选资格缺陷。原 13 语言样例断言保持。最小反例与冻结日志位于忽略目录 `editor/artifacts/INK-REV-188/`。
- 不运行全量、GUI/App、物理 IME、安装和 Keychain；Native/WK 未作为本人运行结果。
- 尚待限定修复复验；保留工作树及忽略产物待双备份。风险和完整命令见报告。
