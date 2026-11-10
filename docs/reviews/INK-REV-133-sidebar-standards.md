# Standards

受检 HEAD：`d3edf8803c661d1fb2dbebf9e8abdd826720f69d`；基线：`30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。以下仅为 Standards 轴，不作 Spec 或产品完成结论。

## 主要发现（少于400词）

- **S1 · P2 · 硬偏离：正文定位绕开协议。** `app/Sources/EditorViewController.swift:243–251` 将 `location.raw` 放入数组并调用 `window.inkoraPresentation?.locate(...args)`；`editor/src/main.ts:466–476` 接收并执行定位。`docs/bridge-protocol.md:7–12` 明定命令走 `window.inkora.receive(serializedJSON)`、“必须包含 `protocolVersion: 1` 和 `type`”、“必须带非空 `requestID`”，且“正文只出现在”三个既定 text 字段。新入口传完整正文却无协议信封；Native 丢弃返回值，无法关联拒绝。侧栏契约允许 UI 通道，不自动豁免带正文的定位命令。应将其纳入明确的协议扩展和回执，或先正式记录适用例外。静态可证，未声称正文已损坏。
- **S2 · P3 · judgement，possible Duplicated Code。** `editor/src/document-analysis-panel.ts:334,342` 同时保存 `{ time: "阅读时间", … }` 与 `[["time", "阅读时间"], …]` 两份相同口径映射，分别用于更新和创建菜单。新增/更名口径需同步两处，建议共享一份定义。
- **S3 · P3 · judgement，possible Primitive Obsession。** 同文件 `42–43,335,342–353` 使用 `selectedStat = "time"`、`Record<string, string>`、`dataset.stat!` 表示有限统计口径。类型不能约束键集合；建议引入 `StatKind` 联合类型，并从同一口径定义派生标签和值。此为维护性判断，不是书面规范硬违规。

## 依据与证据边界

必读并核对：`AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/markdown-support.md`、`docs/bridge-protocol.md`、`docs/editor-session.md`、`docs/save-barrier.md`、`docs/testing.md`、`docs/design/typora-sidebar.md`。全仓文件名搜索未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`。Fowler baseline 全部作为判断，仓库书面规则优先；未将工具已强制检查的格式/编译事项列为发现。

**本审查自跑：** 初始 HEAD/clean、基线解析、唯一三点 diff 捕获、提交列表、补丁统计和源级核查。36 文件 `+3314/-27`；无依赖清单/锁文件变更；新增模块未见网络调用。未运行产品测试、构建、GUI、Native 窗口或全量门禁，详见[任务记录](../tasks/INK-REV-133.md)。

**外部借用：** `docs/tasks/INK-UX-130.md`、`INK-UX-131.md`、`INK-UX-132.md` 及关联 evidence 日志、`docs/reviews/INK-UX-129-acceptance-matrix.md` 只提供作者/集成者历史记录；其中 passed 数量不是本审查独立证明，也不外推为固定 HEAD 通过。

Standards 共 1 项硬偏离、2 项判断性异味；S1 已提前通知父会话，待协议归属裁定。只审不修。
