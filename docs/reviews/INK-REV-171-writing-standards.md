# Standards

固定评审 `d4976d3...4b38916`；仅检查新增 hunk，不作 Spec 裁决。

Hard：未发现能据书面规范认定的违规。

可能 smell（Fowler 启发式，非 hard）：

- possible Duplicated Code：`editor/src/source-authority.ts:198–213、259–277、960–976` 三次过滤/平移 spans，再重建 blocks/links。位置账本规则变化容易漏改一处；可抽取共同重建步骤，保留各自证明条件。
- possible Data Clumps：同文件 `1025、1032` 重复声明 `{ raw, epoch, version, owner, from, to, insert }`，作为组合延续收据跨 capture/resume 传递。建议定义具名收据类型，集中表达绑定契约。

结论：hard 0；possible 2，均为维护建议，不据此判定行为失败。依据与实跑边界见任务记录。

## 补正后验 Standards（53ffb58）

仅审 `4b389169..53ffb58` 新 hunk：marked/link/引用尾空格、sourceBoundary、loose/quote lift/join、两项 WK fixture 与 close prepare。

新增 hard 0、possible 0。局部补丁以既有 owner/ledger 和完整目标核对为依据；未见新增网络、依赖、协议旁路或有效测试删除。键盘命令与源规划器的相似守卫各有职责，不仅因相似就判重复。

原报告两项低优先级 possible 判断保留，不升级 hard；仓库规范优先、工具强制项不重报。本次仅静态阅读，不作 Spec 或行为通过裁决；测试、构建、WK/App/UI 均未运行，作者及管理者日志不算本人实跑。

另静态核对测试补充 `0594833`：fresh session 连续两键间无 snapshot/refocus；新增 hard 0、possible 0，产品端点仍为 `53ffb58`。
