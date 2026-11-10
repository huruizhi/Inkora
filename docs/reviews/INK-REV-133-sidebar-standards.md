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

## Post-fix 独立复审（2026-11-11）

本节保留首稿，另审固定产品 `caab97a9b3a03bf2dbc6bcecf66d27d201eccd87` 相对首稿受检 `d3edf8803c661d1fb2dbebf9e8abdd826720f69d` 的修正；主基线仍为 `30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。产品通过 `git archive` 解包到自身 ignored 冻结副本，未读取动态根产品源码。

### 主要结论（少于400词）

- **S1 关闭。** `app/Sources/EditorViewController.swift:244–257` 已改用 `bridge.presentDocument`，不传 raw；`EditorBridge.swift:347–401` 生成唯一 requestID、固定 doc/revision/accepted loadID，匹配回执并处理超时；`267–272,592–594` 在重载及生命周期失效时取消请求。`editor/src/bridge.ts:194–213,505–520` 校验正式命令、拒绝正文夹带与旧 load/重复请求；`main.ts:803–812` 经既有 receive 执行并回执。故不是仅靠改文档消除偏离。
- **书面扩展自洽。** `docs/bridge-protocol.md:227–267` 与 `docs/design/typora-sidebar.md:47` 明确 additive v1 和目录元数据限定例外；既有正文、事务及保存权威未转移。标题/选区明确排除在目录 UI 例外之外，保留纯元数据与范围命令的区别。
- **取消边界符合本轮规则。** `sidebar-connection.ts:42–56,63,85` 保留已完成搜索意图并传两个 target ID；`SidebarWorkspaceBridge.swift:289–317` 只撤销匹配目标，`338–344` 将导航代际嵌入票据；`EditorViewController.swift:280,329` 在异步审查后及转交前重验。依据为上述协议 `263–267` 的“迟到取消不能撤销新请求”。有限实际探针验证了这一边界。
- **本轮未发现新增硬违规。** 原 S2/S3 仍为 P3 judgement，不要求本轮重构。结论仅覆盖冻结修正范围，不作 Spec、GUI 或发布通过判断。

### 本轮证据归属

自跑：冻结 SHA/blob 校验、修正 diff 核查、Node 执行真实冻结 Bridge session 与 Web connection 公共反例、Swift 6 编译并执行真实冻结 Foundation 协议/Catalog/WorkspaceBridge 探针。正文夹带/非法坐标/旧 load/重复请求被拒绝，呈现不改会话状态，取消命中已完成 search 和 pending open、旧票据失效、迟到旧目标不撤销新搜索。编译及最终两组执行均退出0；未实例化 WebView/窗口或展示面板。Native 完整 EditorBridge 的超时/重载路径为源码核查，未冒称已自跑该类全部行为。

借用：固定副本中的 `docs/evidence/INK-UX-135/` 与130取消证据是其他 Agent 的历史结果；根会话本轮 `make lint/test-non-ui/release-bundle-check` 是其负责的门禁，本审查未执行、未据其通过数量作独立证明。命令、启动探针的工具链失败及边界见[任务追加记录](../tasks/INK-REV-133.md)。
