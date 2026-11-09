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
