# INK-REV-200：标题退格 Standards 审查

## 固定范围

- 基线：`4e82ea0ac72f27ad5bf1b9ccf2145d87060cfd6b`。
- 受审 HEAD：`09af68a827f7eca1be9568c2abcaa43efe0b8dcb`。
- 唯一提交：`09af68a fix(editor): accept heading boundary backspace`。
- 固定命令：`git diff 4e82ea0ac72f27ad5bf1b9ccf2145d87060cfd6b...09af68a827f7eca1be9568c2abcaa43efe0b8dcb`。
- 独立工作树 `.worktrees/INK-REV-200` 初始 clean；HEAD 为受审提交，merge-base 等于基线，diff 非空（11文件）。本报告不审候选之后的修改。

## Standards 核心报告（少于400词）

未发现有充分证据的书面规范偏离（hard：0）；未提出值得整改的 Fowler 判断项（possible：0）。

依据为 [AGENTS.md](../../AGENTS.md)、[GLOSSARY.md](../../GLOSSARY.md)、[ADR-0004](../adr/0004-source-authoritative-editing.md)、[ADR-0003](../adr/0003-project-and-bridge.md)，以及 ADR-0004 指向的 [V1契约](../design/source-authority-production-v1.md)。独立检索未发现 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`。工具已强制的格式和类型事项不另列发现。

`editor/src/source-transaction.ts:667–732` 先证明完整目标 PM 文档，再在已定位标题 owner 内删除标记或接合相邻正文。删除插入空段时，以同次 ledger 唯一 insertion-anchor 及一至两次真实换行证明范围，没有凭 parse 忽略空行判定成功。它符合 GLOSSARY「位置依据」及 ADR-0004:6,10 的原文权威、可审计局部编辑规则。调用方仍经 `source-authority.ts` 现有原子接受/失败恢复路径，没有另建正文或保存点。

`editor/src/block-editing.ts:133–145,216` 保留组合输入守卫，先删除选区，再处理根标题起点；新增回归检查原文字节、选区与历史。有效旧测试未删改，Native 精确计数31→33对应新增两方法，未见 AGENTS「不得删除或绕过有效测试」违反。

`project.yml` 仍是工程定义来源；本 diff 无 Schema、Bridge、依赖、网络或权限扩大，符合 ADR-0003 的工程与离线边界。12项 Fowler baseline 均已考虑；有界解析辅助函数及 planner 职责明确，短小测试重复不足以提出抽象建议。未把个人风格偏好列为 hard。本轴不裁定原任务行为是否全部完成。

## 本人验证与边界

- `node editor/scripts/prepare-renderers.mjs`：退出0，仅在本人工作树准备既有离线资源。
- `editor/node_modules/.bin/vitest run src/heading-backspace-runtime.test.ts src/heading-input-runtime.test.ts`（工作目录 `editor`，实际相对命令为 `node_modules/.bin/vitest ...`）：退出0，2文件25/25通过；属于 synthetic DOM，不能冒充 WK 或搜狗实键证据。
- `git diff --check 4e82ea0ac72f27ad5bf1b9ccf2145d87060cfd6b...09af68a827f7eca1be9568c2abcaa43efe0b8dcb`：退出0。
- 本人只建立 `editor/node_modules` 软链复用既有依赖，结束时仅 unlink 该链接；未安装依赖，未修改受审产品或源工作树。
- 未重复运行全量 editor、Native、完整构建、GUI/App、安装、Keychain、物理IME、paint、VoiceOver 或 macOS14实机。作者1070项及Native33项结果是作者证据，不计为本人验证。
- 原始日志及固定范围记录保留于本工作树 ignored `artifacts/review-200/`，待管理者两层备份；本轮未创建临时测试夹具，未清理原始证据。

本次只新增审查报告与任务记录。审查范围内无待修 finding；上述未验范围仍是限制，本报告不能替代 Spec 或实际桌面验收。

## 限定后验：7eb1eb0（保留以上首稿）

本次固定增量为 `git diff 09af68a827f7eca1be9568c2abcaa43efe0b8dcb...7eb1eb0c4261f13ec25e8f02e81fe86a994c0b2d`；merge-base 等于09af，增量非空。以上首稿原字节保留，其25项本人实跑结果只属于09af，不追溯成为新候选验证。

### Standards 后验核心（少于400词）

新增 hunk 未发现有据的书面规范违反（hard：0），未提出新增 Fowler 判断项（possible：0）。规范仍为前述五份文件，工具已强制事项跳过。

`source-transaction.ts:694–698` 的 `provesBoundaryTarget` 在完整目标 doc 相等后，追加 `Selection.eq` 证明；doc 不匹配继续原有规划路径，doc 匹配但目标选区不匹配则抛错，避免已证明 sourceCaret 被用于另一选区。三个标题退格分支共用此函数，没有新增另一份原文、位置真值或旁路接受路径。它加强 GLOSSARY「位置依据」及 ADR-0004:6「原文、投影、位置与历史原子更新」的边界；异常继续由现有会话恢复并保留诊断。

新增三类 runtime 负控保留旧14项测试及断言，没有删改有效测试或引入依赖，符合 AGENTS 的测试保护要求。证据与任务追加清楚区分旧09af候选和补正候选，没有将旧候选包冒充修复后的包。

局部辅助函数统一三个已存在分支的证明职责，名称揭示用途；12类 Fowler baseline 未见值得整改的新增异味。此结论仅为限定 Standards 静态复核，不裁定 Spec 的P1是否关闭。

### 后验本人验证与边界

本轮只读取固定 diff、检查 refs/merge-base 和仓库状态，并执行报告、任务首稿字节前缀验证；没有运行测试、构建、App、GUI或安装。作者17项等测试结果不计为本人实跑，首稿25项也不计为7eb1eb0验证。

首稿副本、固定增量和前缀校验记录保留在 ignored `artifacts/review-200/`，不清理；原始产物与工作树继续保留待两层备份。本轮无新增产品修改、软链或临时测试。未验范围风险沿用首稿。
