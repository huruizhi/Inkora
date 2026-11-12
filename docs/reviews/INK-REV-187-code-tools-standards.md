# INK-REV-187 代码工具 Standards 审查

审查固定产品 `9d9dca5b1458596aa984c07dc17c0e7e0a18b311`，基点 `1d07702e1144011803b846df1b6ac2f873ad65fc`。命令：`git diff 1d07702e1144011803b846df1b6ac2f873ad65fc...9d9dca5b1458596aa984c07dc17c0e7e0a18b311`；唯一产品提交 `9d9dca5 feat(code): add offline language completion and line numbers`。独立 clean worktree 开始，只审不修。

## 核心报告（Standards）

**书面规范违反：1 项，P1，阻断本轮通过。**

- **查询框组合输入未进入 Native 命令资格，切源码销毁候选。** 新增 `editor/src/code-language-picker.ts:93-94` 以 `composing = true; event.stopPropagation()` 将组合态留在局部；`destroy():117` 随模式切换清理整个节点，未与宿主命令忙碌态联动。既有 `main.ts:308-325` 的 `availableEditorCommands` 不认识新查询框。违反 [AGENTS.md:8](../../AGENTS.md)“不得破坏中文输入法 composition”及 [bridge-protocol.md:69](../bridge-protocol.md)“所有扩展动作在Web执行时重新检查composition……及相关文本控件焦点”。真实 main / JSON Bridge / 公共 DOM 反例：查询框 focus → compositionstart → queryState 仍含 sourceMode → executeCommand(sourceMode) 成功 stateChanged，原输入节点 `isConnected=false`。原文和 revision 保持稳定不抵消查询候选丢失。应把辅助输入组合态纳入宿主资格，保持它与正文 source-authoritative 会话分离，动作执行前重验；补正式入口回归。

**判断性发现：0 项。** 12 项固定 smell 均作判断性检查，未见足够证据形成可行动的独立发现；不把规范守卫、NodeView 生命周期边界和当前小型显示偏好层误报为重复、过度抽象或 Middle Man。未将工具可强制检查项转成发现。

## 依据与验证边界

已读 `AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/bridge-protocol.md`、`docs/testing.md`、`docs/code-block-experience.md`。`rg --files` 搜索无额外 `CODING_STANDARDS.md` / `CONTRIBUTING.md` / 嵌套 AGENTS。正式 spec 仅用于理解背景，不作为本轴发现依据；其显式扩大语言库的约定优先于旧体验文档的 13 项枚举。

静态核对：语言修改仍经既有 source-authoritative 事务；行号在 contentDOM 外，显示偏好不写正文/history/revision。NodeView 销毁取消订阅、移除列表和全局监听；高亮仍经 inert template、span/class 白名单及逐字核对，未把 highlighter HTML 注入编辑 DOM。隐藏许可仍为空文本，打开才填充。

基线 `code-highlighting.test.ts:106-137` 的 13 个语言样例、非空 spans、位置及类名断言均保留；扩库后改为固定样例遍历，没有删除这些有效断言。新增代表语法为 Java、C++、VB.NET、VHDL、Kotlin。193 仅为注册表项目数（含 plaintext），不表示逐语法验收。

复用现有锁定依赖，自建 `editor/node_modules` 软链后先运行 `node editor/scripts/prepare-renderers.mjs`。有界命令（均在 editor 下）：

- `./node_modules/.bin/vitest run src/code-highlighting.test.ts src/code-block-view.test.ts src/code-tools-runtime.test.ts`：3 文件、37 测试通过；覆盖现有隐藏许可检查。
- `./node_modules/.bin/vitest run artifacts/INK-REV-187/main-composition.probe.test.ts`：1 文件、1 测试失败，故意断言组合期间输入节点保持连接；输出显示正式 sourceMode 成功而节点脱离，作为缺陷证据，不记成通过。

忽略证据保留在 `editor/artifacts/INK-REV-187/`：`targeted.log`、`main-composition.probe.test.ts`、`probe.log`。未做全量、构建、GUI、App、真实隐藏 WK、物理 IME、VoiceOver、依赖安装、网络或 Keychain 验收。产品问题留待根任务修复；本报告不宣称修复。
