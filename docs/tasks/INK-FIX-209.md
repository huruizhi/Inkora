# INK-FIX-209 列表之后空段落退格与关闭

分支：`task/INK-FIX-209-list-gap-backspace`。基线：`ffacfbff386377b317348b572ff3073521a0e67e`，初始工作树clean。用户报告build16空列表后空行退格不删行，关闭报“事务 PM 6/from 映射失败：PM 6 没有可审计文本锚点”；确认由“- 空格”建列表后回车、退格产生。保留当前用户窗口，不强退、不访问用户正文，不绕过保存/关闭守卫。

## 反馈与诊断

命令：`.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-empty-backspace-runtime.test.ts`。最初打开“- ”回车两次再退格只重现原文字节未减少，未得到精确错误，不据此下结论；扩展16组按键矩阵，3次回车+1次退格精确得到用户PM6报错，4次回车为同类PM8；新3项回归在未修改产品时全部RED，含实际逐字输入“- ”与BOM/CRLF对照。初始矩阵/缩减/红日志保留ignored artifacts/INK-FIX-209。

在用户可见说明后验证三项假设：①结构边界误作文本端点获得支持：实际删除步骤是6..8，目标只少一个空段落，文本插入锚点为3、7、9，无PM6文本锚点；②缓存未更新不获支持：清理缓存重建的完整context逐字等同，raw长度和docSize匹配；③删除跨入列表不获支持：捕获目标doc完整保留原列表。额外回归揭示空段落旧anchor被映射到结构边界，随后CRLF删除重证失败，属于同一位置生命周期缺口。

## 实现范围

新增empty-paragraph-edit模块封装列表后EOF空段落的共享Backspace操作、局部换行补丁、完整目标doc/Selection证明与绑定落点。删除已被替代的键盘EOF分支及旧planner元数据分支；在projection-sync捷径之前证明并删除一个可视空段落对应的两个EOL，不把结构端点交给文本映射，也不全篇重序列化。保留原有末尾EOL和BOM。accept仅在有绑定的新插入点且同事务确实跨越被删空段落时退休该空段落旧anchor，不放宽其他语法affinity、含文字锚点或拒绝/回滚保护。

新增公开runtime连续旅程覆盖逐行退格、最终移除列表标记、继续输入、UndoRedo、保存资格、其他列表标记、先前格式内容、完整Selection及混入文字的拒绝。Native新增真实WK/Bridge/NSDocument Save As/字节/prepareForClose用例，原35项保留，计数36。DOM输入不是物理输入法证据。首轮Native新夹具将BOM直接当Bridge文本，实际document codec会另存BOM，已限定移除新夹具的该误断言，BOM保真仍由runtime用例检查；原失败日志完整保留。旧资源运行另出现既有标题fixture定位失败，尚未将该次整体运行记为只有目标用例失败。普通字符模拟的历史粒度与composition不同，初期两字符Undo oracle失配已保存，改用单字符X验证删除后的精确插入落点，未删除有效产品断言。

无新依赖、Schema/Bridge/Native产品变更或权限调整；版本预备build17。当前仅定向134项通过，完整回归、旧/新真实资源Native差分、构建与实际发行/安装仍待结算；不得宣告已交付。


## 同类边界检查与范围收敛

用户追问设计问题后，补查同类文末空段落：空白文档、普通段落、标题后回车两次再退格分别复现PM2/PM4结构映射失败，证明不是仅一个列表分支。加粗段落在前置EOF Enter已无法保留关闭标记并创建段落，这个反例也保留为RED，未通过移走失败测试隐藏。
因此模块范围收敛为文末paragraph的创建与删除：创建时原文插入点取已证明owner的完整语法末尾，保留加粗等关闭标记与原有EOL；删除仍只移除锚点间对应的一对EOL。键盘与Native规划共用operation，完整doc与Selection绑定。仅支持前一节点为paragraph/heading/普通或有序列表，不泛化到表格/代码块/保护原子或任意中部跨块编辑。补充原文强样式、空白、普通段落、标题和外部篡改目标选区对照，后者先RED后加严格拒绝，阻止projection-sync回落绕开绑定。

Native旧资源校准后，新增用例在snapshot、真实Save As completion和prepareForClose均输出用户同条PM6错误；同一冻结执行文件切新资源时36项通过。但旧资源运行另有既有标题焦点断言失败，明确区分并保留，不称纯净35绿+新1红。随后将同类普通段落/标题/加粗EOF旅程加入同一新增Native用例，需按最终测试源重新结算差分。


## Spec P1：原有空白行内容的限定补正

