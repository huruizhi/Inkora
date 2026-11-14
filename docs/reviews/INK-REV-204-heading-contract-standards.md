# INK-REV-204：标题起点事务契约 Standards 审查

## 结论（核心报告）

书面硬偏离 **0**；Fowler possible judgement **0**。本报告只审 Standards，不裁定 INK-STAB-203 的 Spec 完成度。

- `AGENTS.md` 的“Markdown 文件保真优先”“不得破坏 composition、光标、选区、撤销重做”：`heading-start-edit.ts` 将键盘与 Native 识别共用 `operation`，保留 composing 守卫；删除标题前空段仍要求唯一原文空行依据，格式移除及文本合并仍核验解析后的目标文档。未发现无据 trim、整篇序列化或有效测试删除。
- `GLOSSARY.md` 的“当前原文”“位置依据”及 `docs/adr/0004-source-authoritative-editing.md` 的“已接受编辑原子更新原文、投影、位置与历史”：新 `plan` 闭包绑定实际事务的文档身份与目标选区；`source-authority.ts` 在应用目标后解析 placement，沿既有 accept 路径提交，异常沿原有拒绝路径保留意图。新增测试经公开会话覆盖拒绝后的继续输入、BOM/CRLF、方向选区、保存资格与 Undo/Redo。
- `docs/adr/0003-project-and-bridge.md` 的本地资源/单一 Bridge 与 `docs/testing.md` 的测试隔离要求：未增加运行期网络、Bridge 字段或依赖；聚焦测试仅使用内存会话。build15 只是候选标识，本人未安装或启动 App。

已逐项检查十二项 Fowler baseline；未找到值得列为 finding 的新增 smell。共享构造已聚拢原先分散的规则；`Context`、`Operation`、placement 联合类型承载实际领域约束；保留 re-export 是已有调用者兼容边界，不据此判为 Middle Man。以上属于设计判断，不能升级为硬规则。工具已强制的类型/格式项不列 finding。

## 固定范围与来源

- base：`6b392fc6a2a50a3335b3c548390ee1c8774c1c29`；受审 HEAD：`bdbd5827b29fb92a214fc3bdfce0b5cb32f5f967`。
- 固定命令：`git diff 6b392fc6a2a50a3335b3c548390ee1c8774c1c29...bdbd5827b29fb92a214fc3bdfce0b5cb32f5f967`。
- commits：`cdd2d12 refactor(editor): centralize heading-start edit contract`、`bdbd582 style(editor): remove trailing blank line`。
- 独立 worktree 初始 clean，base 可解析，merge-base 等于 base，diff 非空（18 files）。完整阅读 AGENTS、GLOSSARY、ADR-0003/0004、testing、editor-session、source-authority-production-v1；搜索未发现 `CODING_STANDARDS` 或 `CONTRIBUTING` 文件。来源任务为 `docs/tasks/INK-STAB-203.md`，本轴不以其验收条款裁定 Spec。
- baseline：Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest；仓库标准优先，smell 始终是 judgement。

## 本人验证与边界

- `git diff --check <base>...<受审HEAD>`：exit 0。
- `/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/heading-edit-contract.test.ts`：exit 0，1 file / 3 tests passed。日志：本 worktree `artifacts/rev-204/heading-contract.log`（忽略产物，保留待双层备份）。
- 仅创建并 unlink 本人的 `editor/node_modules` 链接，借用根依赖；未安装依赖。未跑 make lint、build、全量1076、Native33、GUI、WK、物理输入法或最低系统验收；作者结果不作本人通过记录。
- 无产品修复、PR、merge、Issue 或对外消息；不操作 App、Keychain、安装及用户文档。无 finding 不等于完整行为/性能/发布证明。worktree 与日志保留，未完成事项为本轮范围外的实际系统验收。

## 追加限定复核：4cad6f（保留首稿）

本节独立结论：书面硬偏离 **0**；Fowler possible judgement **0**。沿用首稿全部标准来源与十二项 baseline，仅审 Standards，不据此裁定 Spec。原 bdbd 的结论不能解释为“继承拒绝已正确”；本次检查纳入了新增空段输入的补正。

固定新受检 `4cad6f10ec8520afd25f3139c046764ea82b89cb`；新增 hunk 命令：`git diff 27b5180ad6ba4ba40ac05b0d1e8f21699b0009f3...4cad6f10ec8520afd25f3139c046764ea82b89cb`。基线可解析、merge-base等于27b518、7文件非空diff、diff --check通过；原报告分支在追加前clean。读取新增全部产品/测试hunk及任务203末节，作者红绿证据仅作背景，未冒称本人运行。

- 对照 GLOSSARY 的“位置依据”、ADR-0004 的有据接受和 editor-session 的原文/选区/历史边界：`NativePlacement.sourceBoundary` 现在明确表示该编辑拥有的新插入点；generic `accept` 只撤销该 visual 点上不同 raw 的既有别名，再发布该点。其他 visual 点与旧标量 `sourceBoundary` 分支保持既有规则，没有全局清 anchor 或合并所有语法 affinity。placement 仍由固定 doc身份/完整Selection 的解析器产出。标题知识留在 heading-start-edit；accept 仅消费通用插入点，不扫描标题或引入行偏移。
- accept 的边界/语义验证、snapshot restore 和 `unresolvedIntent = { description, raw: attemptedRaw }` 路径保留；本次未见将失败候选静默丢弃或绕过已有守卫的证据。
- 新第4项测试只经公开 SourceAuthoritySession、PM选区事务、键盘命令、Undo/Redo/save入口，未读private或断言planner次数。测试冻结 BOM/CRLF、marks/关闭hash与两个空段的X/Y原文预期。Native增加一个方法及执行项数33→34，未删除原测试。按 AGENTS 与 testing 的证据边界，本人模型通过不代表 Native/WK/物理输入已验。
- 十二项 smell 复核未形成新 finding。追加 NativePlacement 参数仍是既有 accept 的内部原子提交职责；本次不将继承的长参数表当作新增硬偏离，也不以标准轴替代需求完成度判断。

本人一次有界验证：将新固定提交的 editor 归档至 `artifacts/rev-204/4cad/editor`，逐文件 Git blob 核对全部157份文件；以根固定 pnpm 执行 `--dir artifacts/rev-204/4cad/editor exec vitest run src/heading-edit-contract.test.ts`，exit0，1 file / **4 tests passed**。日志 `artifacts/rev-204/4cad-heading-contract.log`，字节核验摘要 `artifacts/rev-204/4cad-source-check.json`。仅创建并 unlink 本人的归档依赖链接，源码归档/日志/worktree继续保留待双层备份。未跑1077全量、Native、lint、build或GUI，root结果均不转记本人通过；未修产品、安装App或操作用户文档。
