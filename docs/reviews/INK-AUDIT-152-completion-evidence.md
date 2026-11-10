# INK-AUDIT-152：完整目标到完成证据

本报告只做静态审计。起点工作树 clean，HEAD `f09143d4f3d47a2397c7c2d690cd30750c0841df`；产品 main `aef514c501cb33eb10cac121d300b67374c462a5`。两者 diff 只有当前写作预算契约和150管理记录，无产品差异。本人没有运行测试、构建、App或UI；下文执行结果均明确引用固定记录，测试源码仅用于确认覆盖边界。

## 原始目标与判定口径

全文读取 AGENTS、GLOSSARY、全部三份ADR、当前写作契约152条款。原始需求固定为规划分支 `2c30029bbcc54e8836befdb6c036c1f258bee365` 的 `.scratch/typora-parity/`：issues/03-first-milestone、07-quality-gates、15-writing-performance-budget，以及 execution/FIRST-STAGE-REQUIREMENTS、PHYSICAL-ACCEPTANCE。原始03的八场景、07的六维度保持；后续用户追加真实公式/Mermaid/脚注、安静UI及侧栏12项交互一并纳入。后来的任务契约用于限定实施归属，不用于删减原始完成义务。

分类含义：**充分**表示对该行明确限定的层级有实际动作和结果；**有限**表示已有实现/结果而不足以结算全部门槛；**反证**表示有实际相反结果，必须区分仍有效和已修复；**缺失**表示未找到所需层级执行证据；**用户排除**表示明确取消本轮重复/专项要求；**待决策**表示尚无授权或体验选择。充分不等于整个阶段完成。

## 固定证据账本

| 编号 | 固定来源及实际结果 | 可用边界 |
| --- | --- | --- |
| E1 | 主仓 `artifacts/backups/INK-UX-141/delivery-receipt.json`：PR89受检 `77ba1d7500c3692b7cc8ff554caa9cd9ca95a176`，CI42871839283 attempt2 success，合并 `c48d717e9235680142913448d1de80b54cb2890d`，整树一致；editor811、双侧Bridge16、Native214/0失败/8既有perf skip | 非UI默认门禁；7条旧基线性能warn，不能写成性能预算通过 |
| E2 | 主仓 `artifacts/backups/INK-REL-146/delivery-receipt.json`：PR90受检 `88cce0a95fe477bb38e10d13acded67f8f68638b`，CI42877767170 attempt2 success，合并aef514c整树一致；editor811、WebBridge16；ui=false/fullBench=false | 新版仅build4本地候选，未发布/安装；light有6阈值warn。两次attempt1均checkout网络失败，产品测试未启动 |
| E3 | 当前 `docs/tasks/INK-UX-141.md`、`docs/evidence/INK-UX-141/{technical-final-wk.json,technical-final-wk.log,bundle.sha256,TechnicalRunner.swift.txt}`：固定组合99211a1上全门禁；最终生产bundle新进程隐藏WK复跑，第二脚注准确返回，重复/quote/非法公式准确源码定位，取消保持raw/revision/dirty/BOM | JSON三项windowVisible=false；不是屏幕、实体键盘或真实Sandbox授权 |
| E4 | 当前 `docs/tasks/INK-M1-108.md`、原始FIRST-STAGE-REQUIREMENTS：624a865默认CI42695919576通过；混排正文/表格/任务/代码语言/查找替换/历史/源码no-op，经真实WK→Bridge→NSDocument Save As→新文档/WK重开，Markdown与四格式图片字节核对 | 旧固定提交的组合证据，目录选择为注入；不能重标当前实跑 |
| E5 | `docs/tasks/INK-UX-129.md`、`docs/reviews/INK-UX-129-{acceptance-matrix,final-review}.md`：组合caab97a门禁editor795、Native214/0/8、双侧Bridge16；SidebarNavigation八项实际Passed；最后AX文案另有126项/tsc | SB01–15逐项后台证明，最终现行默认CI另由E1/E2闭合；原生系统选择/关闭答案为注入 |
| E6 | `docs/tasks/INK-UX-{115,123,126,136}.md`：离线真实WK技术渲染、菜单资格/双窗口隔离/两档宽度、900px用户选择；ce4dd2f组合门禁798与Native214/0/8，8组隐藏WK排版/表格菜单几何 | 各有历史固定SHA；部分表格可见态注入、动画finish只验终态。不能作当前屏幕paint/墙钟时长 |
| E7 | `docs/evidence/INK-REL-146/manager-result.json`、147 provenance、148/149独立审查：固定候选两包哈希、双架构/build4、strict ad-hoc/runtime、权限/离线包一致 | Developer ID、公证、下载quarantine/Gatekeeper、干净用户未验；本地候选不是公开授权 |

本人用 `git rev-parse` 核对77ba1d7和aef514c：editor tree均 `7bee7c1f70c595e3cfba8dad8d149dc49dad1bcb`、app tree均 `ab263fb180b61de0b399aa2f625e97fee5faf983`。因此E1产品代码与当前相同，版本文件变化另由E2覆盖；E4/E6仍保留各自时点，不把旧运行改称aef实跑。

