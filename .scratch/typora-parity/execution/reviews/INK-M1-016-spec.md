# Spec

审查者：Codex GPT-5.6-Sol。固定比较 24 commits / 36 files，HEAD `6ad325b41d74f270f6b8fd20e615259982f9a4f7`，基线 `36e636578798510d240b23520122c88578cf3fe5`。

## 发现

**中｜错误**：规格要求“HTML token 不执行也不显示”且“HTML 标签不计入内容”（docs/document-analysis.md:33、61）。但 `editor/src/document-analysis.ts:66` 配置 html:false，使标签成为普通 text token，并由 inlineContentText（239 起）进入大纲和统计。

实际最小重放 `# <b>Title</b>\n\n<b>x</b>`：标题为 `<b>Title</b>`，内容统计 20 字符 / 6 单元；规格应为 Title，6 字符 / 2 单元。最小 Vitest 1/1 按预期失败。建议启用 HTML tokenization、继续跳过 HTML token，并覆盖 inline / block HTML。

缺失、范围扩张：没有发现其他可行动问题。此项审查不代表未验环境已通过。

## 验证与交付

审查指定任务、正式契约及上游设计；最小 Vitest 1/1 red；git diff --check 通过；未执行真实 WK、IME、布局或磁盘。临时测试和依赖链接已清理。

分支 task/INK-M1-016-writing-tools-spec-review，工作区干净，无新 commit。Agent 已归档，报告交管理者安排限定修复。
