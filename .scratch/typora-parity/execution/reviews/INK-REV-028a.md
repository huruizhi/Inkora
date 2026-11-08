# 委员会第一轮独立意见留档

此文件是原意见完整留档，不是最终共识。代码基线76070797f52b0b71debbc59b30ce8d4da6cd6f38；所引工作区路径为评审当时定位，后续归档时可用同一分支/提交和备份恢复。

结论先行：027 证明了“现有 PM 能继续完成 `word + space + word`”，但也暴露出当前模型没有稳定的“文档原文—语义解析—可编辑投影”边界。我的票是：**停止增加新的 staged 特例；暂不否定 ProseMirror；立即用同一 PM 视图做一次隔离的 source-primary 投影原型 C。若通过，再把该边界移植为 A。B 不能作为独立长期架构。**

## 1. 代码中的关键冲突

当前实际存在四份意义不同的状态：

| 层级 | 当前载体 | 冲突 |
|---|---|---|
| 文档字节 | `model.source`，staged 时另有 `candidate` | staged 后用户最新输入只在 `candidate`，`source` 不再是当前文档 |
| 语义解析 | `parse(source).doc` | CommonMark 合法地忽略尾随空格，不能代表全部文件字节 |
| 可编辑投影 | `EditorState` | PM 可以显示尾随空格，但它不必与语义 parse `doc.eq` |
| 会话状态 | selection、anchors、history、trusted、blocked | 已能保存 staged 快照，却没有让 staged 字节成为可保存文档的协议 |

具体事实：

- `dirty` 和 ledger 已把 staged 当作真实用户状态：`dirty = source != saved || staged != null`，且 `ledgerSource()` 返回 `candidate`；但源码编辑和保存仍只认 `model.source`。[model.ts:273](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/model.ts:273>)
- staged ledger 已经为 candidate、PM 投影和显式 anchors 建立关系，说明它不是简单的“未完成临时字符串”，而是一等会话状态。[model.ts:310](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/model.ts:310>)
- `stageEquivalent` 通过删除投影尾随空格/空结构来判断“允许的差异”。这实际上已经在定义投影关系，只是被编码成按 `kind` 分支的例外表。[model.ts:221](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/model.ts:221>)
- `commitClean` 仍要求 `parse(source).doc.eq(state.doc)`；不能相等就只能继续 staged，无法形成稳定保存状态。[model.ts:509](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/model.ts:509>)
- 主动源码入口在 staged 时直接拒绝，并且即使进入源码也是从 `model.source` 初始化；保存同样直接拒绝 staged。[main.ts:297](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/main.ts:297>) [main.ts:399](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/main.ts:399>)
- 相同的 `a \n` 字节，从磁盘打开时是可保存的 hidden-but-owned 状态；从可视输入产生时却能无限期禁止保存和源码入口。027 自己也承认“继续输入或 Undo”是唯一出口。[TRAILING-WHITESPACE-EVIDENCE.md:43](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/TRAILING-WHITESPACE-EVIDENCE.md:43>) [TRAILING-WHITESPACE-EVIDENCE.md:88](</Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-rev-028a-projection-boundary/editor/prototypes/fidelity/TRAILING-WHITESPACE-EVIDENCE.md:88>)

因此真正冲突不是“PM 能不能表示空格”，而是把以下三件事错误地当作同一不变量：

1. 文件字节是否合法；
2. 语义 parser 是否保留这些字节；
3. 当前可编辑投影是否与语义 AST 完全相等。

`doc.eq` 适合作为某些结构事务的安全检查，不适合作为所有合法文档状态的提交边界。

建议的新边界必须明确：

- `documentBytes`：当前文档唯一权威；已接受的视觉编辑必须原子地写入它。
- `semanticParse`：派生语义，可忽略非语义字节，但不能反向覆盖原文。
- `editableProjection`：由原文和 provenance 生成，可包含语义 parser 隐藏的尾随空格、空行及其锚点。
- `sessionState`：selection/affinity、composition、history、诊断、source draft。
- `savedBytes`：保存点。`dirty = documentBytes !== savedBytes`。
- 保存只更新 `savedBytes`、写出同一 `documentBytes`；不得规范化 PM、移动 caret 或新增 Undo 历史。
- `pending` 只表示无法证明投影/编辑意图安全的含混边界；合法但非语义的空白不能因为 `doc.eq` 不同而进入 pending。

## 2. A/B/C 的实质差异与推荐

### A：现有 PM + 统一 source-authoritative 投影边界

这是最强的最终方案，也**本质上就是 source-primary 数据权威**。它不等于更换编辑 UI：PM 仍可作为编辑投影，但不能再作为文件内容权威。

优点是保留现有 ledger、保护块、selection、composition 和历史成果；代价是要重构核心状态不变量，而不是继续修一个分支。

### B：为 staged 增加 finalize/save/source 协议

它只有两种实现：

- finalize 时把 PM 规范化成 `parse(candidate).doc`：会隐藏刚输入的空格，产生 caret 跳动；下一字符可能插到空格前；还可能改变 selection/history。
- 保留当前 PM，同时把 candidate 升格为当前文档并保留 hidden span、anchors 和映射：这已经是 A，只是换了名字。

所以 B 可以是 A 的迁移接口，但不是独立架构。若 finalize 需要按 `trailing-whitespace`、`empty-paragraph` 等逐项写例外，它仍是 staged 特例堆叠。

