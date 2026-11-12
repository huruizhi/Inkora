# Standards

固定评审 `4d762fa...aec23e2`，仅检查该 diff；不作 Spec 裁定。

Hard 0；possible smell 0。未发现可据书面规范认定的新增违规。

`heading-entry.ts` 将显示状态限定于本地不可变 PM doc 身份；runtime 仅在事务接受后推进，组合收尾仅在语义相等时转交，源码入口与销毁清理。CSS 伪元素只呈现标记，未写正文或另造内容/history/revision；符合 ADR-0004、V1「统一内容与会话契约」及 Bridge「Revision 不变量」的职责边界。历史恢复引用原快照 state，身份设计与此一致。

按 Fowler 全套基线检查，未见足以报告的重复、职责泄露或无需求抽象；仓库规范优先，smell 仅为 judgement，工具强制项不重报。未见新增依赖、网络、Bridge 旁路或有效测试删除（AGENTS.md）。

仅为静态 Standards 结论，不证明行为验收通过。依据、实跑及残余风险见[任务记录](../tasks/INK-REV-175.md)。

## 补正后验 Standards（512ad4e）

仅审 `aec23e2...512ad4e` 新 hunks。新增 hard 0、possible smell 0，不作 Spec 裁定。

`capture` 在接受前取得原始单步文本输入的 JSON 事实与旧状态，收据仅在接受成功后应用；避免消费会被接受流程追加安全步骤的可变 Transaction。原有 paste、换行、同 owner、原文标记与初始空段落资格未放宽；仅更新本地装饰，符合 ADR-0004 和 V1「统一内容与会话契约」的原子边界。新增回归未删除既有有效断言（AGENTS.md）。

Fowler 基线复查未见足以报告的新增 smell；工具强制项不重报。原文档前缀保留；测试结果均属外部证据，本人未跑产品测试或界面验收。
