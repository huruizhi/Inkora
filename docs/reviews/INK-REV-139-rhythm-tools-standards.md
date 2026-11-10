# INK-REV-139 阅读节奏与表格工具 Standards 审查

首次摘要：固定初始 HEAD `ce4dd2ff0487ead9d0970f21b81d9d6b84bae009`，基线 `666ef210b814c1a7e779b7468781764b44980239`；7 个提交与委派一致，diff 非空。仅 Standards 轴：未发现有充分代码依据的书面标准硬违规；发现 1 项低优先级 possible Duplicated Code，属于 Fowler 启发判断，不是合并阻断规则。没有运行产品测试、构建或真实 WK，不将作者及管理者的测试结果计为本人验证。只新增本报告和任务记录；不修改产品或已有测试。

## 固定范围与方法

唯一 diff 命令：`git diff 666ef210b814c1a7e779b7468781764b44980239...HEAD`。初始工作树 clean；捕获文本 256724 字节。后续审查读取该捕获及固定 HEAD 文件，报告提交不作为受检产品提交。

`git log 666ef210..HEAD --oneline` 实际为：

```text
ce4dd2f fix(editor): keep table menu within visible editor bounds
e121db9 docs: record combined typography and table checks
4fc4a78 feat(editor): compact table tools into a bound context menu
e94a677 fix(editor): tighten adjacent heading reading rhythm
e4c5b3b docs: record typography task escalation after stalled execution
2da1162 docs: preserve full development scope during UI refinements
240b8bc docs: define reading rhythm and table tools implementation scope
```

全仓 `find . -name CODING_STANDARDS.md -o -name CONTRIBUTING.md -o -name AGENTS.md`，以及包含隐藏路径的 `rg --files --hidden` 复核，仅发现根 `AGENTS.md`；未发现 CODING_STANDARDS.md 或 CONTRIBUTING.md。未安装依赖，初始 `.tools` 与 `editor/node_modules` 均不存在，本轮不创建 symlink。

完整阅读适用书面来源：`AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/testing.md`、`docs/editor-session.md`、`docs/save-barrier.md`、`docs/markdown-support.md`、`docs/design/typora-rhythm-tools.md`、`docs/design/typora-ui-round2-plan.md`。补读相关实现、上下文工具及受改测试、137/138任务和证据说明。采用 code-review 技能的 Standards 方法，依本次明确指令不派子 Agent、不开展 Spec 轴；跳过工具已强制的格式/类型规则。

## 书面标准偏离

未发现可确立的硬违规。以下列出审查依据与静态边界，不能解释为已验证所有不变量：

| 来源及具体规则 | 本次代码依据与结论 |
| --- | --- |
| AGENTS.md:7「不得删除或绕过有效测试；不得引入未在任务中说明的依赖」 | `context-tools.test.ts` 原首个按钮期望随主入口变更；`tables-tasks-runtime.test.ts:57–60` 仅为次级命令先打开菜单。原内容/状态断言保留，未见删 golden、依赖或 lockfile 改动。 |
| ADR-0004「当前 Markdown 原文」「唯一…权威」；GLOSSARY「位置依据」包括文档版本 | `table-editing.ts:224–237,250,303–320` 保存 EditorState 身份、检查生命周期和 composition，动作仍调用 applyTableCommand。未见以 DOM 文本反写原文。 |
| editor-session.md「selection-only transaction 不发布事件」；save-barrier.md「markSaved…不重建或覆盖较新的当前原文、选区和历史」 | 新增 open/close 只变菜单 DOM、局部 binding 和监听；未修改会话、保存、Bridge 实现。不能仅由此证明运行时全部历史边界。 |
| markdown-support.md FID-002「最小范围之外…必须逐字节保留」及 ENC/EOL 契约 | 内容命令仍走现有局部路径，没有更换 serializer/parser；新增测试含 BOM/CRLF/Unicode 和 Undo/Redo 强断言，但本轮未执行。 |
| typora-rhythm-tools.md:9「生产仅修改…正文排版规则」、:20「不要为了菜单引入泛化框架/依赖」 | writing-surface.css 仅新增两条局部标题 selector；菜单 CSS 独立导入；未引入依赖、框架或产品调试入口。 |
| testing.md「Agent 本地只运行非 UI 目标」；rhythm-tools.md:27–29 禁止占屏与重复全量 | 本人仅静态审查。作者文档将 WK/paint/物理IME/macOS14 分开报告；未将其结果转记为本人实跑。 |

