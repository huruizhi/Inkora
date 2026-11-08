# 委员会交叉复核意见留档

基线76070797f52b0b71debbc59b30ce8d4da6cd6f38，仅只读论证，不是原型运行证据或架构采纳。

交叉复核结论：**有条件接受 cross-check，并同意形成共同推荐。**

1. 接受第 1、2、4、6 点。代码已证明当前存在双重权威：`dirty`、ledger 读取 candidate，而 Save、Source 仍读取 `model.source`；`commitClean` 又以 `doc.eq` 作为普遍提交边界。因此“统一当前原文字节权威、PM 作为投影、semantic parse 作为派生解释”不是改名，而是修复真实契约断裂。

需要三处修正：

- 第 2 点将 `source-backed` 明确为 `source-authoritative`：每个已接受事务必须原子更新当前权威字节；settle 只能是内部迁移接口，不能等到 Save 才承认输入。旧 `source` 若保留，必须明确为 semantic cache 或可信快照。
- 第 3 点补入段内 soft/hardbreak、真实 pending 负例，并明确重开后的 Undo 仅撤销新输入 `b`：`a \n → a b\n → Undo 回 a \n → Redo 回 a b\n`，不暗示跨进程恢复旧历史。
- 第 5 点不能按 kind 数量判失败。必要的语法、provenance、affinity 规则可以存在；真正失败条件应是：相同合法字节因入口不同而得到不同 Save/Source 资格、必须按入口绕过公共契约、无审计 trim/无条件 `doc.eq` 放行，或 Save 导致字节、caret、revision、history、投影变化。

2. **可以共同推荐：“隔离验证统一 source-authoritative/PM 投影边界，settle 只作迁移接口”。** 此时 A 是目标契约，C 是隔离验证容器，B 是迁移机制，三者不再是竞争架构。仍未解决的实质问题只有投影能力：PM、ledger 与 anchors 能否在重开后稳定表达 raw affinity、marks 边界、空行及保护块邻接。第一轮中“重开隐藏空格已经足够”和“source-primary 可清零拒绝面”均缺乏证据，不能采纳。

3. 有限下一步应只有“一个契约、一个有界原型”。先冻结上述 `a+space` 全链 oracle；通过后在同一原型检查 Enter 后空行、space→Enter、soft/hardbreak、marks、BOM/EOL、保护块邻接和真实 pending，范围不扩到表格、云或导出。最重要失败转向是：若无法在共享文档契约下保持精确字节与稳定 affinity，立即停止 staged 补丁扩张，比较显式 raw-span/锚点等投影表示方式；这是否要求更换 PM 核心，届时再凭证据决定。

【未证明推断】现有 parser/ledger/PM 大部分代码可复用、settle 可低成本迁移，以及统一权威后完整矩阵能通过，均尚未由原型证明。

本次仅只读核对；未运行测试、构建、GUI 或网络，未修改文件。分支 `task/INK-REV-028a-projection-boundary`，提交 `76070797f52b0b71debbc59b30ce8d4da6cd6f38`。

