# 委员会交叉复核意见留档

基线76070797f52b0b71debbc59b30ce8d4da6cd6f38，仅只读论证，不是原型运行证据或架构采纳。

只读复核完成。我在固定基线 7607079 上重新核对了两票引用的关键代码，全部属实：`dirty`/`ledgerSource()`（model.ts:290,300）、`commitClean` 的 `doc.eq` 闸门（:511）、staged 时 source/save 双拒绝且源码草稿预填 `model.source`（main.ts:297-301,399-406）、`apply()` no-op 以 `model.source` 为比较对象（:322）、staged 期一切文档事务被路由进 `advanceStagedText` 且非单步文字事务 throw（model.ts:564-582；native-transaction.ts:264-267）、`a \n` 类字节从磁盘打开 staged=null 可存可 no-op 往返且 block-suffix span 持有隐藏空格（trailing-whitespace-check.mjs:190-206）。“同一合法字节按到达路径双标”是代码事实，不是措辞分歧。

## 1) cross-check 接受与修正

**接受第 1、4、5、6 条**。第 1 条落到代码即：`ledgerSource()` 升格为唯一公开的当前原文字节权威（字段或访问器均可），`model.source` 拆出的旧语义改名为显式缓存；`dirty` 收敛为单句 `documentBytes !== savedBytes`（现为 model.ts:290 的双源或逻辑）。第 4 条正确地同时否定了 B 的“拒绝面清零”隐含承诺和 A 最小门槛中未写的安全边界义务。第 6 条两票本已一致，维持。

**修正两点**：
- **第 2 条须钉死 settle 触发时机在“编辑被接受时”而非 save 点击**。空格事务入账瞬间 candidate 即成为当前权威，staged 降为投影债记录；save/source/history/dirty 同源读取。B 票 028 验收写“停在空格→settle+save”，若 settle 是用户/保存触发的落账动作，仍违反第 1 条；若是接受时自动发生，则与 A 的 documentBytes 原子更新是同一机制——这是收敛的实质内容，不是换名。
- **第 3 条须补负例并把续写判定写实**。`# ` 输入规则在原型内应作为“声明的未支持边界：显式拒绝+可 Undo”保留，它既不是通过条件也不许静默放行；真实 pending 负例继续阻断结构化保存——否则原型可用全放行骗过正向 oracle。更关键：重开后键入 `b` 必须落在隐藏空格之后得到 `a b\n`；现有 14/14 只断言 `reopened.state.doc.eq`（mjs:117），从未在重开文档上放光标续写，这条今天证据为零，恰是 raw affinity 的核心考题。会话内投影（空格可见）与重开投影（隐藏）两个不同投影必须对同一插入点达成一致，这才是边界关系定义成立的证明。

## 2) 能否形成共同推荐

**能，且非表面共识**。B 票自己已承认 settle 落地即“保存权威=candidate 字节、PM=显式允许偏差投影，这就是 source 权威语义”（REV-028b §2 诚实定性）；A 票明确 C 复用现有 PM/parser/ledger、不重写 UI（REV-028a §2C）。管理者把 C 定义为隔离验证分支、B 定义为其内部落账接口后，剩余实质分歧只有两个，且都可裁决：允许域形态——按管理者“不按 kind 数量机械判成败、否决的是按入口标签绕过公共契约”，逐类枚举只作 smell 不作闸门，契约须给出命名关系；`# ` 类事务支持时机——B 票 029 的空白债域补全移到边界决定之后，原型内只需声明拒绝。B 票的证伪门槛（为非空白差异放松 doc.eq、非设计性波及既有矩阵、必须新增第 3 个 kind）应保留为原型实现内部的熔断线，与 A 票“只能靠逐类白名单通过即失败”合并为同一条。

## 3) 有限下一步与失败转向

**下一步（单一、纯文档）**：产出边界契约+冻结 oracle（不写代码）：五层状态（当前原文权威/语义缓存/投影债记录/会话状态/saved）、每操作前后置、主链 trace（`a\n`→空格停住→save→source no-op→字节重开→同一 raw 边界续 `b`→Undo/Redo，字节与 caret 逐点断言，含 Save 不改投影/caret/revision/history、dirty 相对 saved 字节）、负例（`# `、真实 pending、composition 守卫）、范围清单（Enter 空行、space→Enter、行内 soft/hardbreak、marks、BOM/EOL、保护块邻接）。双方签认后再开一个隔离原型任务，复用现模型，settle-at-acceptance 作内部提交接口。

**最重要失败转向**：若原型为通过“重开续写 oracle”必须对尾随空格/空段/softbreak 写各自不同的映射分支（kind 分叉复现），立即停止补映射，转入投影表示比较——显式携带隐藏字节（block-suffix 作为 PM 原子使 `doc.eq` 天然一致）vs 规范化投影+provenance 映射，各跑同一条主链 trace 后再表决；不再增加任何 staged 补丁。

## 未证推断（均非运行验证）

① 空格→Enter 被拒：我沿 model.ts:564→native-transaction.ts:264-267 代码路径推定 throw，无测试覆盖（B 票同样标 INFERENCE）；② 重开隐藏空格文档上的光标放置与续写位置：无任何现有测试；③ settle 后 past/future/revision 语义不变：设计预期，未实现未测；④ stagedLedger 每键重建的长文档性能：未测。本次仅只读，未运行测试、未写任何文件。