211在固定9fa528c发现P1 missing/partial：普通正文或BOM空白文档已有含space的空白行，3 Enter+Backspace仍阻断保存；基线也RED，但属于本轮EOF契约未覆盖，保留为P1而非以继承为由删掉。root新增5项正文/空白/BOM/列表/strong/标题及space-tab对照，全5项真实RED。
新模块对未修改尾部允许原有space/tab/换行；实际删除补丁仍严格只含两个EOL，原有空格/tab逐字保留。列表EOF lift的原先单EOL尾部闸门也改为明确空白尾部，并把新空段落插入点绑定在局部lift补丁末尾、原有尾部空白之前，不能继续用整个candidate.length把旧尾部吞进新插入点。此两处责任已由同一组原文+Undo/保存回归覆盖，不任意trim或重建全文。定向4文件144项通过；该P1须211基于追加固定SHA独立复验关闭。


## 最终软件验证与剩余边界（产品03715e9）

make lint test-editor test-ci最终退出0，58文件1100项；make build-release退出0。固定同一36项Native执行文件，只换资源来源：旧已安装build16仍在新增用例的snapshot、NSDocument Save As completion及prepareForClose输出同条PM6错误，且旧资源有独立披露的标题焦点夹具失败；新资源36/36通过。新用例含10组列表/空白/正文/strong/标题及原有space-tab-LF/CRLF尾部，逐步退格、精确真实磁盘字节和关闭准备不删断言。Native键盘/DOM为合成输入，不冒充物理中文输入法。

210 Standards首稿hard0/judgement0，独立15项通过；037追加仅静态核对，hard0/judgement0。211保留首稿P1 missing/partial，原两个最小反例与追加9组保真/历史/重开/lift落点/完整Selection拒绝在固定037独立转绿，限定关闭；55项检查51绿4红，余下尾部reference definition、protected comment、初始化tab词法继承拒绝明确未修，不宣告所有写作已稳定。两轴首稿prefix均保留，审查报告/本人原始命令见各自task，不把root1100/36当审查者自跑。

正式/隔离build17均同源037、双架构，editor逐文件等于已测build/editor；按展开源entitlements ad-hoc/runtime重签，精确权限相等、strict/deep及离线bundle通过。去掉Xcode自动添加的get-task-allow，未改源权限。两包ZIP逐文件验证并保留SHA。审查拒绝的9fa build17包另存私有ZIP，未启动或安装。最终候选仍未启动，当前/Applications是build16，不覆盖正在运行的用户现场；需要先确认未保存内容，再安排隔离候选真实删除/保存/退出验收。桌面控制重试仍native pipe不可用，未谎称可自动验收。精确最终HEAD默认CI和两层备份在提交后结算。

源码改动：empty-paragraph-edit、block-editing、source-transaction、source-authority；新增runtime回归，扩展既有WritingInteractionHostlessTests及计数；project.yml预备17；本任务/两轴文档与脱敏证据。无新依赖、Schema/Bridge或Native产品变更，无公开Release/tag/生产key。架构解释见[文末空段落编辑契约](../design/INK-FIX-209-empty-paragraph-architecture.md)。当前未完：实际App当前系统可见旅程、安装与合并；剩余继承拒绝范围不由本轮关闭。


## 2026-11-14 实际验收与本机替换结算

用户明确确认当前build16没有需要保留的内容，允许强制关闭旧版并继续。代理先将恢复数据私有复制及tar双备份、42文件逐字核对，随后仅对身份核实的旧PID20836（/Applications/Inkora.app、build16、正式Bundle ID）发送forceTerminate并确认退出；该授权不复用于候选或其他新进程。未删除用户恢复记录或正式文档。

隔离build17以独立defaults/recovery UUID、空白自有FIX209-acceptance样稿启动。用户实际操作“- 空格→Enter三次→Backspace三次→输入验收→Undo/Redo→Command-S→Command-Q”并报告“全部正常”。代理随后核磁盘精确UTF8“验收”、无任何Inkora进程；按同一App路径重开同一文件，以NSRunningApplication普通退出，进程消失且文件字节不变。代理没有可用桌面自动控制，未可视检查重开内容；实际交互来自用户报告，文件与进程为代理独立证据，不混为自动物理输入。

产品仍固定03715e9；5c70dca精确默认CI成功后执行install-local-build17.py退出0：停止进程、旧16/新17 ZIP逐文件备份、恢复数据备份、原子替换/Applications/Inkora.app、安装后全部文件哈希等于已验收formal17且strict/deep通过。旧App移至私有部署备份，/Applications只留当前Inkora；未强退候选，安装期间未发送任何强退。make release-bundle-check RELEASE_APP_BUNDLE=/Applications/Inkora.app退出0；安装权限精确等于源entitlements展开值，版本0.1.0 build17、arm64+x86_64，仍为未公证ad-hoc预览，没有新公开Release/tag。

本轮收口仅新增[build17-physical-delivery.json](../evidence/INK-FIX-209/build17-physical-delivery.json)及追加此任务，不改变已验收代码或测试。此前1100项、Native36和build-release为真实软件验证，本轮未重复本地全量。文档收口后再次按仓库规则结算精确HEAD默认CI并合并PR102；产品树必须继续与037相同。尾部引用定义/保护内容/初始化tab继承拒绝不因本轮物理通过而宣告修复，既有首稿和失败包继续保留。源码远端、source bundle与原始证据归档会补充最终交付记录后继续保留，不提前回收worktree。

