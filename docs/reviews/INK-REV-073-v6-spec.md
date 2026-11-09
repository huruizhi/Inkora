# Spec

## 发现

1. **高：同内容重载后的旧 runtime 结果仍可执行，epoch 契约只在面板外壳成立。** V6 要求索引绑定 `documentID/revision/raw/load epoch`（`docs/design/visual-search-production-v6.md:25`），冻结 14 明确要求同身份重载后旧 result/plan 原子拒绝（`docs/acceptance/visual-search/cases.json:329-343`）。但 `sameSearchResult` 只比较可视文本、revision、查询、大小写与匹配（`editor/src/visual-search.ts:43-48`），runtime 的 search/replace 接口不携带 documentID/epoch（`editor/src/editor-runtime.ts:72-74,169-172`），重算相同结果后即接受（`:211-230`）。临时生产 runtime Vitest：旧 runtime 搜索 `alpha alpha\r\n`，新 runtime 以相同 raw/revision 调用 Replace All；预期 stale reject，实际 `{ok:true, changed:true, replacedCount:2}`。`main.ts:409-411` 仅保护面板请求；现有 case 14 测试点击已 reset 的 detached 控件，没有把旧 result/plan 交给新 runtime。

2. **中：合法嵌套 marks 可查但不可替换，跨格式要求仅部分实现。** V6 要求同段 marks 连续查找（`:9`）、按起点 marks 完成真实 PM 替换（`:15`），并覆盖 strong/em/strike/跨 marks（`:37`）。CommonMark 模式将 `**alpha *omega***` 解析为 strong 内嵌 em；生产 runtime 也查到 `alpha omega` 一处，但 `replaceVisualSearch(..., "beta")` 在 `editor/src/editor-runtime.ts:206-209` 以“当前输入尚未稳定”拒绝，未得到 `**beta**\n`。这使一个规范内 S 级写法在替换计划前被整体挡住。

未发现无正式需求依据的产品行为扩张。真实 WK/IME/NSDocument/最低 macOS 未验是既定门槛，不列为代码缺陷。