产品需求覆盖、菜单极端几何与交互正确性属于另轴，不在此得出符合/不符合结论。

## Fowler baseline：判断项

### S1：possible Duplicated Code（低优先级，非硬违规）

位置：新增 `editor/src/table-menu.test.ts:16–43,62–77`（diff `@@ -0,0 +1,150 @@`），对照同一 diff 中 `editor/src/context-tools.test.ts` 的 `@@ -43,7 +43,7 @@` 及该测试现有上下文 16–67 行。

新增测试保留了同名用例 `follows table/code caret selection without changing raw, history or save eligibility`，复制相同 BOM/CRLF fixture、runtime/publications/positions 初始化、composition F10、不组合 F10、code/table decoration、跨节点选择、raw/snapshot/status 断言和 teardown。新增差异主要在中段打开“更多”并验证 stale action；两端仍有几十行相同逻辑形状。例如两处均有：

```ts
const before = runtime.status;
const positions: Record<string, number> = {};
view.state.doc.descendants((node, pos) => {
  if (!(node.type.name in positions)) positions[node.type.name] = pos;
});
```

影响：fixture、节点定位或公共上下文工具行为变化时，要同时维护两份相同流程，容易只更新其中一份，且同名用例难以从失败输出分辨责任。

建议：提取有限的同域 setup/公共断言，或让新增菜单测试聚焦新增行为并复用已有验证；保留两份测试各自的有效断言与覆盖，不能直接删除测试来消除重复。不建议建立通用测试框架。这是可维护性判断，不是仓库明文禁令；无需为其扩大本轮验证。

## 其余 baseline 筛查

| baseline | 判断 |
| --- | --- |
| Mysterious Name | open/close/valid/binding 在局部菜单闭包有明确用途；未上报。 |
| Feature Envy | NodeView 查询 EditorView/DOM 是其职责，未见应迁移到 PM 第三方对象的方法。 |
| Data Clumps | 未见新增成组字段跨多个接口反复传递。 |
| Primitive Obsession | 命令已有 TableCommandType；DOM role/key/CSS 像素值不据此要求领域包装。 |
| Repeated Switches | 单处键盘分支和命令布局判定不足以构成重复条件分派。 |
| Shotgun Surgery | CSS、NodeView 与对应测试属于同一有限菜单变化，未见无关散布。 |
| Divergent Change | NodeView 内菜单生命周期与工具创建相关，不仅因函数变长就判为无关职责。 |
| Speculative Generality | 未新增无现实调用的框架、选项或抽象。 |
| Message Chains | 新增 ownerDocument/defaultView 与祖先几何遍历有 DOM 场景依据；不将长度本身判为 smell。 |
| Middle Man | invalidate 包装关闭逻辑用作具名事件回调，不值得独立上报。 |
| Refused Bequest | 未新增违反父类契约的继承层次。 |

## 实际验证、限制与交付

本人实跑：HEAD/基线解析、status、规定 log/diff、全仓规范查找及静态文件读取，均成功；`ls -ld .tools editor/node_modules` 返回不存在（退出1），符合未借用依赖状态。S1 已通过 Paseo 通知管理者。

未运行 make lint/test/build、88项回归、隐藏 WK 八组、Native/Release/CI、bench、App、浏览器、CUA/XCU、物理 IME、macOS14专项或安装。没有自建反例，因为本轮发现是静态重复代码；未触及冻结 oracle 或已有测试。作者与管理者证据只作为阅读材料，不是本人运行结果。

本报告不证明屏幕 paint、VoiceOver、Sandbox授权、物理输入和极端窗口布局通过，也不出具 Spec 轴结论。剩余事项为管理者整合各轴与最终门禁；本审查不修产品。仅报告和任务记录提交至 `task/INK-REV-139-rhythm-tools-standards`，实际 SHA/remote/clean 回执以交付消息为准。保留工作树，等待管理者完成报告/commit两层备份后回收。
