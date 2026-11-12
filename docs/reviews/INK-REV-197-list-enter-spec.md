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
