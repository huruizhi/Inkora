# INK-REV-207：标题空格补正 Spec 独立审查

状态：审查完成，存在1项P1，不改产品。

独立分支：`task/INK-REV-207-heading-space-spec`；worktree：`.worktrees/INK-REV-207`。
固定目标 `6d373122a245bee219fb7523fef2e9fd31e357b2`，基线/merge-base `b7cdd790a702dc38c0709035098c986a7252360f`；初始clean，固定三点diff非空且仅1提交。

仅新增本任务单与[Spec报告](../reviews/INK-REV-207-heading-space-spec.md)。报告核心按(a)missing/partial、(b)scope creep、(c)implemented wrong列出；P1为关闭hash前已接受空格在取消格式时被原文删除、投影仍显示并允许保存。

本人命令及完整结果见报告表；公开六项新6/6、旧5/6（replaceAround）；独立27项新26/27、旧17/27（十组旧拒绝）；最小复现新1/2、旧2/2。失败均明确保留，不冒称全绿。已核121个旧冻结文件与Git一致，无依赖安装，不删除/绕过有效测试。

未完成：P1修复由实现任务处理；真实macOS输入、当前候选资源Native/磁盘保存关闭、全量/构建/CI等均非本人本轮验证。风险：当前补正能接受有损原文而saveMemory返回true，不宜据公开六项通过判定可交付。无PR/merge/Issue、外发消息、应用、Keychain或用户文档操作。

ignored `artifacts/INK-REV-207`保留probe、校准日志、冻结source、最终红绿及SHA索引，worktree保留待两层备份。完成时只unlink自建两处node_modules链接，push仅自有分支并以ls-remote核HEAD；最终commit/远端核对见交付回报。
