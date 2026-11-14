# INK-REV-207：标题空格补正 Spec 独立审查

状态：审查完成，存在1项P1，不改产品。

独立分支：`task/INK-REV-207-heading-space-spec`；worktree：`.worktrees/INK-REV-207`。
固定目标 `6d373122a245bee219fb7523fef2e9fd31e357b2`，基线/merge-base `b7cdd790a702dc38c0709035098c986a7252360f`；初始clean，固定三点diff非空且仅1提交。

仅新增本任务单与[Spec报告](../reviews/INK-REV-207-heading-space-spec.md)。报告核心按(a)missing/partial、(b)scope creep、(c)implemented wrong列出；P1为关闭hash前已接受空格在取消格式时被原文删除、投影仍显示并允许保存。

本人命令及完整结果见报告表；公开六项新6/6、旧5/6（replaceAround）；独立27项新26/27、旧17/27（十组旧拒绝）；最小复现新1/2、旧2/2。失败均明确保留，不冒称全绿。已核121个旧冻结文件与Git一致，无依赖安装，不删除/绕过有效测试。

未完成：P1修复由实现任务处理；真实macOS输入、当前候选资源Native/磁盘保存关闭、全量/构建/CI等均非本人本轮验证。风险：当前补正能接受有损原文而saveMemory返回true，不宜据公开六项通过判定可交付。无PR/merge/Issue、外发消息、应用、Keychain或用户文档操作。

ignored `artifacts/INK-REV-207`保留probe、校准日志、冻结source、最终红绿及SHA索引，worktree保留待两层备份。完成时只unlink自建两处node_modules链接，push仅自有分支并以ls-remote核HEAD；最终commit/远端核对见交付回报。

## 2026-11-14 固定afa00ca的追加复验

状态：原P1在公开Session有界范围内已复验关闭，无新增Spec finding；不宣称物理验收通过。固定diff为6d373122a245bee219fb7523fef2e9fd31e357b2...afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe，仅审Git导出。前述首稿报告/任务单字节完整保留为prefix，SHA与新增证据见报告追加节。

本人当前7/7、原27/27、原P1最小2/2、额外44/44、marker8/8。修正前6d同第7项及P1最小仍红；额外44项旧32通过/12个可见空格原文丢失失败。40组输入trace新旧相同（28接受/12继承拒绝），对suffix被视作语法的空格/tab保留正确control，不以canonical重开PM省略空白视作原文丢字节。精确currentRaw/save/new-session raw全部核对；拒绝与历史/完整Selection边界保持。

仅追加原报告/任务单。无产品修改、private getter、依赖安装、全量/Native/Xcode/GUI/构建/CI/安装；作者结果不算本人证据。未完成的真实IME/可见光标/保存关闭旅程及最终候选资源验证仍由实现任务处理。额外防御性无ledger/非空白可见重叠分支只静态审查，不伪报动态覆盖；可见tab在delimiter直接输入本轮未建立接受路径。ignored postfix证据及worktree保留，解除自建依赖链接，commit/push/真实remote核对见回报。

## 2026-11-14 最后Native夹具静态收口

仅静态核afa00cab...16860d7：editor/app/project产品diff为空；Native新用例去除makeFirstResponder切换、增加公开heading起点caret断言，全部输入/真实Save As/精确磁盘字节及withEditor prepareForClose断言保留，未削弱Spec验证。无新增finding，原P1在afa公开Session有界关闭范围不变。作者同冻结35项binary切旧/新资源的红绿仅为作者证据，本人未实跑/独立核日志，不把夹具失配当产品红或合成DOM算物理输入。本轮不运行任何测试/构建/GUI；只追加原报告/任务单并核953e0a2全文prefix保持。静态diff/SHA证据保留final-static，真实验收仍待实现任务结算。
