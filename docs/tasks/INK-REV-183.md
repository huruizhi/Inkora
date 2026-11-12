# INK-REV-183 表格 Standards 审查任务

任务：按 Matt code-review skill，独立审查固定产品的书面规范与12项 Fowler baseline，仅交付审查文档，不修改产品，不混合 Spec 轴。

## 隔离与冻结

- worktree：`.worktrees/INK-REV-183`。
- 分支：`task/INK-REV-183-table-standards`。
- 初始 clean HEAD：`efa551708d824a2c98a808d18faf94ce05ffebd4`。
- base：`16d0a6282f60b1357780aa7b964746be7e62b9bd`。
- 固定命令：`git diff 16d0a6282f60b1357780aa7b964746be7e62b9bd...efa551708d824a2c98a808d18faf94ce05ffebd4`。
- 固定提交列表：`2f6cccf feat(tables): add sized insertion and structural movement`；`efa5517 feat(tables): add reorder handles and size selection dialogs`。

## 完成与修改文件

完成14个变更文件的静态检查、标准来源搜索、12项 baseline 判读、有界已有测试与独立 composition 事件 probe。S1 发现后即时上报管理者；产品修复与补正复验由管理者另行安排。

仅新增：

- `docs/reviews/INK-REV-183-table-standards.md`：硬项1、判断项1，核心少于400词。
- `docs/tasks/INK-REV-183.md`：任务和证据记录。

## 实际执行的验证

复用主 worktree 锁定依赖前，以 `cmp editor/pnpm-lock.yaml ../../editor/pnpm-lock.yaml` 确认锁文件相同（退出0）；仅自建 `editor/node_modules` symlink，结束时 unlink，不修改共享依赖、不安装依赖。pnpm 使用 `/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` 的已存在版本。

在本 worktree 执行（下列 `pnpm` 为上述绝对路径）：

```sh
pnpm --dir editor exec vitest run src/table-parity-runtime.test.ts src/tables-tasks-runtime.test.ts src/main.test.ts
pnpm --dir editor exec node scripts/prepare-renderers.mjs
pnpm --dir editor exec vitest run --root .. --config editor/vite.config.ts artifacts/INK-REV-183/composition-probe.test.ts
pnpm --dir editor exec vitest run src/table-parity-runtime.test.ts src/tables-tasks-runtime.test.ts src/main.test.ts
```

结果：首次命令因缺少离线 notices 失败；预处理退出0；自有 probe 1/1通过，确认缺陷状态；准备后的已有测试3文件172/172通过。没有改动或绕过已有测试。未执行全量 Make 测试、lint、构建；这些结果不由本审查背书。

证据（ignored，保留待双备份）：

- `artifacts/INK-REV-183/targeted-tests.log`：首次缺 notices 的失败。
- `artifacts/INK-REV-183/prepare-renderers.log`：离线生成产物准备。
- `artifacts/INK-REV-183/composition-probe.test.ts`、`composition-probe.log`：正式 runtime 打开规模，输入框派发 compositionstart，断言对话框被删除且焦点回 `#editor`；合成 DOM 事件不等价于物理中文输入法。
- `artifacts/INK-REV-183/targeted-tests-prepared.log`：已有测试172通过。

没有使用外部测试证据，也没有把实施者的验收口径转录为独立通过。预处理生成的 ignored renderer 资源与上述证据均保留；不清理其他 worktree 或全局目录。

## 未完成事项与风险

S1 未修复；J1 为可选维护改进。App、UI、WK、物理输入法与屏幕 paint 未验，不能据此宣称发布验收通过。此分支仅审查文档，无产品行为变化，不创建PR、不合并、不触发CI。commit 及实际远端核验值由提交后的交接消息报告（避免文档自引用提交哈希）。


## 限定补正复验追加（8bb27ad）

冻结补正：`8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`；仅审新增 diff `efa551708d824a2c98a808d18faf94ce05ffebd4...8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`，不重跑全量或 Spec 轴探针，不改原报告正文。

