# V6：可视写作中的查找替换

状态：实施与验收契约，尚未实现完整可视定位/替换。上游为 ADR-0004、V1、V3/V4 和既有查找面板；源码字面查找替换继续保留，不把可视模式长期限制为仅计数。第一阶段仍须完成常见正文、标题、列表、引用、代码、链接、表格/任务中的可视查找替换。

## 用户语义

可视模式默认查找作者可编辑的内容文本；不把 Markdown 定界符、围栏语言/info、链接 href/title、引用定义、表格分隔行/管道、任务标记、代码语言控件/高亮许可文字计成正文匹配。源码模式继续查询完整 Markdown 原文，范围差异在界面清楚注明，不自动切换模式。

字面查询、大小写开关、上一处/下一处、回绕、Enter/Shift-Enter、结果选择和替换单个/全部均可使用。重复内容按真实位置区分，不盲取首次出现。段落、列表项和单元格边界不拼成跨结构的单行匹配；同段落相邻 marks 的可见文字连续，例如 `a**lp**ha` 可查到 alpha。inline code 与代码块正文可查，格式定界符不可冒充正文。

图片 alt 若作为搜索内容，结果须标明图片说明，定位整个图片并按 alt owner 修改，不伪造图片内部文本光标；不得搜索到图片工具栏。高级保护原文可按明确类别定位其整块并提示主动源码修改；不以整块保护的限制拒绝正文替换，也不自动把整篇切为源码。

## 内容事务与保真

单个匹配替换须验证当前可见文本、原文、版本、epoch、逻辑 owner 和位置依据。新文字继承匹配起点的写作 marks；未选择的前后内容和格式保持。仅替换完整链接 label 时保留链接 href/title/引用形式；横跨 link 与普通正文并选中整个链接时按普通选区编辑语义移除已被整体替换的链接。格式跨度处理必须真实改变 PM 语义，不能在无审计字符串中删除星号。

最小原文补丁保留未编辑处的 BOM、CRLF/LF/mixed EOL、尾换行、旧下划线/星号写法、定义、路径、空白和保护片段。必要的 escape/entity 重编码、inline-code delimiter 增长或 marks 拆分属于被修改 owner 的明确外层范围；不能为了替换一个词序列化整篇/整表。实体是不可拆原文 atom，不能把 `&amp;` 内部当成可视 caret。Unicode 字素/代理对、CRLF 内部位置严格拒绝，不向近邻静默吸附。

全部替换必须一次验证全部匹配和目标，构造完整候选 raw/PM/位置依据，通过等价和安全检查后一次接受、一次历史记录、一次文档发布。禁止循环调用每次都提交的 replace-one 再回滚，禁止中途失败留下前半结果。至少一个匹配失效或无法安全映射时，全批次原子拒绝，保留查询和替换意图。

查询结果列表可限制为前 100 项并显示截断，但 Replace All 不能因此只改前 100。应在当前稳定快照重新完整搜索；达到明确硬上限仍不完整时，整体拒绝并说明，不能报“全部完成”。无匹配、replacement 等于原文、重复相同操作不能新增 dirty/revision/history 或丢 future。

## 接缝与边界

复用 production source ledger、当前 PM 与 runtime/session，建立可审计的可见文本索引及双向位置，不读 `editor.textContent` 将 NodeView 工具栏混进正文。索引须按值捕获并绑定 documentID、revision、raw、load epoch、查询和大小写；相同身份/文本的新 load 仍使旧请求失效。

接通实际 SearchPanel/main、runtime 的能力与执行方法；真实 EditorView/PM 选区、必要 decorations 和受控原文补丁共同验证。查询导航不改变 raw/dirty/revision/saved/history，也不夺查询框焦点；定位目标必须实际可见，结果不盖正文。替换后更新稳定计数、当前位置、原文与统计；Undo/Redo 恢复整批 raw、PM/marks、方向与内容锚点，保存点仍由成功磁盘回执决定。

正文、查询框和 replacement 框 composition 共用守卫；组合期关闭、导航、替换、模式切换和 Native 文档 Undo/Redo 不得破坏候选或偷焦点。组合 Enter/Esc 不得为了快捷导航而提前 preventDefault。query/replacement 持焦时不得把文字撤销变成正文撤销。保留既有源码模式单步替换、bare-CR 只读行为和焦点隔离的真实回归。

dirty source draft、未解决输入意图、过期事务、保护片段修改按同一公共契约拒绝，保留当前视图和完整输入，不建立另一个可绕过保存屏障的文档真值。

## 冻结样稿与验收

`docs/acceptance/visual-search/` 的 input/expected 与 manifest 由管理者在实施前独立冻结。标准库校验只证明 oracle 的字节、SHA 和允许范围推导，绝不代表产品通过。实施必须通过真实查找输入、导航和替换按钮/命令驱动 production，再读取当前 raw 与冻结预期比较，不能手供 manifest 的 patch 当成功实现。

必须覆盖：普通中文/emoji、BOM/CRLF/no-tail、重复文字、strong/em/strike/跨 marks、链接 label 与同字 href/title 冲突、escape/entity、inline code delimiter、代码语言与正文分离、表格/任务、保护块旁正文、超过显示上限、字素内部、stale epoch/plan、no-op、单步 Undo/Redo、新分支和保存/重开。已有 V3/V4 在合入时补真实表格/图片场景，不把未来 fixture 的存在视为已支持。

先全量 editor（含 Bridge）、lint/build、原有源码与根冻结控制；管理者再验证真实 WK 视口/键盘/IME/NSDocument。不能用 jsdom 几何桩宣称实际可见，不能因仅纯模块完成就宣布 V6 或首阶段完成。无新依赖、无新网络或 entitlement；普通源码查找的已验路径不得删除。