## 原始八场景矩阵

| 03场景 | 当前生产路径、已执行动作与覆盖层 | 分类及剩余边界 |
| --- | --- | --- |
| 1 打开/新建→连续编辑→保存重开 | E4真实WK混排与NSDocument/磁盘字节闭环；当前 `InkoraDocumentTests.swift` 含UTF8/BOM/CRLF、Save As/失败/外改断言，E1默认Native已执行 | **充分**：有界自动文件闭环；**有限**：当前整篇可见窗口体验，E4非当前新跑 |
| 2 表格/任务/图片/代码语言不整篇退源码 | E4操作四类节点并重开；当前 tables-tasks-runtime、image-view、code-block-view及测试保留直接编辑路径；E1/E2回归覆盖 | **充分**：已支持操作的生产接线；**有限**：系统拖放/剪贴板及实际可见键盘工具体验 |
| 3 高级片段前后编辑、raw不改、主动源码 | protected-source/runtime与canonical位置依据；E4源码no-op、E3精确技术入口；E1当前editor门禁 | **充分**：有界canonical保护、源码往返；不以预览成为新owner。未知语法并非全部已渲染 |
| 4 畸形/含混保留原文、拒绝不安全保存、修复恢复 | 原始需求记录PR77的GATE004/未解决意图、epoch拒绝；当前protected-syntax/source-authority与相关测试有生产接线；E1/E2默认回归 | **充分**：已列有界诊断/保存资格路径；**有限**：不能从有限样稿推出全部畸形语法正确 |
| 5 源码/历史/dirty/有向选区 | E3重复公式和quote CRLF精确入口、dirty取消；technical-navigation-runtime测试核对范围外字节、Undo/Redo、过期控件；E1实际完整editor | **充分**：生产公共接缝与隐藏WK；**用户排除**：复做已有实体IME；不称当前实体IME通过 |
| 6 大纲/统计/查找替换/高亮语言 | E5真实索引定位、统计口径、输入焦点隔离；E4语言与替换后保存；main/search-panel/heading-navigation实际源码保留 | **充分**：自动动作与保存；**有限**：可见滚动/VoiceOver读序。当前统计已是标题行右上可选值，旧底栏文字属历史 |
| 7 图片迁移/Save As/缺失资源/授权 | E4四格式实际handler/NodeView与重开；当前InkoraDocument首存发布先于Markdown、失败manifest保留、proof跨epoch拒绝；LocalImageStore/Migration与broker测试、E1 Native | **充分**：临时磁盘/注入选择；**缺失**：真实Sandbox面板与跨启动书签授权、授权撤销后的用户闭环 |
| 8 WK/IME/选区/撤销/关闭、冲突失败 | E1/E3真WK与Native，E5关闭review注入及target重验；原始PHYSICAL保留7305b97结构编辑/保存重开记录，未把A准备包视为通过 | **有限**：自动composition/关闭选择层；**用户排除**：重复实体输入、14专项；真实授权/AX/paint仍不能取消 |

## 六维质量门槛及增量

| 07维度 | 证明及当前结算 |
| --- | --- |
| 编辑保真 | **充分（有界自动）**：八场景1–6及E1；源码/搜索/节点操作验证必要源范围、历史/选区/保存点。无新确认数据丢失反例；不等于所有输入组合数学证明 |
| 文件生命周期 | **充分（临时文件与注入）**：InkoraDocumentTests覆盖保存/另存/失败/外改/只读/移动/删除，SidebarNavigationTests覆盖dirty关闭取消和过期目标；RecoveryStore及图片SIGKILL独立进程证据见原始需求表。**有限**：Finder/只读卷/恢复UI的最终真实系统流程仍未结算 |
| 图片资源 | **充分（后台）/缺失（真实授权）**：见场景7；不能把ImageIO decode或成功图片DOM等同OS授权通过 |
| 原生与输入法 | **充分（WK和合成守卫）/用户排除（重复实体）**：E3、E5；既有M0物理搜狗证据限其版本。取消复做不删除composition正确性要求，实际新缺陷仍须验证 |
| 键盘与辅助功能 | **有限**：Native菜单、Option+F10/Esc、侧栏radio/focus、元数据及默认测试；**缺失**：docs/acceptance.md七项仍unchecked中的VoiceOver、真实文件面板读序/焦点、全键盘导航状态。AX自动审计的存在不能代替实际运行和人工VoiceOver |
| 系统与显示 | **用户排除**：macOS14专测；部署14+不变。**有限**：E6深浅/宽窄隐藏WK几何；**缺失**：当前可见深浅色与放大字体、实际paint体验结算 |

