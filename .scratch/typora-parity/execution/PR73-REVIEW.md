# PR73 双轴独立审查

固定代码范围 `0edb13d59532cd19a0fb7afa71e2aab7cf6573a4...c0b375670a2dedc3df998f3377d398d09f5357e8`。两轴分开保留原文，不以规范合规替代功能正确。

# Standards

任务 INK-REV-072（Standards 轴）。基线 `0edb13d` → HEAD `c0b3756`（PR73，15 commits，50 文件，+1948/−68），worktree clean。全库无 `CODING_STANDARDS.md`/`CONTRIBUTING.md`（已核）；书面标准来源为 AGENTS.md、GLOSSARY.md、ADR-0004、docs/markdown-support.md、bridge-protocol.md、editor-session.md、save-barrier.md、testing.md、search-panel.md、docs/design/visual-search-production-v6.md。纯静态审查，未跑 552 套件。

## 书面标准发现

1. **刷新信号来源与文档不一致**（hard，可修文档或收敛代码）：docs/search-panel.md L14 规定"刷新信号唯一来源是既有 `stateChanged` 与面板自身查询/大小写/打开变化"；本次 `main.ts` `recordRuntimeChange` 在 `kind === "status"` 分支新增 `scheduleSearch` 调用，形成第三种触发源，且该文档行未同步更新。不构成第二内容真值（文本仍取 `runtime.getText()`），但规则与代码已背离，须择一收敛。
2. 其余书面规则逐条核对为符合，仅记录佐证：导航事务 `addToHistory:false`、无 dirty/revision（V6 §27）；替换 no-op 不加 revision/历史（V6 §21）；整批一次验证 `parsed.doc.eq(target.doc)` 后一次 accept（V6 §19）；完整重搜默认上限即 `DEFAULT_MAX_RESULTS=10_000`，超限整批拒绝（V6 §21）；CRLF/代理对/字素内部经 `rawBoundaryError` 拒绝（V6 §17）；`indexVisualText` 只索引 PM doc、排除 image_ref mark，不读 DOM（V6 §25）；面板 scope 文案区分 content/source（V6 §7）；`pointerdown` 改为无条件 `preventDefault`，与 search-panel.md 组合安全条款一致。

## Fowler smell（均为 judgement，非 hard）

1. **Duplicated Code**：`main.ts` `performSearchNavigation`/`performSearchReplacement` 已做 `runtime.search` + `sameSearchResult` 重验，`editor-runtime.ts` `navigateVisualSearch`/`replaceVisualSearch`（:176–191、:206–216）内部再次索引+重搜+`sameSearchResult`，同形状校验两处三层；`source-authority.ts` `rawBoundaryError` 与 `replaceVisualText` 各自重复 segmenter 边界集构造循环。
2. **Repeated Switches / Shotgun Surgery**：`activeRuntime.mode !== "visual"` 分支在 `main.ts` 五处散布（导航 ×2、替换 ×2、scheduleSearch ×3）；新增任一模式须同改多点，宜由 runtime 暴露能力对象收敛。
3. **Data Clumps / Primitive Obsession**：`replaceVisualText` 中 `{from,to,insert}` 字面 patch 反复做 `patch.from - open.sourceEnd` 偏移重基；autolink 分组以裸数字 `source.from` 作 owner 身份键。
4. **Divergent Change**：`replaceVisualText`（~150 行）同时承载 autolink 合并、code owner 重建、marks 继承、历史与光标重证，任一规则演进都改此一函数。
5. **Mysterious Name（API 误用）**：`replaceVisualSearch` 以合成选区 `{anchor:0,head:0}` 调 `locateVisualMatch` 仅为取 from/to，而 `mapVisualMatches` 已直接返回该映射，语义遮蔽。
6. **Speculative Generalality 边缘**：`sameSearchResult` 从 `main.ts` 迁至 `visual-search.ts` 复用是良好去重；但 `rawBoundaryError` 新增 `knownBoundaries` 参数仅一处调用方，可接受，暂不算违规。

## 结论

无阻断性书面标准违规；第 1 条文档/代码背离需在后续任务收敛。smell 均为 judgement，不构成 hard 拒绝。UI/IME/NSDocument 等已声明门槛不在本轴结论内。

# Spec

## 发现

1. **高：同内容重载后的旧 runtime 结果仍可执行，epoch 契约只在面板外壳成立。** V6 要求索引绑定 `documentID/revision/raw/load epoch`（`docs/design/visual-search-production-v6.md:25`），冻结 14 明确要求同身份重载后旧 result/plan 原子拒绝（`docs/acceptance/visual-search/cases.json:329-343`）。但 `sameSearchResult` 只比较可视文本、revision、查询、大小写与匹配（`editor/src/visual-search.ts:43-48`），runtime 的 search/replace 接口不携带 documentID/epoch（`editor/src/editor-runtime.ts:72-74,169-172`），重算相同结果后即接受（`:211-230`）。临时生产 runtime Vitest：旧 runtime 搜索 `alpha alpha\r\n`，新 runtime 以相同 raw/revision 调用 Replace All；预期 stale reject，实际 `{ok:true, changed:true, replacedCount:2}`。`main.ts:409-411` 仅保护面板请求；现有 case 14 测试点击已 reset 的 detached 控件，没有把旧 result/plan 交给新 runtime。

2. **中：合法嵌套 marks 可查但不可替换，跨格式要求仅部分实现。** V6 要求同段 marks 连续查找（`:9`）、按起点 marks 完成真实 PM 替换（`:15`），并覆盖 strong/em/strike/跨 marks（`:37`）。CommonMark 模式将 `**alpha *omega***` 解析为 strong 内嵌 em；生产 runtime 也查到 `alpha omega` 一处，但 `replaceVisualSearch(..., "beta")` 在 `editor/src/editor-runtime.ts:206-209` 以“当前输入尚未稳定”拒绝，未得到 `**beta**\n`。这使一个规范内 S 级写法在替换计划前被整体挡住。

未发现无正式需求依据的产品行为扩张。真实 WK/IME/NSDocument/最低 macOS 未验是既定门槛，不列为代码缺陷。

## 管理者处理

072 报告指出的刷新说明及同一文档中旧阶段的模式/能力说明，已在071工作区按实际实现修订，尚未推进最终文档提交；没有改产品以规避契约。报告原文保持，最终提交须通过精确 CI，等待073后收束。072已367文件校验备份并回收，未为等待另一轴保留空闲会话。


073两项真实runtime反例交075补正；072的说明已在c9e247d同步，无产品代码变化。c0的CI42630358139 success仅覆盖原受检提交，最终075接回后须重跑精确head CI。073已367文件校验备份后回收。

分轴汇总：Standards为1处文档规则背离（已文档修正）及judgement建议；Spec为2项可行动缺口，轴内高项为旧epoch结果可跨runtime执行，未发现scope creep。未合并或跨轴重新评级。