执行前 clean；用 `git show <fix>:<path>` 临时导出新增 diff 的 editor 文件（路径清单保存在证据目录），复验后恢复原 HEAD 文件并移除仅由本次导出的 `table-commands.ts`。自建 `editor/node_modules` symlink 结束 unlink。没有导出或执行 Native/WK测试，也没有修改共享依赖。

实际命令（pnpm 仍为前述已存在的绝对路径）：

```sh
pnpm --dir editor exec vitest run --root .. --config editor/vite.config.ts artifacts/INK-REV-183/composition-probe.test.ts
pnpm --dir editor exec vitest run --root .. --config editor/vite.config.ts artifacts/INK-REV-183/composition-fix-probe.test.ts
pnpm --dir editor exec vitest run src/table-parity-runtime.test.ts -t 'dialog|grid|composition'
```

结果：原 probe 逐字未改，1失败，失败点是其旧缺陷断言 `expect(dialog).toBeNull()`，而补正产品实际保留 dialog；不把该缺陷形态探针当作验收失败。正向独立 probe 1/1通过，覆盖连接、焦点、值、raw/status以及组合期apply/cancel/Esc与observer的保护；compositionend后正常退出。已有控件定向4通过、17因名称过滤未执行。无全量、lint、构建、GUI、App、UI、WK、物理输入法结果。

新增 ignored 证据（原件全部保留待双备份）：`fix-increment.patch`、`fix-export-paths.txt`、`composition-original-on-fix.log`、`composition-fix-probe.test.ts`、`composition-fix-probe.log`、`fix-targeted-controls.log`，均位于 `artifacts/INK-REV-183/`。本次结果完全独立执行，未借用外部通过证据。

结论：S1在合成DOM事件边界闭合；J1策略重复已消除，原文独立证明仍保留。新增diff未发现新的Standards硬项或判断项。Spec source边界只做静态标准检查，未重复Spec探针，不替代其裁定。原“未修复”状态为首轮历史记录，以本追加闭合口径为准；物理输入法等未验风险仍然存在。分支保持 `task/INK-REV-183-table-standards`，提交与真实远端校验值在交接消息给出。


## CI 集成补正限定审查追加（INK-FIX-185）

范围独立于原表格审查和8bb27ad复验；原文、原结论均保留。冻结比较为 `git diff ad4f22f40ae434d325fcec8a53f60a98bf502eba...bbd80f7e07e07eef71e1de239c214531cda964ba`，包含产品EVC的7行变化、现有写作专项新增用例及runner计数、任务说明和11份日志JSON，总计15文件。没有导出或修改产品文件，没有创建依赖链接。

独立执行：固定diff静态核读；核对原文/Bridge调用未改、守卫的false/true/未知分支、观察NSWindow完整转发、原有测试断言未删、反向DOM选区按Range字符计数；原12项baseline未形成具体新增smell。通过Python `hashlib.sha256(record['output'].encode()).hexdigest() == record['sha256']` 核对固定commit中的11份证据JSON，全部一致。命令 `git diff --check` 只检查本文档增量，不作为产品验证。

新增ignored证据位于 `artifacts/INK-REV-183/fix185-increment.patch`、`fix185-static-evidence.json`，均保留待双备份。实施者22/22和各诊断循环来自提交内证据，不是本审查重跑；首次DOM夹具坐标错误明确排除为产品finding。没有另跑Native/typecheck、WK、全量、App、UI或物理IME。未验本身不列新增硬项；最终CI仍由管理者整合后验证。

结果：该独立增量Standards硬项0、判断项0；不新增产品修复事项，不改旧S1/J1及其闭合结论。仅追加原两份docs文件；分支仍为 `task/INK-REV-183-table-standards`，提交/push和真实remote=HEAD、clean核验在交接消息回报。worktree及所有原始证据保持保留。