B 的最强反方观点很有力：现路线已有大量字节、ledger、history、IME 证据，尾随空格看起来只是一个有限缺口，窄 finalize 成本最低。但这些证据也说明 candidate 已经承担当前文档职责；继续否认其权威只会让保存、源码、历史各自再加协议。

### C：隔离的 source-primary 投影原型

C 与 A 的数据架构不是两个方向；差别是**验证隔离度和迁移风险**。C 应继续使用现有 PM、parser、schema 和锁定依赖，只换数据权威与投影边界，不重写 UI。

我推荐先做 C，是因为它能区分：

- 是 PM 本身无法承载稳定投影；
- 还是现有 `source/staged/trusted` 状态模型的历史包袱导致失败。

**最小可证伪门槛：**

对 `a\n` 执行“输入空格后停住 → Save → 主动源码 no-op 往返 → 关闭重开 → 继续输入 `b` → Undo/Redo”，必须同时满足：

- 磁盘/内存保存字节始终为 `a \n`，继续输入后为 `a b\n`；
- Save 不改变投影、caret、selection、revision 或 Undo 数量；
- 源码入口显示完整空格，caret 位于空格之后；
- 重开后仍能把 caret 放在相同逻辑位置并继续输入；
- Undo 可分别回到“只有尾随空格”和“无空格”，dirty 相对保存点正确；
- 不新增 `trailing-whitespace` 专用 finalize 分支。

若 source-primary C 在保留当前 PM 的前提下仍无法通过这一条，我的推荐即被证伪：问题进入投影表示能力，而不能声称仅改数据权威即可解决。

## 3. 有限下一步

1. **冻结投影边界契约与同一套 oracle**

   明确上述四层状态和每个操作的前后置条件。验收要求是不存在“已接受字节只在 candidate、却不属于当前 documentBytes”的状态，Save 也不能改变历史或投影。若契约仍需要“继续输入才能保存”，立即判失败。

2. **实现隔离的 source-primary C 原型**

   复用现有 PM/UI/parser/ledger，无新依赖；覆盖尾随空格、连续空格、尾部空行、源码往返、save/reopen、selection affinity、Undo/Redo。若只能靠逐类 staged/finalize 白名单通过，停止并记录为失败。

3. **通过后移植成 A，并进行真实环境验收**

   将统一边界替换现模型中的双重 `source/candidate` 权威，再跑既有冻结矩阵。随后固定最终 bundle，集中执行真实 WKWebView/物理搜狗的连续上屏、取消/no-op、选区替换、保存点、源码往返和 Undo/Redo。若移植破坏现有 composition/history 证据，则不投架构通过票。

## 4. 027、M0 与架构票处理

027 应归类为：

- **部分原型证据：接受并保留。**
- **完整交付：拒收。**
- **不进入 008 当前接收基线。**

它可以解决：

- CommonMark 隐藏尾随普通空格是根因；
- source patch offset、candidate 字节和 PM 事务本身正确；
- `alpha + space + beta` 连续输入子集不再丢空格；
- staged anchors/ledger/history 能表达短期投影差异。

它不能解决：

- 停在合法空格时的 save/source/reopen 可达性；
- 统一数据权威；
- 保存不改变投影与历史；
- 最新 bundle 的完整物理 IME 与用户整体审阅；
- NSDocument 磁盘保存及 macOS 14。

规划记录已经正确将 027 定义为部分成果，11 仍为 claimed，12 仍被 11 阻塞。[11-incremental-fidelity-prototype.md:44](</Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PLAN-005/.scratch/typora-parity/issues/11-incremental-fidelity-prototype.md:44>) [12-fidelity-architecture-verdict.md:5](</Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PLAN-005/.scratch/typora-parity/issues/12-fidelity-architecture-verdict.md:5>) [M0-acceptance.md:159](</Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PLAN-005/.scratch/typora-parity/execution/M0-acceptance.md:159>)

票务建议：

- M0：继续未通过。
- 票 11：保持 claimed，下一证据主题改为统一投影边界。
- 票 12：保持 open/blocked，不投“采用当前 staged 增量架构”。
- 委员会暂定票：**继续验证 source-primary 边界；不否定 PM；不接受 B 式特例堆叠。**

必须等待真人的部分是最终固定实现上的物理搜狗 composition、候选/取消/替换、Undo/Redo 和整体交互审阅。架构层的字节、保存、重开、映射 oracle 可以先自动完成；真人验收不能用自动矩阵替代。

## 5. 最终推荐与剩余未知

最终推荐是：**以 C 验证、以 A 落地；B 仅允许作为 A 的内部迁移接口。**

这不是“推倒 PM”，而是承认文件原文必须成为唯一数据权威。PM 是可编辑投影；semantic parse 是派生解释；selection/history/composition 是会话状态。只有这样，合法尾随空格、空行、源码修复、保存和重开才能共享一条可审计的不变量。

剩余未知主要有三项：

- source-primary 投影能否在 marks、链接边界、空段及 IME composition 下保持统一 affinity，而不退化成新的逐类例外；
- 重开时如何把 parser 隐藏的字节稳定投影回 PM，并恢复合适 caret；
- 统一边界移植后，现有 composition 分组和跨模式历史是否仍能保持已取得的真实证据。

本次仅执行只读代码与规划核查；未运行测试、构建、GUI 或网络，未修改文件、Git 或 workspace。

