# 委员会第一轮独立意见留档

此文件是原意见完整留档，不是最终共识。代码基线76070797f52b0b71debbc59b30ce8d4da6cd6f38；所引工作区路径为评审当时定位，后续归档时可用同一分支/提交和备份恢复。

评审完成。以下为基于只读代码与冻结证据的独立结论。

---

## 1. 关键事实与不变量冲突（代码引用）

**① 提交边界是“语义重解析相等”，但合法编辑态天然不满足它。**
`commitClean` 以 `parsed.doc.eq(state.doc)` 为唯一提交边界（`model.ts:511`），失败即 throw（`model.ts:670,714`）。CommonMark 会隐藏 textblock 尾部空格、无法表示空段落、折叠软换行起始位——这三类是“解析器规范化”而非“不安全文档”。staged 机制（`trailing-whitespace`、`paragraph-split`/`list-split`，`native-transaction.ts:14-18,166,171`）正是把这些状态挡在可信 source 之外的缓冲。

**② staged 已经是一个完整的“投影债”子系统，不是错误态。**
- `ledgerSource()` 在 staged 期间返回 candidate（`model.ts:300`），映射、选区、补丁已经全部工作在 candidate 字节上；
- `stagedLedger` 对 candidate 建立完整账本并平移 spans/anchors（`model.ts:310-383`），纯光标移动也会扩展锚点（`model.ts:547-562`）；
- 历史快照携带 staged（`model.ts:30-37,428-437`），`restore()` 会验证 staged ledger（`model.ts:477-501`）；空格事务在**暂存发生时**就已 push 历史（`model.ts:682`）。

即：数据层已把 candidate 当权威，只有 `source/saved/trusted` 与保存/源码闸门没跟上。

**③ 027 的阻断是策略，不是数据风险——同一字节存在双标。**
管理者确认：`parse(candidate).issues=0`、`new FidelityModel(candidate)` 干净打开。且专项测试自己证明了反向：**已存在**的尾随空格 `\uFEFFtail  \r\n` 经构造器打开后 staged=null、save 可用、源码往返 no-op、账本有 block-suffix span（`trailing-whitespace-check.mjs:190-206`）。同一份字节，键盘到达=无限期禁存禁源码（`main.ts:297-301,399-403`），文件打开=完全合法。闸门谓词是 `staged !== null`（`main.ts:102,110`），与字节无关；“短期”无任何时限机制。14 组测试断言的恰是阻断本身（`trailing-whitespace-check.mjs:87-88`），save/reopen 只在输入第二个词之后验证（`:113-121`）——**测试矩阵按构造无法证伪“停在空格”路径**。

**④ 两个陷阱证明“删掉 throw”不是解。**
- `save()` 成功路径写 `model.saved = model.source`（`main.ts:406`）——若只删 throw，保存旧字节、**丢掉用户空格**；
- `apply()` no-op 比较对象是 `model.source`（`main.ts:322`）、`source()` 预填 `model.source`（`main.ts:301`）——若只删 throw，源码草稿看不到已输入的空格，提交即丢字节。
所以 B 必须是显式的 finalize/往返协议，不是一行放宽。

**⑤ 同类缺口至少还有三处（不靠 14 个数量判断闭环的实证）。**
- Enter 后停在空段落：同为 staged，save 阻断（`main.ts:399-403` 不分 kind）——Typora 里“回车→保存”是常态；
- [INFERENCE，代码路径推断，需 5 行回归证实] 空格后立刻 Enter：`applyTransaction` 把 staged 期一切文档事务路由进 `advanceStagedText`（`model.ts:564-582`），后者只收单步**文字**事务、结构事务直接 throw（`native-transaction.ts:264-267`）→ “句尾空格+回车换段”被拒；
- 段内软换行行尾敲空格：027 自认不暂存（TRAILING-WHITESPACE-EVIDENCE.md:91，stageComparable 只裁剪段落末尾，`:226-246`）→ 拒绝；段首键入 `# ` 的输入规则也未实现（027 证据 :56，现为拒绝触发器）。这类“PM 可表达、重解析暂不可表达”的集合由 CommonMark 规范化语义决定，**可枚举**，但目前是逐个补特例的轨迹。

**⑥ 历史与组合层已具备承接条件。** composition 按 meta id 分组（`model.ts:443-476`）、`blocked` 只被真实恢复清除（`model.ts:736-740`，026 证据）、保存资格 5/5。settle 不需要新增历史条目（空格事务已入账），满足“保存点不得偷偷新增编辑历史”。

## 2. 最强方案、最强反方、三方案关系与证伪门槛

**推荐：B 作为 A 的第一增量——把 staged 完成为明确的 settle（落账）协议。** 内容：当 `parse(ledgerSource()).issues===0` 且投影差异落在命名允许域内时，settle 把 candidate 采纳为 `source/saved` 权威字节，PM doc 保持现状（空格可见、caret 不动、不规范化投影），staged 降格为存续的投影债记录（供映射与后续输入收敛继续用），不 push 历史、不 bump 用户可见 undo 步数；`source()` 预填 `ledgerSource()`；`apply()` no-op 比较对象改为 `ledgerSource()`；组合进行中禁止/推迟 settle。保存后的会话投影不变，重开投影为规范化形态（空格隐藏、由 block-suffix 持有）——这一不对称必须显式声明，而重开语义**已被 `:190-206` 实现并测试**。

