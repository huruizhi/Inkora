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


## 追加：固定03715e9的限定修复复验

本节仅追加，不修改上文9fa首稿及P1原始结论。受检产品固定为 `03715e9cad05ed90a0f541b45826915676bf4135`，父提交已核实为 `9fa528cd534e2a8c8319d4eb3091e5013f62cd54`，提交为 `fix(editor): retain original whitespace after EOF edits`。审阅差分：`git diff 9fa528cd534e2a8c8319d4eb3091e5013f62cd54..03715e9cad05ed90a0f541b45826915676bf4135`。本分支产品仍停留9fa，未checkout或审查实现者浮动工作树。

**复验结论：原P1在上述两个反例及本次有界保真矩阵内关闭；未发现新的范围内 Spec finding。** 固定产品把未编辑 suffix/gap 证明从仅EOL扩展到space/tab/EOL，实际删除补丁仍仅删除一对EOL；listJoinPlan支持既有空白尾部，落点绑定lift补丁结束处而非整篇candidate末尾。独立运行原 `正文\n   \n` 和 `\uFEFF\r\n   \r\n` 最小反例，Enter×3、Backspace×1后均 `unresolved=false`、`saveEligible=true`、snapshot成功，原2红确为2绿。只在此范围有界关闭，不把旧reference/protected/tab边界写成通过。

受检来源：`git archive 03715e9cad05ed90a0f541b45826915676bf4135 editor` 导出到本任务 ignored `artifacts/INK-REV-211/postfix`，再创建该树专用 `editor/node_modules` 依赖软链及生成renderer资源。`postfix/source-proof.json`记录固定commit、父提交、四个关键文件git blob与SHA256；已逐字比较导出内容与固定 `git show <SHA>:<path>`。例如 empty-paragraph-edit blob `512c989b79651a65fb3d577f89c7f1869a5d78c8`，SHA256 `f1eb07a49804131bc0a0aaddbe7fb1f232ce81d49d67ab63a459ce80121fff69`。未运行或修改主repo产品。

本人再次执行（命令前缀 `/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir artifacts/INK-REV-211/postfix/editor exec`）：

| 参数 | 独立结果 | 证据 |
| --- | --- | --- |
| `vitest run src/list-empty-backspace-runtime.test.ts artifacts/INK-REV-211/whitespace.test.ts artifacts/INK-REV-211/probe.test.ts artifacts/INK-REV-211/extended.test.ts artifacts/INK-REV-211/reopen.test.ts` | 55项：51 PASS / 4 FAIL；正式目标20绿、原最小反例2绿、原重开对照6绿、原14矩阵11绿3红、原13扩展12绿1红 | `postfix/matrix.log` |
| `vitest run artifacts/INK-REV-211/retention.test.ts` | 9/9 PASS | `postfix/retention.log` |

新9项具体检查：4项普通/strong/heading/BOM空白文档旅程经3 Enter+3 Backspace恢复精确原文，space/tab/LF/CRLF/mixed后缀不变，Undo/Redo恢复扩展文本及原文，markSaved为clean，新runtime重开snapshot逐字相同；3项列表末尾空item直接Backspace lift保留LF/CRLF/mixed后缀，caret精确在保留后缀之前，插入X落在该点，Undo/Redo、保存点与新会话snapshot完整保留；2项分别篡改目标anchor/head，确认完整有向Selection错误时原文及选区原子保留、未解决意图阻断snapshot，随后正确Backspace恢复资格。原目标20项也继续覆盖混入文字和错误选区拒绝。

保留失败的4项不是本次修复回归：`正文\t`初始化inline词法、尾unused reference definition、尾protected comment，以及reference link加尾definition；均属首稿已披露范围，未删除或改写其oracle以获得全绿。本人初建lift独立oracle曾将CRLF所在行的新增局部EOL误写为LF，导致2项原文比较失败；按照已有局部EOL契约明确写成对应CRLF预期后9绿，原错误oracle和失败日志保留在 `postfix/retention-initial-oracle.test.ts` / `postfix/retention-initial-oracle.log`，未修改任何正式测试。另有2项无断言的逐步lift轨迹仅作探索，保存于 `postfix/lift-trace.log`，不计验证通过项。

