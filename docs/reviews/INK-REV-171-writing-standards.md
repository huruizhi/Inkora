# Standards

固定评审 `d4976d3...4b38916`；仅检查新增 hunk，不作 Spec 裁决。

Hard：未发现能据书面规范认定的违规。

可能 smell（Fowler 启发式，非 hard）：

- possible Duplicated Code：`editor/src/source-authority.ts:198–213、259–277、960–976` 三次过滤/平移 spans，再重建 blocks/links。位置账本规则变化容易漏改一处；可抽取共同重建步骤，保留各自证明条件。
- possible Data Clumps：同文件 `1025、1032` 重复声明 `{ raw, epoch, version, owner, from, to, insert }`，作为组合延续收据跨 capture/resume 传递。建议定义具名收据类型，集中表达绑定契约。

结论：hard 0；possible 2，均为维护建议，不据此判定行为失败。依据与实跑边界见任务记录。
