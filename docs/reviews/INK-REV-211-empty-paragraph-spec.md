# INK-REV-211 文末空段落 Spec 独立复审

审查对象固定为 `9fa528cd534e2a8c8319d4eb3091e5013f62cd54`，基线及 merge-base 为 `ffacfbff386377b317348b572ff3073521a0e67e`。唯一提交：`9fa528c fix(editor): bind empty paragraph edits to source gaps`。初始 HEAD、clean、merge-base 与非空 diff 均已核对。命令：`git diff ffacfbff386377b317348b572ff3073521a0e67e...9fa528cd534e2a8c8319d4eb3091e5013f62cd54`。

## Spec 核心结论（少于400词）

**P1 / missing or partial：含空格的既有末尾空白行仍使已承诺的 EOF 空段落旅程阻断保存。** [INK-FIX-209:23](../tasks/INK-FIX-209.md#同类边界检查与范围收敛) 承诺“模块范围收敛为文末paragraph的创建与删除”；[V1:7、18](../design/source-authority-production-v1.md) 要求保留 BOM/CRLF/未编辑格式，且“普通已声明写作操作不得最终以‘安全拒绝’代替实现”。`editor/src/empty-paragraph-edit.ts:60,66` 仅容许后缀为 CR/LF，遇到既有空白行里的 space 即退出新计划，回落至原有结构端点映射失败。

本人 synthetic 公开 runtime 反例：加载 `正文\n   \n`，将完整 TextSelection 移至末尾，执行 Enter×3、Backspace×1；得到 `事务 PM 6/from 映射失败：PM 6 没有可审计文本锚点`，`unresolved=true`、`saveEligible=false`。空白文档 `\uFEFF\r\n   \r\n` 同旅程得到 PM4/from。相同探针在固定基线均为 RED，故这是本轮已承诺范围的遗留缺口，**不是新引入回归**。应以局部字节和完整位置/选区依据支持该后缀，不能 trim 原空格或仅以 AST 相等放行。

**scope creep：未发现可证实项。implemented wrong：未发现额外独立项。** 正确空段落创建/删除、完整 Selection 拒绝、后续编辑及保存资格的有界对照通过；不能由此宣告全部 EOF 输入通过。最严重项为上述 P1，Spec 合计1项。

## 依据和覆盖范围

采用 `docs/tasks/INK-FIX-209.md:3,7,13,20-25`、`GLOSSARY.md:7,10-18`、`docs/adr/0004-source-authoritative-editing.md:6,10`、`docs/design/source-authority-production-v1.md:7,13-18,24,31-36`。重点核对共享 operation、owner 语法末尾、绑定目标 doc/Selection、旧空段落 anchor 的退休条件和 accept 回滚路径。没有发现可另列的新原子性/选区放宽问题；该结论受以下有界运行覆盖限制。

不把任意中部、表格、代码块或保护原子纳入本轮修复范围。矩阵还暴露尾 reference definition、尾 protected comment 和 tab 词法既有问题；前两者不扩成本次 scope，tab 已在初始化位置失败。它们都在基线存在，仅披露，不伪报新增。

## 本人运行证据

全部使用合成字符串与 jsdom 的公开 `createEditorRuntime`，通过真实键盘 dispatch 和 view transaction；不等同物理 IME、WK、Native 或 App/UI。仅执行有界定向测试，无全量测试、构建、安装或用户文档访问。

准备：工作树自建 `.tools/node_modules`、`editor/node_modules` 软链到主仓库对应依赖，执行 `node editor/scripts/prepare-renderers.mjs` 生成 ignored renderer 资源，无新增依赖。基线源码由 `git archive <baseline> editor` 读入本工作树 ignored artifacts，依赖为另一个本人创建的软链，未修改基线或产品文件。

| 命令（pnpm 前缀为 `.tools/node_modules/.bin/pnpm --dir editor exec`） | 结果 | 日志 |
| --- | --- | --- |
| `vitest run src/list-empty-backspace-runtime.test.ts artifacts/INK-REV-211/reopen.test.ts` | 21/21 PASS（原作者15项，本人6项）；包含 snapshot 后新 runtime 重开及后续写入对照 | `artifacts/INK-REV-211/reopen.log` |
| `vitest run artifacts/INK-REV-211/probe.test.ts` | HEAD 10 PASS / 4 FAIL；同14项基线0 PASS / 14 FAIL | `probe.log` / `baseline-probe.log` |
| `vitest run artifacts/INK-REV-211/extended.test.ts` | HEAD 10 PASS / 3 FAIL；覆盖 Setext/ATX、CRLF列表、图片/格式等；失败含已披露边界 | `extended.log` |
| `vitest run artifacts/INK-REV-211/whitespace.test.ts` | HEAD 2/2 RED；同2项基线2/2 RED，精确复现 P1 | `whitespace-head.log` / `whitespace-base.log` |

基线测试命令使用 `--dir artifacts/INK-REV-211/baseline/editor`，其余参数相同。探针原始副本在 `artifacts/INK-REV-211/*.test.ts`；运行时路径为 `editor/artifacts/INK-REV-211`，已保留路径和日志以便复跑。最初一次从 editor 外指定测试未匹配、一次缺 renderer 资源导致导入失败，均留在初始日志/执行记录；没有将其计入通过测试。

作者/root1095及 Native 结果是外部证据，本人未复跑或据此声称 Native/Save As/prepareForClose 通过。公开 runtime 重开对照仅证明内存文本快照可被新会话接收，不能代替 NSDocument 实际保存关闭重开验收。

## 交付边界

只新增本报告和 `docs/tasks/INK-REV-211.md`，不修改产品、有效测试或他人报告。P1待实现者修复并提供新固定 SHA 后另行追加复验；不覆盖本次9fa首稿结论。本分支 `task/INK-REV-211-empty-paragraph-spec`，提交由任务回报记录。未创建PR、合并、打tag、发布或安装。
