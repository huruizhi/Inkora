# INK-FIX-178：任务方括号补空格与渲染

用户在build8截图报告减号/方括号附近不能输入空格，随后显示字面[]而无复选框。
基线4b3fa6faa21f2a46bbcab3cc3329e681c2cf2401。先分别复现完整逐字输入、
-[]中补列表分隔空格、- []中补状态空格，确认原文/DOM/光标和控件。
不假定用户输入错误，不把[ ]裸语法无依据扩展成任务；不改用户文档或占屏。
采用Matt诊断回路，实际失败与合法语法对照分开，未知情况下不放宽原文/投影保存守卫。


## 用户确认与真实回路

用户明确空格位置为减号与左括号之间，即-[]→- []。随后[]不渲染还涉及
[ ]内状态空格；保留GFM标准，裸[ ]不扩展为checkbox。
公共runtime初始6例4失败2通过：中间补空格失败，完整逐字输入和普通段落内部空格对照通过。
同次diagnostic表明第一处是多步input-rule被拒绝，第二处是转换task后光标落在隐藏marker内。
不是把用户语法错误当根因，也不是所有空格输入均失效。

先显示三项可证伪方向：projection-sync误吞空格、语法转换保护拒绝、位置映射错误。
原文与DOM/status对照，第一处实际公开handleTextInput产生wrapping规则的多步事务，
不是先前execCommand直接插字测试路径。先只补第一处后，6例变3通过/3失败，定位得到验证。

## 修改与证明

source-transaction：额外多步事务仍默认拒绝。只有真实input-rule metadata的局部原文字补丁，
解析干净且整份doc严格等于完整目标tr.doc，才允许该包裹转换；附加无关正文的负控仍拒绝。
source-authority：[]中插入状态空格完成task时，以同次ledger中精确[]可见span和首段归属
证明新task转换，整份构造目标eq canonical，光标移至新task label的严格双向映射边界。
不全局放开隐藏语法映射，不做nearest吸附，组合期不发这张转换光标例外。
已有审计尾空白投影也使用当前ledger，sourceLength/docSize及前后完整目标校验保留。
label若位于strong等关闭语法内，按同一label PM点严格往返映射，不盲选raw前缀结束点。
空task第一字的规划仅补必要的一个语法分隔空格，必须重新解析完整eq原task目标；
否则不采用该候选，保留原字节、marks、BOM/EOL和其他列表项。

测试：新增task-space-input-runtime.test.ts 16例，包含两处补空格、合法/普通段落对照、
BOM/CRLF/引用/有序/重复项、强体label、原文/光标/UndoRedo、伪造或混入input-rule负控。
jsdom Range geometry shim只支持选择滚动；一次旧夹具使用raw导航进入尾空白投影被拒，
改为实际PM选区移动定位[]中点，没有改产品导航或把该夹具错误当本次修复证据。
旧canonical-before-eq门槛在同一正确选区fixture先红，再使用当前已审计ledger后16例通过；
临时旧门槛探针结束后逐字恢复最终source-authority，未留下诊断日志。

Native新增公开keypress→input rule→未处理时execCommand的路径，覆盖减号补空格、
[]补空格、首个label、三次UndoRedo；另增空task label中文候选连接与一次revision。
既有19例不删除。编译同一21例测试CLI，读取已安装build8原资源：21例中2个case失败，
共6个失败断言，其中真实keypress提示同样的多步事务拒绝；不把级联断言当6个独立bug。
原build8 bundle未修改；这些测试只创建不可见自有文档，不占用户屏幕。
新资源完整回归与固定两轴复审结果在后续追加，不先宣称安装或最终验收。

修改文件还包括既有WritingInteractionHostlessTests.swift/脚本（可显式选择资源包）及任务证据。
无依赖、无用户文档/App安装变化，当前本机仍build8。
