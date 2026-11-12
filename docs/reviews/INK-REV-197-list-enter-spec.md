# INK-REV-197：列表回车 Spec 独立审查

受审 HEAD `b2a321a411f227f207c99449e8b2df06a3f20a17`；base `928929faf0a1da764415c38e241999f9287f1f83`。固定命令 `git diff 928929faf0a1da764415c38e241999f9287f1f83...b2a321a411f227f207c99449e8b2df06a3f20a17`；仅一提交 `b2a321a fix(editor): continue empty lists before consecutive Enter exits`。独立 Spec 轴，只审不修。

## 核心发现

**(a) P2 / partial：非末尾空项的第二次 Enter 无法退出。** 规格 `docs/tasks/INK-FIX-194.md:8`：“普通无序/有序列表……首次Enter续项；当前项为空且紧接着又Enter则退出”，未限定末项。公共 runtime 载入 `- \n- b`，光标在第一空项：第一次 Enter 得 `- \n- \n- b`；第二次原文不变，`unresolved=true`、`saveEligible=false`，诊断“该原生事务尚未支持（replaceAround）”。`editor/src/block-editing.ts:103–112` 新增续项后仍交给旧 split/lift，而 `source-transaction.ts:677–699` 的候选未闭合中间空段及后续列表，造成动作无响应并阻止保存。需有界支持第二次退出及后续项目保留，不应放宽未知事务拒绝。

**(b) scope creep：未发现独立的额外功能扩张。**

**(c) P2 / implemented wrong：非空选区被新入口提前排除，改变原回车拆项语义。** `AGENTS.md:8` 要求“不得破坏……选区”；本任务规格第10行仅要求选区动作中断连续状态。`editor/src/block-editing.ts:86` 的 `!empty` 在任务/无view回退（第90行）之前返回 false。公开 `blockKeyBindings.Enter` 在 `- abc` 选中 b：冻结 base 产生两个 list_item（a、c），HEAD 回落通用拆段，成为一个 list_item 内两个 paragraph；任务列表同样变化。应保留原拆项命令，只清除连续状态。此项证据为命令语义对照，不声称新引入 runtime 拒绝。

共2项 P2；最严重后果为第二次回车拒绝后失去保存资格。

## 本人验证与边界

