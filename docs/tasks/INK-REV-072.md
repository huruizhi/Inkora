# INK-REV-072 可视替换标准审查（Standards 轴）

## 范围与基线

- 基线 `0edb13d59532cd19a0fb7afa71e2aab7cf6573a4` → 受检 HEAD `c0b375670a2dedc3df998f3377d398d09f5357e8`（PR73）。
- 唯一 diff：`git diff 0edb13d...HEAD`；15 commits、50 文件、+1948/−68，非空；worktree clean 已核。
- 全库确认无 `CODING_STANDARDS.md` / `CONTRIBUTING.md`。
- 只读审查；未改产品、未跑 552 套件、未安装依赖。根已实跑的结果不转述为本人执行。

## 必读材料（已读）

AGENTS.md（上下文载入）、GLOSSARY.md、docs/adr/0004-source-authoritative-editing.md、docs/markdown-support.md、docs/bridge-protocol.md、docs/editor-session.md、docs/save-barrier.md、docs/testing.md、docs/search-panel.md、docs/design/visual-search-production-v6.md，及 diff 中全部产品源码改动（visual-search.ts、visual-replacement.ts、source-authority.ts、editor-runtime.ts、main.ts、search-panel.ts、source-replacement.ts 等）。

## 结论摘要

- 书面标准：1 处文档/代码背离（search-panel.md L14 刷新信号唯一来源 vs `recordRuntimeChange` status 分支新增 `scheduleSearch`）；其余 V6/组合/保存屏障/导航条款逐条核对符合。
- Fowler（judgement）：Duplicated Code（三层重验、边界集构造重复）、Repeated Switches/Shotgun Surgery（`mode !== "visual"` 五处）、Data Clumps/Primitive Obsession（patch 字面量偏移重基、数字 owner 键）、Divergent Change（`replaceVisualText` 多规则汇聚）、Mysterious Name（合成选区取 from/to）。
- 详见 `docs/reviews/INK-REV-072-v6-standards.md`。

## 产出与验证

- 新增本文件与上述审查报告，共两份中文文档，无其他改动。
- 验证：`git status --porcelain` 为空（除新增文件提交前）、push 后 origin SHA == HEAD、branch clean。

## 未完成与风险

- CI 42630358139 结果、真实 UI/IME/NSDocument/最低 macOS 验收为既有已声明门槛，本轴不覆盖、不冒充。
- smell 均为 judgement，不作为 hard 拒绝依据。
