# Standards

审查者：OMP GLM-5.3。固定比较 `git diff 36e6365...6ad325b`，36 文件，+6782/−22；独立 worktree 干净，无新 commit。已全读 AGENTS.md 与指定规范文档，未发现 CODING_STANDARDS.md/CONTRIBUTING.md。

## 审查发现

以下均为判断类 smell，未发现书面规则硬违规；没有新增 Bridge 消息，executeCommand 被阻断时经 session 返回拒绝，未静默忽略。

1. **重复实现且语义分叉（中）**：`editor/src/heading-navigation.ts:29,52` 与 `editor/src/source-navigation.ts:31,27` 各自定义 `rawOffsetToTextareaOffset` / `textareaProjection`。heading 版只拒 CRLF / 代理对，source 版还做字素边界校验。生产 runtime 只用 source 版；heading 版仅自身测试引用，属未使用实现和 Duplicated Code / Shotgun Surgery。建议删除旧副本，保留测试并改测共享实现。
2. **Runtime 重复（中）**：`SourceEditorRuntime` 与 `ReadOnlyEditorRuntime` 的 `getSourceSelection` / `selectSourceRange`（editor-runtime.ts:257–280 与 401–423）及 `navigateToHeading`（338–355 与 430–443）近乎逐行相同。建议提取共享 textarea 导航 helper。
3. **main 重验证重复（中）**：`performSearchNavigation` / `performSearchReplacement`（main.ts:117–180 与 181–232）重复 binding、epoch、query、raw、重搜与 sameSearchResult 前奏。建议提取 revalidateSearchBinding。
4. **Segmenter 分散（低）**：五个模块各自实例化，document-analysis 使用 en，其他使用 host locale。建议统一入口与 locale；审查者仅提出理论一致性风险，没有给出实际字素分叉反例。

## 已核实与验证范围

SearchPanel.destroy 清理 timer 并移除 DOM；accepted load 经 stateChanged / scheduleAnalysis 代际作废旧任务；无新增依赖。仅静态审查和 git / 检索，未运行测试、安装依赖或 GUI。真实 UI 未验是范围声明，不是规范违规。

分支 `task/INK-M1-015-writing-tools-standards-review`，HEAD `6ad325b41d74f270f6b8fd20e615259982f9a4f7`。审查 Agent 已归档。

## 管理者复核

管理者直接读取两个 mapping 实现、runtime / main 调用及引用检索，确认前三项重复事实；没有证据表明生产正在使用较弱的 heading mapping，不能描述为已证实的运行时边界漏洞。第四项尚无产品反例，不扩大为统一国际化重构。是否在本 PR 做有限清理，待 Spec 轴到齐后分别处理；不以 smell 数量推断规格通过或失败。