- 创建独立 worktree 时 HEAD 正确、状态 clean，merge-base 等于固定 base，diff 非空、提交列表准确。未读取动态 INK-FIX-194 / INK-REL-195 的产品内容。
- `node editor/scripts/prepare-renderers.mjs`：退出0，准备既有 renderer 资源；未安装依赖。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-input-runtime.test.ts`：退出0，1文件90项通过。
- `.tools/node_modules/.bin/pnpm --dir editor exec vitest run artifacts/INK-REV-197/spec-probe-v2.test.ts`：退出1，5项中2通过、3失败。通过项为引用空项和有序空项连续 Enter；失败项分别是中间空项退出、普通/任务选区命令对照。选区基线模块仅由 `git show 928929f:editor/src/block-editing.ts` 导出，改相对 schema 导入以复用同一冻结 schema。
- ignored `editor/artifacts/INK-REV-197/` 保存探针、冻结基线模块；`artifacts/INK-REV-197/` 保存日志。首版探索含错误嵌套夹具（未找到空段，Position -1）及无基线 runtime 选区预期，均不计为新增缺陷；v2删除这些不充分断言。原输出保留供追溯。
- 作者文档153/1043项与根报告Native28均为外部证据，不算本人实跑。未运行全量、Native、GUI/App、物理IME、可见光标、VoiceOver或macOS14验收；不据未验项推断缺陷。
- 本次仅新增两份审查/任务文档；未改产品、有效测试、依赖或配置。自建依赖软链在结束时 unlink；无安装、发布、Keychain或网络产品改动。


## 限定后验：固定 2a1580e 关闭首稿两项 P2

本节仅复审产品 `2a1580eb0a0b7423e53093680b3ff507ac21f998` 相对原受审 `b2a321a411f227f207c99449e8b2df06a3f20a17` 的新增 hunk；前文首稿与原 P2 原样保留。源码、任务规格与既有回归由 `git archive 2a1580e editor docs/tasks/INK-FIX-194.md` 导出至本 worktree 的 ignored `artifacts/INK-REV-197/post2/`，未读取动态实现树。

**原(a) P2 关闭。** 第二次中间空项退出现在在 `block-editing.ts` 转入带 `inkoraListEnterExit` 标记的边界退格；`source-transaction.ts` 的 middleListExitPlan 只删除已证明的当前空标记。新增 list-gap-projection 以同次 canonical 列表所有项目精确相等、块外兄弟不变和唯一单调源空行 anchor 证明临时空段，除 parser 派生 tight 属性外不授予任意语义差异。原 `- \n- b` 两次 Enter 已保持可保存，并能在普通段继续操作。

**原(c) P2 关闭。** 新入口撤回 `!empty` 提前返回，只在 `isEmpty` 判断中要求选区为空；普通/任务非空选区重新进入原拆项命令。原冻结 base 对照两例均恢复两个 list_item（a、c）。此结论仍限定为命令语义，并未把原 runtime 选区拒绝推断成已新增或已修复问题。

**新增授权范围无已证 Spec 缺口。** 冻结任务文档“用户追加与独立审查补正”要求段落行首 Backspace 回上一列表行、标题起点 Enter 将标题下移。新增边界退格同时合并相邻同型列表，源补丁只覆盖账本证明的换行/引用前缀，完整同内容证明仅协调 tight/loose；标题起点计划要求完整目标文档与限定光标位置一致，给上方新空段独立源 anchor。独立检查 ATX、Setext、BOM/CRLF 和混入别处 X 的退出负控通过；未发现独立 scope creep。不据此扩大到任意嵌套/引用中间 gap 或未知多步事务。

### 本人后验命令与结果

在归档 editor 自建依赖软链后，`node artifacts/INK-REV-197/post2/editor/scripts/prepare-renderers.mjs` 退出0。以下命令均以根现有 pnpm 的绝对路径调用；没有安装依赖：

- `pnpm --dir artifacts/INK-REV-197/post2/editor exec vitest run src/list-input-runtime.test.ts src/heading-input-runtime.test.ts`：退出0，2文件 **111项通过**，日志 `artifacts/INK-REV-197/post2/targeted.log`。
- 同一 `--dir` 下 `vitest run artifacts/INK-REV-197/spec-probe-v2.test.ts`：退出0，原首稿 **5项全部通过**，日志 `original-probe.log`；包含首稿两个命令对照和中间空项退出。
- 同一 `--dir` 下 `vitest run artifacts/INK-REV-197/boundary-probe.test.ts`：退出0，**10项通过**。覆盖 LF 与 BOM/CRLF gap 精确原文、继续 Enter/正文/Backspace 及各动作 Undo/Redo；立即空 gap 和正文行首退格重回列表；ATX/Setext 标题起点精确字节、光标与 Undo/Redo、继续输入；LF/CRLF 两个混 X 退出原子拒绝负控。日志 `boundary-probe.log`。

10项探针最终版本与前8项版本均运行通过（日志记录最终10项）；引用/有序原控属于原5项，不重复累计为全量回归。历史操作后始终重新取得 runtime 当前 EditorView，避免使用已销毁旧 view。临时源码、冻结基线模块、日志及首稿字节副本保留在 ignored artifacts，待根任务备份；归档树自建软链已 unlink。

作者/根报告1056项、Native31均非本人实跑；本节未运行完整套件、Native、GUI/App、物理IME、绘制、VoiceOver或macOS14验收。只追加本报告与任务文档，无产品修复。结论为首稿两项 P2 在固定 2a1580e 上按上述独立证据关闭，新增范围无已证 finding，剩余平台验收边界不变。