本次依然仅为本人synthetic公开runtime证据，不等同真实磁盘保存/关闭重开、WK、Native、App/UI或物理IME；未运行全量或构建。实现者报告1100项通过是外部证据，未计入本人运行。只追加原两份报告/task，受检archive依赖软链结束后解除，不push，由root统一备份和集成。


## 追加：Native标题夹具入口校准的限定静态复审

固定差分 `git diff fcf16c405a7f3965ed8fa63add6de675f5220b6f...13a3fa7a92437eea8064a2ed7f8d9c51d54938aa`；merge-base确为前者，非空diff仅3文件：Native夹具、209任务追加、heading-outline-calibration.json。独立核对 `git diff 03715e9cad05ed90a0f541b45826915676bf4135 13a3fa7a92437eea8064a2ed7f8d9c51d54938aa -- app editor project.yml` 为空。本次不重新评价产品功能，原首稿及037限定复验逐字保留。

### Spec核心结论（少于400词）

**missing/partial、scope creep、implemented wrong均未发现新增可证实项。** 固定head `docs/tasks/INK-FIX-209.md:63-65` 明确区分大纲入口与裸DOM Range，要求不削弱标题起点/精确raw/no-h1/真实Save As字节/prepareForClose断言。新夹具 `WritingInteractionHostlessTests.swift:439-501` 保留任务尾空格精确snapshot，待当前大纲按钮替换后只激活一次；原collapsed/offset0/H1归属守卫完整保留，随后仍发送Backspace，不用源码替换模拟去标题。精确去格式原文、h1消失、NSDocument实际saveAs completion/error/磁盘UTF8字节全部保留，`withEditor:974-983` 的真实关闭准备守卫未变；新增导航raw不变断言。5秒条件等待失败会XCTFail并throw，不重试点击，没有放行前置失败或降低oracle。

公开大纲经main的epoch/documentID/revision/raw校验（`main.ts:377-391`），再由runtime设置标题起点TextSelection、session.dispatch及view.updateState/focus（`editor-runtime.ts:634-644`）。这改变选区准备方式，仍让相同任务尾空格状态下的标题Backspace走原结构编辑契约。作者旧15负对照40例全部通过起点准备、随后在snapshot/SaveAs/prepareClose报告replaceAround错误，与其仍能检出原回归一致。它不证明裸DOM Range被接纳，也不证明真实快速指针风险已解决；这些限制已在任务:59、63及JSON boundaries明示。

### 静态核对与外部证据边界

本人只读两份作者私有校准日志，SHA256均与固定head的tracked JSON逐字一致：positive40为 `e77213216017afcfae5b2a94a878cb0334468ce2c803add72a00e76db4763ddf`，negative-build15-40为 `1c5d748b14f6fdc0366aca89d53cace71bd2e0fed38b43b9bd65e1e2bc5726a2`。日志静态计数为正例40 PASS/0 FAIL，负例0 PASS/40 FAIL、200条断言错误；两者均无outline超时或标题起点guard错误。负例错误位于原文snapshot、h1数量、Save As错误/字节、prepareForClose，三处API错误明确为replaceAround unsupported；不是把失败样本误计成setup RED。

这些是**作者运行证据，经本人只读核对，不是本人重跑**；同一冻结执行文件/17与旧15资源映射来自tracked记录，完整Native36绿也仅引用作者记录。原Range失败九例及T1定因仅作已披露背景，不以两个校准日志推导所有真实输入均安全，不复述为本人重现。本次未运行测试、构建、App、Native、WK或GUI，未修改产品、测试、依赖或权限。

静态核对摘要保存于 ignored `artifacts/INK-REV-211/native-outline-static-proof.json`。仅追加原report/task，分支不变，commit与最终clean由交付消息记录；不push。未完成边界仍为真实快速指针/裸DOM Range交互的独立验收，不阻止对本次明确限定的大纲夹具契约作静态通过判断。