## 最终 CI 失败：标题选区准备的定因与校准

fcf16c4 的默认 CI 43575120355 非 UI 失败，保留该失败而非重试掩盖：编辑器1100项通过，Native279通过/1失败/9跳过。唯一失败为继承的标题退格用例，前置“光标必须在标题起点”失败后，退格实际删了任务末尾空格，错误字节被保存。不能据此指称原文会话拒绝或209产品回归。

按 diagnosing-bugs 反馈循环保留 original Range 夹具与各单变量探针：baseline20次2例、text-node40次2例；runtime-only20次全绿后60次5例，说明一次全绿存在采样扰动。私有 vendor-copy 仅对 PM 1.42.9 的 focus-guard 和 focus timer 被动记内存，不改行为；60次9例失败，9例均明确从标题H1 offset0经 T1 `selectionToDOM` 回到任务文本offset4，PM旧位置14、DOM读位置1、focusAge194–199ms。标题选区未进入 runtime dispatch，T2不是本次已证实原因。原始 stdout/stderr 有三处交错，归档提取九组顺序字段时保留原文件和SHA，不声称九条原JSON都能逐行解析。共享 PM dist SHA与插桩前一致，安装App未改；原型仅留ignored debug目录，不进入产品依赖。

Paseo committee 两位只读顾问 Sol/GLM三轮讨论后同意：不改上游保护、不靠延长sleep或合成pointer绕守卫，用已有公开大纲路径建立受支持的选区。GLM接受Sol关于状态权威的意见，撤回250ms作为交付方案；同时纠正大纲直接session.dispatch并不进入view.dispatchTransaction探针、CI四条失败是一次执行多断言。首次Claude顾问因配额403无分析，已换provider；不把它当第三份审查。完整回复在私有committee目录。

原用例明确更名为 `testHeadingUnformatViaOutlineAfterTaskSpaceCanSaveAndClose`：先打开大纲并记录按钮，输入任务尾空格后有界等待按钮被当前分析状态替换，再仅激活一次。保留原严格collapsed/offset0/H1归属、Backspace后精确原文、h1消失、实际NSDocument Save As completion/磁盘字节与prepareForClose全部断言，新增导航原文字节不变。移除原两段固定0.1s，不重试点击、不增加产品或测试后门。原Range源码、所有红样本和因果记录留存；覆盖入口改变，不声称“裸DOM选区被采信”或真实快速指针风险已修复。

同一冻结Native执行文件只换资源：正式已安装17连续40/40绿；真实旧15连续40例均越过大纲及标题起点守卫，再在目标replaceAround对应snapshot、Save As及prepareForClose失败，200个断言（40个snapshot抛错），证明校准未掩盖原回归。首次校准的JS赋值返回DOM节点导致WK不支持返回类型，单独保存为setup-unsupported-return.log；修正为返回Bool后才计算上述结果，不将其混作产品RED。完整36项Native、静态限定复审与精确HEAD默认CI另结算。产品app/editor/project.yml仍逐文件等于03715e9；本机17无需重装。

校准后完整 WritingInteractionHostlessTests.sh 实跑36/36退出0（正式17资源）；Swift6编译、swift-format strict、git diff --check均通过。原1100项未因仅Native测试准备变化而本地重跑，精确HEAD CI将重新执行默认全套。软件产品树对037差异为空；未启动/替换/修改用户已验收App。限定复审只审此次Native测试与证据追加，不复算产品功能通过范围。

限定两轴静态复审已追加并整合：210固定13a3fa7新增hard0/judgement0；211新增Spec finding0，核对正负原始日志SHA与tracked JSON一致、负例无大纲准备或标题起点失败。两者只静态读取、不重跑测试/GUI，首稿字节prefix保留；210原commit100307a、211原commit12ebbc6。两轴分支另行push并实核远端，不将作者40+40/36变成审查者本人测试。完整历史、原失败、私有vendor/debug与顾问回复已临时双层备份（source bundle + raw tar逐文件验证），最终CI/合并后追加结算原始收据，不提前清理worktree。正式安装全部12文件再核哈希仍等于已验收build17，strict/deep再次退出0。

最终交付代码文件仍是前述EOF共享模块、三处调用/锚点接线、runtime回归、Native回归和project build17；本次收口新增Native大纲准备校准、脱敏因果JSON及任务/两轴审查追加。未完成项只剩精确最终HEAD默认CI与PR102合并，以及明确不在本次通过范围的快速真实指针/裸DOM路径及继承保护内容边界。不得把新入口40绿写为原Range故障已不存在；本轮安装/实际列表验收结论不变，无新的公开Release、公证或生产信任结论。
