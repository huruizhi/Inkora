# INK-REV-205：标题契约独立 Spec 审查

受审 base：`6b392fc6a2a50a3335b3c548390ee1c8774c1c29`。
受审 HEAD：`bdbd5827b29fb92a214fc3bdfce0b5cb32f5f967`。
分支：`task/INK-REV-205-heading-contract-spec`。
工作树：`/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REV-205`。

完成：固定三点 diff、契约/ADR/GLOSSARY/当前系统门槛核对；删除旧规则和会话绑定审查；独立公开会话差分与边界 probe；新增独立审查报告。产品文件零修改。

修改文件：本任务与 `docs/reviews/INK-REV-205-heading-contract-spec.md`。

实际命令与结果（工作树根执行）：

- `git status --short` 初始 clean；`git merge-base 6b392fc6a2a50a3335b3c548390ee1c8774c1c29 HEAD` 等于 base；固定 diff 非空（18文件）。
- `./editor/node_modules/.bin/vitest run --config artifacts/INK-REV-205/probe.config.ts`：172/172通过，退出0。17源文×10模式比较完整公开状态；不适用的分支不执行；另明确断言保护删除和同字节重开后的旧事务拒绝，以及 composing 命令回退差分。未使用private getter或内部planner。
- `./editor/node_modules/.bin/vitest run --config editor/vite.config.ts editor/src/heading-edit-contract.test.ts`：3/3通过，退出0。
- 冻结baseline 116份editor/src文件与`git show base:path`逐字节比对，无不一致；借用作者baseline只读，未修改。

原始证据保留本工作树 `artifacts/INK-REV-205/`，待两层备份；不删除冻结源码或原始log。`evidence.json`记录全部SHA256；关键摘要：

- probe.test.ts：`172119506d0c59b41f91f96b43a47a0987abc60e4ad132f5faff9ffb0dd2ed4a`
- probe-final.log：`15abc375c8a296d2fa2e83efc5991cc840aa02a0aa49c2d4278fff19f7b7fb3b`
- contract.log：`d42776c7aa04469a4757c307105b4e7f3380288c79e753ba73af9012422b1180`

探针开发失败亦保留：首次config模块路径不可解析；两次非法PM join在派发前抛错；错误假定整条composing命令链不派发；补完view stub后比较两版相同。均为审查夹具问题，不列为产品finding，未改任何既有测试。最终保留Vite configLoader既有配置提示。

未完成/限制：本任务按分工未重复全量、Native、构建、精确HEAD CI及物理验收；主任务最终证据由管理者结算。无物理输入/paint/关闭旅程证明，不允许以本审查替代安装门槛。差分只证明所探查可观察状态无新增变化，不证明整个编辑器稳定。仅解除本人创建的editor/node_modules链接。

最终commit与远端核验在任务交付消息报告。
