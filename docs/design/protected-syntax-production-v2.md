# V2：保护片段与异常输入生产闭环

状态：097/098独立只读规划与交叉核对后定稿，可实施；尚未实现、不得据此关票。基线main `11773c66a6beef63b40f1f9191c7ef8656a27ad2`，依据ADR-0004、canonical `docs/markdown-support.md`与首阶段用户确认范围。规则优先级继续以canonical为唯一来源，本文只定义生产接线和可验证交互，不另创Markdown方言。

## 真实缺口

096固定main156的公开会话四例3红1绿（冻结于task/INK-REV-096@5dbe618）：合法脚注定义被link-reference gap吞掉；callout错误包含普通lazy continuation；Wiki词法片段冻结整个段落，邻接正文不能编辑。未闭合front matter阻断和主动源码补闭合已通过，是控制而非缺陷。PR75的S016已独立交付，不能修饰这三个缺口。

099在main117另取得GATE-004公开红例：`Before $x$ after.\n`→主动源码改为`Before $y$ after.\n`→applySource成功且原文准确→saveMemory仍拒绝。实际1/1红，冻结测试与日志见docs/evidence/INK-SPEC-099；不得把清空issues或按UI模式无条件放行作为修复。

## 必须成立的契约

1. 当前原文始终唯一权威。每个accepted保护范围绑定同一raw/解析epoch、UTF-16半开边界、canonical规则ID及块/行内形态；原始BOM、每个CRLF/LF、空格和Tab不能由PM或预览反推。语义缓存、PM节点、账本与快照消费同一已接受边界，不能各用一套正则重新决定归属。
2. 块级D使用opaque block；行内D使用真实inline atom，其左右普通正文仍属于可编辑textblock。原始字串以安全textContent呈现且contenteditable=false；不执行HTML、不把预览DOM文本作为保存内容。整段保护只适用于该段范围本就为合法块级D或已明确保留的含混范围，不能作为inline能力的替代。
3. canonical优先级必须进入接受边界：可选BOM后的front matter先锁定；代码内部字面；合法callout、math、footnote definition先于较低优先级解析，合法footnote definition先于同形reference definition；行内code/escape/完整外层link/image/autolink与footnote按canonical竞争，随后HTML注释；同起点大写JSX优先于raw HTML，再普通raw HTML，最后Wiki/畸形候选与未占用范围的U。禁止盲找首次同文或把库归一化字符串当原始位置。
4. 每个opaque span覆盖的字节在未主动源码修改时保持完全相同。邻接输入、marks/结构操作、Undo/Redo、源码no-op、保存点与重开不得偷偷转义或重建这些字节。对跨片段的部分修改、缺证明映射、过期事务及非法字素/CRLF内部位置原子拒绝，保留完整意图与原文。按现有D只读与GATE-002，完整可视删除保护atom同样拒绝并保留意图；明确修改/删除只能通过主动源码，不把旧预览标题“整块选择或删除”当规范授权。
5. U候选保留完整原文、最后可信投影和诊断范围，阻断不安全结构化快照；主动源码始终可达，草稿不被切换或拒绝操作丢弃。修复后恢复安全资格；Undo/Redo能回到含混/修复状态而不会复活过期操作诊断。GATE-004显式源码提交与结构化保存分别判断：accepted内容状态携带绑定当前raw/epoch/revision的保存来源证明，structured路径要求无U且完整ledger，explicit-source路径要求完整草稿显式提交、可无损UTF-8编码、无composition/未提交草稿/未解决意图，直接保存同一currentRaw；ENC-002/EOL-003仍优先。保留语法诊断，任何后续内容变更、history travel/load使证明随同已验证状态迁移或失效，不能依据当前按钮/模式或语法白名单放行。
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

## 共同推荐与接线边界

097 Sol与098 Luna独立及交叉核对一致：选择token-native parser-owned canonical boundary；否决独立raw range pass预切片，因为后者需复制代码/链接/HTML/容器与全局reference语义，容易再次产生两份语法真值。两者曾比较范围pass的词法测试便利与parser rule对内部API敏感的代价；通过原始行/容器provenance、锁定版本与有限oracle约束后，仍选择parser直接给出已接受范围。不是重写所有S映射。

生产深模块返回同一CanonicalParseResult：PM派生树、S tokens/provenance、accepted opaque spans、U diagnostics、raw/BOM/EOL映射、全局first-wins reference环境。source-document作adapter；protected-markdown退为预览；safety消费canonical诊断，ledger消费同次结果、可渐进复用现有S mapper，立即停止独立判断D/U。raw↔token、PM↔token或opaque coverage任一不能证明即阻断相应切片并保留意图，不回退regex或重新parse去猜边界。候选事务仍需完整doc.eq，包括保护节点raw attrs。

独立结论与最终cross-check原始输出保存于docs/evidence/INK-SPEC-099/committee-097-final.json和committee-098-final.json；两者均未写文件/运行测试。另保留16例草案原文draft-16-oracles.json（SHA 456d2d42bf4dd45cd3339ab97c9cc233844eaf77cc7017a8acc840ce4545df9e）；Luna核对后将V2-005错标缩进代码的rule纠为SYN-S004/S011，新增完整删除拒绝与GATE004源码提交两项，最终18例单独SHA冻结。此为实施前规范核对，不是为已有产品绿灯修改golden。