| 后续用户确认目标 | 生产与实际证据 | 分类 |
| --- | --- | --- |
| 真实公式/Mermaid/脚注 | technical-preview.ts调用本地KaTeX MathML；Mermaid本地strict SVG、异步销毁取消；脚注格式化/准确来处与源码入口。E6真WK已显示、E3补精确修改/返回，E1同产品回归 | **充分**：canonical块公式/受支持图/脚注后台渲染与历史；**有限**：可见屏幕。行内数学仍canonical保护范围，不偷换成已交付任意数学方言 |
| 安静UI、900/760、表格/代码/图片工具 | E6排版几何；E3许可离线面板、成功图片描述草稿刷新稳定与旧意图拒绝；E1收口 | **充分**：限定行为与几何；**有限**：物理焦点/观感。没有未关闭的已复现本轮功能反例 |
| 侧栏原12条要求 | E5 SB01–14覆盖原1–8及追加9–12：显式目录、自然排序/摘要、受限搜索与版本位置、同窗口review重验、标题同行、5000ms虚拟时间、四统计口径、两阶段终态及resize/reduced-motion | **充分**：后台协议/文件/DOM/隐藏WK；**有限**：OS授权、实际5秒墙钟动画、VoiceOver。SB15精确当前CI由E1/E2收口，不沿用旧“未通过”段落 |
| 当前性能及预算 | 原始15的085固定旧组合WK中位数与p95保留；E1/E2 light warn不是当前原文权威全路径；151正在独占测量 | **缺失**：当前统一snapshot→保存屏障→原子写盘分布与正式预算；**有限**：旧模型/离屏样本。不能宣称1MB全面<1s或paint/IME尾延迟已达标 |
| 发行 | E7本地build4候选；E2精确CI，未发布 | **充分**：候选机器验证；**待决策**：Beta2公开发布；**缺失**：正式Developer ID/公证/Gatekeeper门槛。Beta1例外不自动扩张 |

## 反证与可以后台推进的下一步

**反证（已修复，不能复报现行bug）**：096保护边界3红已由后续V2切片接回；侧栏d3edf880的TOCTOU、typing丢回包、dirty目标限制与窄窗重叠在E5后验关闭；141的第二脚注错返、公式入口/取消、descriptor刷新草稿/旧form在99211a1及E3闭合。首次CI checkout失败也不是现行产品反证。当前7/6条light warn是旧基线比较的真实结果，保留而不直接推定当前写作回归。

1. **P1，独立后台可推进、影响阶段完成：** 等151固定当前source/bundle/input hash及真实分层分布，核对150KB<200ms、1MB<1s方向目标，解释失败/慢样本，再由管理者按原15的既有推荐授权结算预算。最小生产seam为现有EditorBridge快照收据→InkoraDocument保存屏障→DocumentDataWriting原子写盘→新文档字节重开；`DocumentDataWriter.swift` 本身只证明atomic write，不可绕过屏障把它单测耗时叫完整保存。151若无法安全测整链，应报告具体缺少的时间边界/接口，先提案，不加产品调试入口。本审计不与151并行重测。
2. **P1，影响阶段体验验收、当前禁止占屏：** 精确汇总仍unchecked的人工AX、真实Sandbox授权/书签、可见深浅与放大、必要文件系统流程及paint。准备动作矩阵可后台做，真正执行须有合规桌面时机；它们阻止宣称整个阶段验收通过，**不阻止代码审查、性能测量或准备候选**。不再要求14专项或重复已有实体输入。
3. **待决策，不能自行实施：** 图片节点/位置失效时关闭未应用属性输入由image-view.ts:update和现有测试明确体现，141独立审查将其列继承政策边界，未裁定违反当前原文契约。最小验证候选：真实runtime打开alt/title表单，输入草稿后在图片前插字使getPos变化，观察状态提示/草稿存续，核对raw/history未误投；只有管理者确认跨节点草稿必须保留，才设计稳定owner的属性意图存储。这是可证伪政策候选，不是本审计实跑bug。行内标记显隐/局部TeX编辑也仍在第二轮计划独立选择前沿，不应为持续工作自动新增。
4. **只限公开/正式发行：** Beta2确认异步未答，保留本地候选；正式签名/公证与下载首启验证依发行政策推进。它们不阻塞独立开发工作；没有用户发布授权不能创建公开资产。

结论：已有充分的有界生产实现与后台回归证据；没有本轮确认且未关闭的产品功能反例。不能据此证明“只剩发布确认”，因为当前性能预算和非取消的阶段人工门槛仍缺失；也不能凭静态不确定性再开一串功能任务。151结果可能产生新的可靠反例，须基于其固定实测另行裁定。

## 本人实际命令、限制及交付

实际只运行git status/rev-parse/branch/log/show/diff、rg、ls、cat、sed及文档写入；精确读取本机backup receipt，没有访问用户文档或解包运行候选。一次尝试读取不存在的 `docs/evidence/INK-REL-146/result.json` 返回1，随后列目录并读取真实 `manager-result.json`，不是产品失败。未执行make setup/lint/test/build、bench、App/GUI/XCU/截图、安装或依赖链接，未修改产品/测试/历史报告。最终文档检查、提交和真实远端核对见task记录与交付回复；原证据及ignored产物保留等待两层备份。
