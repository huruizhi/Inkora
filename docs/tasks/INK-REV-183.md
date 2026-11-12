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