**诚实定性：这不叫“保留 PM 路线不变”。** settle 一旦落地，保存权威=candidate 字节、PM=带显式允许偏差的可编辑投影——**这就是 source-backed/source 权威语义，是数据权威的迁移，不是 UI 框架重写，也不需要推倒 PM**。A 与 B 的真实差别只剩：允许域是“全称定义的关系”还是“逐类枚举”。C（source-primary 投影原型）与前两者的差别也不在尾随空格结局（它同样要决定空格显示与否，同样需要允许域），而在**提交方向与拒绝默认值**：A/B 以 PM 事务为状态、对无法证明补丁一致的事务拒绝（今天 `# ` 被拒即此类）；C 以源码为唯一状态、编辑永不被表示层拒绝，但要重解 caret/连续性/IME 稳定性，而“为稳定性保留 PM 状态”的解法又会收敛回 A。

**最强反方观点：** 允许域按 CommonMark 规范化逐面扩张（行中行尾空格、双空格 hardbreak 边界、`\` 行尾、输入规则），每面都要 comparable 规则+锚点语义——等它全称化时，`doc.eq` 边界只剩优化意义，等于事后重建了投影代数，且期间每个未覆盖面都是日常写作的阻断点；C 一次性把拒绝面清零可能更便宜。**证伪门槛（单项）：** 若实现 settle 需要：为非空白类差异放松 `doc.eq`，或改动 `restore()/trusted` 语义波及既有矩阵 ≥1 项（非设计性失败），或空格→Enter 组合必须新增第 3 个以上 staged kind 才能闭环——推荐作废，按 04 票已批准顺序用同一判据启动 C 对照。

## 3. 有限下一步（3 项，均有失败转向）

1. **INK-PROT-028 settle 协议（设计+原型）**：如上定义。验收：停在空格→settle+save→`saved===candidate` 字节、`FidelityModel(saved)` 等价重开；settle/save 前后 `past/future` 长度与 revision 语义不变；Undo 一步回空格前、Redo 回空格后（字节+caret）；源码模式预填 candidate 且字节 no-op 往返；Enter 后停在空段落同样可 settle 保存；组合期 settle 被守卫。失败→按上述门槛转 C 对照。
2. **INK-PROT-029 空白债域一次补全（单任务封顶）**：空格→Enter 组合、段内软换行行尾空格（含双空格 hardbreak 语义边界的显式决定）、键入 `# ` 段落→标题作为受支持结构事务（不再是拒绝）。验收：真实 EditorView 逐键序列无 blocked、字节/caret/历史全查；超出既有 kind 加至多一个泛化名（如 line-trailing-whitespace）即封顶，溢出→转 C。
3. **真机点验（仅覆盖 1–2 新路径）**：物理搜狗组合×settle/保存边界；用户目验“会话内空格可见 vs 重开隐藏”的不对称体验。不以此重开完整 M0 矩阵。

## 4. 027 归类与票据处理

- **027：自动层部分证据接收，完整交付验收维持拒收——成立且应维持。** 14/14、冻结红例、026 触发器更换均有效；但“保存/主动源码可达”是 04 票门槛 3/4 内既定验收项，027 自身文档也如实声明了该未决项（:93），非隐藏缺陷。027 分支 7607079 不并入 008（008 仍 ea63941），待 028 在其上落账后再集成。
- **票 11 保持 claimed**，追加登记两个具名缺口（settle 语义、空白债域含输入规则）；**票 12 保持 blocked、不写 ADR**——028/029 结果出来后再决定“记录增量路线边界”或启动 C 对照；不因本次讨论关闭任何门槛。
- **必须等真人**：物理搜狗组合与 settle/保存交互、投影不对称的体验目验、整体写作审阅；正式 NSDocument 磁盘保存/重开、最低系统属独立门槛，不得以内存保存点替代。

## 5. 最终推荐与剩余未知

**推荐：按 B→A 收敛执行（028→029），不另起 C 原型，除非证伪门槛触发。** 理由：candidate 权威、账本、锚点、历史载荷、重开语义全部已存在且被测试；缺的只是一个诚实的落账协议与允许域的全称化——这是最小且可审计的补全，而不是堆第 N 个特例；同时明确承认：完成后架构即 source 权威字节 + PM 显式偏差投影，应在 12 票如实如此表述，不用“增量路线”粉饰。

**剩余未知**：① WebKit DOMObserver 实际时序与 jsdom 重放差异（026 已暴露过一类，settle 路径需真机点验）；② stagedLedger 每键重建（缓存随 candidate 失效，`model.ts:310-313`）在长文档的性能未测，原型可接受、生产前需测量；③ 双空格 hardbreak 的产品语义决定；④ 生产 main（36e6365）schema/parser 与原型的后续漂移（原型直接复用 `src/schema`、`src/markdown-codec`，`model.ts:6-8`，漂移目前为零但无机制保证）。

