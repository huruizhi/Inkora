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

## 固定修复点限定复验（2026-11-12）

修复点固定为 `e8e976084170e32f2b7fd7b3d68828f4f80597ed`，其父提交为原审查产品 `9d9dca5`。本节仅复验上述 P1，不重跑全量、不覆盖原始裁定。当前结论：**该项 P1 在此修复点关闭；Standards 未关闭发现 0 项。**

将 `git diff 9d9dca5...e8e9760` 保存为忽略证据 `editor/artifacts/INK-REV-187/fix-e8e9760.patch`，临时应用这 8 个文件的完整固定增量；复验期间以 `git diff --exit-code e8e9760 -- <8个固定文件>` 核对内容完全一致。先准备 renderer 资源，只运行以下两个公共 main/Bridge 反例：

`./node_modules/.bin/vitest run artifacts/INK-REV-187/main-composition.probe.test.ts artifacts/INK-REV-187/main-composition-fixed-positive.test.ts`

结果：**2 文件、2 测试通过**，日志 `fix-e8e9760.log`。原 probe 的断言是“组合期间输入仍连接”，从原产品红转为修复点绿；本次附加正向证明检查正式命令实际返回 `editorError/command_rejected`，不能把反例断言逆转单独等同于充分证明。

独立正向证明包括：compositionstart 活跃期间与 compositionend 后立即执行 sourceMode 均拒绝；结束后 70ms 发尾 input，再等 60ms（距 end 已 130ms）仍拒绝，确认稳定计时确由尾 input 重置；再等 70ms 后重新获得 sourceMode 能力，命令成功。上述拒绝期间输入节点连接、焦点和值保持；稳定后 createSnapshot 返回逐字原文且 revision 为 0、dirty 为 false，随后切源码也不增加 revision。

静态增量核对：查询 owner 的 composition/focus 分别进入 runtime 独立 Set，未写入 `SourceAuthoritySession`；runtime 忙碌 getter 供 main 命令资格和执行守卫使用。普通查询焦点另用于阻断正文 Undo。100ms 稳定窗口、尾 input 重置、销毁清计时器及释放 owner 的实现可见于固定增量；候选 lease/连接修复仅作静态核对，其功能裁定归 Spec 轴。未发现新增可行动 Standards 问题。

根任务另报告 `make lint` / `test-editor` / `test-ci` 合计 1015 测试通过、Native Code 3 测试通过（含 controller 的 sourceMode 拒绝与保存/重开）；这是根任务提供的验证，**不是本审查者自跑结果**。本审查没有扩展到该验证范围或物理 IME。复验后已恢复全部 8 个临时产品文件至本审查 HEAD，移除本人依赖软链；原红证据、新正向证明、补丁与日志均保留，提交仍仅涉及两份审查文档。
