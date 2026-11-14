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

## 追加：固定4cad6f1限定复验

只追加本任务和原审查报告，首稿字节作为严格prefix保留。旧工作树产品仍固定bdbd；从git对象冻结新受检 `4cad6f10ec8520afd25f3139c046764ea82b89cb` 的editor/src与vite.config.ts，共120文件，逐文件核对无差异。冻结目录 `artifacts/INK-REV-205/append-4cad/fixed/`；依赖链接只借共享根，结束解除本人链接。

实际命令：

- `./editor/node_modules/.bin/vitest run --config artifacts/INK-REV-205/append-4cad/red.config.ts -t 'keeps both inserted blank paragraphs editable'`：同一第4测试断言不改，仅改import，build14与bdbd各1失败（6项按过滤跳过）；均输入X时“选区边界无法唯一映射到原文”，真实继承缺口RED。
- `./editor/node_modules/.bin/vitest run --config artifacts/INK-REV-205/append-4cad/probe.config.ts`：最终4文件192/192通过，退出0。契约4+旧矩阵172+其他位置与旧标量语法affinity14+源码边界2。新增闭合语法对照覆盖strong、inline code、link在正文末端/语法之后两种合法位置输入空格及X、UndoRedo/save；没有读取private或直接测试planner。

夹具过程如实保留：初轮额外heading-spaces runtime套件因冻结目录无生成的RENDERER_NOTICES资源而未加载（其余186项通过）；本轮限定公开会话，将该未运行套件移出限定配置，未改有效产品测试。另一初轮把关闭语法之后raw位置与left affinity错误组合，3例在准备选区时失败，已改为可证明的正文末端left/语法之后right，对照随后通过。保留green-resource-failure.log与affinity-fixture-failure.log。Vite configLoader提示仍保留。

证据摘要（SHA256）：

- red.log：`e9009bea3cb597c355f387fc6ae3e0dc4ca4860c4fa59dfa71af41d9a6757089`
- green.log：`badf3e963ed96fb31fd77b8250aec49ec8fec39562b26c41f01d6ba5a23ae3c9`
- publication.test.ts：`eaf7d59ccc55c34c6d1bbbb178e2e5b173f6cf533417b7eb7e881031065fb2dc`
- matrix.test.ts：`6c1062ab00ab89e31e9a29eb214f25b2885cd67d1e7b3cfe2178f385a672c21a`

全部原始源码、测试、配置、日志与prefix快照保留 `artifacts/INK-REV-205/append-4cad/`，evidence.json记录hash；两层备份前不清理。仅移除本人editor/node_modules与冻结新源码的node_modules链接。未改产品/PR/Issue/安装App，未跑全量/Native/构建/GUI；不引用管理者1077/34作为本人验收。新增finding0仅适用于限定补正；交付与物理风险边界保持。最终追加commit和remote核验在交付消息报告。
