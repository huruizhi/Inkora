# V2：保护片段与异常输入生产闭环

状态：契约草案，等待097/098独立只读规划交叉核对；尚未实现、不得据此关票。基线main `11773c66a6beef63b40f1f9191c7ef8656a27ad2`，依据ADR-0004、canonical `docs/markdown-support.md`与首阶段用户确认范围。规则优先级继续以canonical为唯一来源，本文只定义生产接线和可验证交互，不另创Markdown方言。

## 真实缺口

096固定main156的公开会话四例3红1绿（冻结于task/INK-REV-096@5dbe618）：合法脚注定义被link-reference gap吞掉；callout错误包含普通lazy continuation；Wiki词法片段冻结整个段落，邻接正文不能编辑。未闭合front matter阻断和主动源码补闭合已通过，是控制而非缺陷。PR75的S016已独立交付，不能修饰这三个缺口。

## 必须成立的契约

1. 当前原文始终唯一权威。每个accepted保护范围绑定同一raw/解析epoch、UTF-16半开边界、canonical规则ID及块/行内形态；原始BOM、每个CRLF/LF、空格和Tab不能由PM或预览反推。语义缓存、PM节点、账本与快照消费同一已接受边界，不能各用一套正则重新决定归属。
2. 块级D使用opaque block；行内D使用真实inline atom，其左右普通正文仍属于可编辑textblock。原始字串以安全textContent呈现且contenteditable=false；不执行HTML、不把预览DOM文本作为保存内容。整段保护只适用于该段范围本就为合法块级D或已明确保留的含混范围，不能作为inline能力的替代。
3. canonical优先级必须进入接受边界：可选BOM后的front matter先锁定；代码内部字面；合法callout、math、footnote definition先于较低优先级解析，合法footnote definition先于同形reference definition；行内code/escape/完整外层link/image/autolink与footnote按canonical竞争，再HTML/comment/Wiki，最后只在尚未占用范围检查U。禁止盲找首次同文或把库归一化字符串当原始位置。
4. 每个opaque span覆盖的字节在未主动源码修改时保持完全相同。邻接输入、marks/结构操作、Undo/Redo、源码no-op、保存点与重开不得偷偷转义或重建这些字节。对跨片段的部分修改、缺证明映射、过期事务及非法字素/CRLF内部位置原子拒绝，保留完整意图与原文。完整删除/选择保护atom的行为须在实施前明确对齐现有canonical保存规则，不以浏览器偶然行为定契约。
5. U候选保留完整原文、最后可信投影和诊断范围，阻断不安全结构化快照；主动源码始终可达，草稿不被切换或拒绝操作丢弃。修复后恢复安全资格；Undo/Redo能回到含混/修复状态而不会复活过期操作诊断。GATE-004显式源码提交与结构化保存的权限须按canonical分别判断，不新增无条件绕过。
6. 全局CommonMark引用first-wins、图片accepted owner proof、表格/任务、裸URL、代码高亮、大纲、统计、可视查找替换继续工作。保护片段内部的伪标题/图片/链接/候选不获得结构化owner；可视查找在atom处分隔，不以工具栏或raw预览冒充可编辑正文。
7. 不增加网络、依赖、Swift Bridge字段或公开window控制器；保持composition稳定发布/等待、source draft和raw/doc/projection严格缓存失效规则。不可用无条件doc.eq放行、全篇serializer或入口标签白名单来关例。

## 实施前冻结的最小判据

- 096三红原样转绿，front matter控制保持绿。
- 脚注label合法/非法、4空格与Tab续行、夹空行与不足缩进终止、同起点reference冲突、较早外层链接包含脚注字样、转义和code字面控制。
- callout TYPE/折叠标记/标题/连续引用空行/无lazy continuation；其后普通正文可真实输入并保持opaque raw。
- 行内Wiki/embed、HTML/comment与普通正文混排；单/重复相同片段、marks、链接/代码内部相同字面、列表/引用/表格中的实际边界。选择器和预期由独立literal oracle定义，不从被测scanner生成。
- BOM、LF/CRLF/mixed、无尾换行、中文/emoji/ZWJ；实际EditorView dispatch、raw caret/有向选区、单历史、dirty/savepoint、source no-op、snapshot、重开逐点断言。
- 未闭合/非法front matter、math、footnote、Wiki/callout与JSX/template等U负例；精确原文/可信投影/诊断/意图保留，源修复及Undo/Redo。
- main/Bridge真实加载→邻接编辑→安全快照/markSaved，含图片proof与旧epoch拒绝；hostless WK可用，synthetic composition明确分层，不替代物理IME。

## 退出与转向

先冻结oracle再逐个垂直切片红→绿，保留现有713项及canonical旧有效测试。make lint、完整editor、Bridge、Native、Release/offline与精确默认CI按变更范围实际执行；单纯模块或controller直调不算生产闭环。若必须让parser和ledger独立猜边界、按入口绕过契约、或无法证明raw↔normalized位置，则停止扩补丁并收敛accepted-boundary接口，不降低S/D/U等级。性能新增扫描须记录大文本回归与源码SHA；不以无界扫描或全局缓存换取小样本绿灯。

代码非UI候选和阶段物理验收分别结算。按用户“稍后”，不启动App、窗口、NSAlert、系统面板、浏览器/CUA、XCUITest或bench-full，不重新催问；真实WK物理中文、Sandbox、文件窗口、AX、最低macOS与paint预算仍保留。
