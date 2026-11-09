# INK-REV-092：引用定义 Spec 轴独立评审

## 范围

- 轴：Spec；只审不修。
- 固定受检 HEAD：`49440e1b3bd7ea70974a5d671680c34f5b5c75d1`。
- 基线：`d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14`。
- 正式来源：`docs/markdown-support.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/editor-session.md`、`docs/save-barrier.md`、`docs/tasks/INK-M1-087.md`，以及 CommonMark 0.31.2 §4.7 本地 oracle。

## 结论

Spec finding 为 0：缺失/partial 0，scope creep 0，实现错误 0。正式报告见 `docs/reviews/INK-REV-092-reference-spec.md`。

审查确认：字段 raw 边界、空 destination、转义 label、重复定义 first-wins、只改目标时保留多行 title、no-op/history、容器、BOM/CRLF、例201 HTML 保护及 PM 空容器/code 尾 LF 适配均有与任务声明一致的实现或回归。旧 `toThrow` 与空 href JSON 断言的调整均由任务要求直接解释，不是删除有效 oracle。

## 本轮命令与结果

- `git rev-parse HEAD`、`git rev-parse <baseline>`、`git status --short --branch`、`git log --oneline <baseline>..HEAD`：HEAD/基线匹配，工作区干净，单提交。
- `git diff d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14...HEAD`：非空；这是本轮唯一 diff 命令。
- `pnpm --dir editor exec vitest run src/__ink_rev_092_tmp.test.ts`：容器反例 2/2 passed；另一轮空 title 诊断 1 failed，复核后否决为本 diff finding。临时测试与依赖软链均已清理。
- root 的 editor/Bridge/Native/lint 全量结果仅记为外部证据，本轮未重跑。

## 未完成与风险

未做 GUI、真实 WK、物理 IME、Sandbox、AX、最低 macOS、正式文件闭环；这些是既有验收边界，不构成本 Spec finding。未审 090 proof/handoff，也未把物理延期重复登记为缺陷。

