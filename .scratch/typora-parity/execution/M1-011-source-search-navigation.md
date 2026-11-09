# INK-M1-011：源码与只读查找导航

基线task/INK-M1-010-search-runtime-review @ 50584f3（核实完整SHA/clean），承接009非UI接收e3fc05e、干净256项。真实窗口仍锁屏待验，不解除006/009的UI门槛；不采纳030内核，不改M0架构结论。落实007契约B，当前只做source/readOnly原文范围导航，不做替换或PM通用映射。

## 范围

允许修改editor/src/search-panel.ts/.test.ts、main.ts/main.test.ts、editor-runtime.ts/.test.ts、style.css；可新增editor/src/source-navigation.ts/.test.ts作为纯边界映射接缝；文档docs/search-panel.md和docs/tasks/INK-M1-011.md。只读复用source-search纯模块和heading-navigation映射，不改它们、analysis、kernel/session/codec/schema/Bridge/Swift、依赖、原型及冻结根材料。不得创建子Agent。

## 行为与不变量

1. 当前运行时显式声明源码范围导航能力，只有textarea源码与bareCR只读提供；PM结构化模式显示现有计数/列表与清楚原因，不渲染无效导航按钮。不能靠querySelector(textarea)猜能力，不能导出EditorView/textarea或创建第二内容真值。
2. 支持上一处/下一处、结果条目选择；查询框非组合期Enter下一处、Shift-Enter上一处，复用findSourceMatch方向/回绕/越过当前选区语义。只在已显示的最多100处内导航，truncated保持明确范围提示，不冒充完整全文循环。显示当前第几处及回绕状态，查询/文档变化后旧索引失效。控件键盘可达、textContent安全。
3. 应用导航时同时验证documentID/revision/raw/accepted-load epoch及query/case/所指匹配仍存在；不使用旧index盲取新结果。变更与拒绝load、同identity重复load、同revision跨doc不能复用过期请求。失败局部提示、不部分更新选区，不触发editorError/保存阻断或强制整篇源码模式。
4. 新增最小runtime接缝读取当前源码有向选区、验证后选中目标范围。坐标在raw UTF16与textarea LF视图间显式双向转换；CRLF内部、代理对/字素内部、越界、BOM正文匹配都须安全拒绝；支持BOM、LF/CRLF/mixed、bareCR及混合bareCR+CRLF、无尾换行。以当前raw和textarea.value一致性校验作前提，不用文本首次find或长度比例猜位置。readonly只改选区/滚动，不改内容。
5. 搜索导航保留发起的查询框/按钮焦点，尤其查询框Enter后仍可继续Enter浏览，不能使第二次Enter误插入正文。更新正文选区/滚动不能触发input/重建DOM/setText。真实滚动可见性须后续WK验证，不把jsdom伪布局或setSelectionRange当通过证明；缺口明确记录，不按长度比例估滚动。源码查找当前范围来自runtime原有selection，不读取查询框自己的字符选区。
6. 编辑器或query composition期间pointerdown/click/Enter/程序化导航均拒绝，不夺焦点、不改候选/原文/任何选区。event.isComposing/候选Esc同样保留，组合收口后重试须重新校验，不自动执行排队旧导航。保留009跨load候选策略、late input守卫、query焦点文档UndoRedo隔离以及006大纲守卫。
7. 导航绝不改原文、saved、dirty、revision、Undo/Redo深度或future，不发stateChanged、不修改协议。关闭查询后正文正常Undo/Redo继续，不因导航清future。查询/大小写重算、后台刷新和错误都不抢正文焦点。
8. 稳定workspace布局及隐藏规则保持：不在load时丢工具条，不把结果HTML执行，不破坏面板折叠/页面不滚动/内部滚动。无⌘F、原生菜单、替换、装饰高亮层或可视raw↔PM实现。

## 验收

真实source-search+runtime+main/DOM接缝：源码与readonly正反/回绕/重复匹配/选择条目；query连续Enter/ShiftEnter且焦点保持；范围双向回环与Unicode/CRLF/BOM/裸CR/混合边界拒绝；正文原文/保存点/history/future/revision/Bridge消息不变；有past/future时导航后正文UndoRedo；编辑后旧按钮/同revision异raw/重复load epoch拒绝；runtime/query composition及isComposing事件不扰动；truncated只在可见100内导航；PM不出现伪按钮。保留既有256项与根009九项作为控制，测试数量分列。

不运行GUI/App/浏览器，不安装依赖。只读复用主仓锁定pnpm与依赖，环境自动生成node_modules如实记录，不改依赖清单/锁，清理临时自建文件/链接。实际跑新专项、干净全量editor非UI（含bridge）、lint/build/git diff --check。只读管理者档案 /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-m1-checks 中root两测试可复制本地临时运行，禁止改/追加。英文Conventional subject<=72，push本任务分支核对origin/fullSHA/clean，不PR不合main不改Issue。按AGENTS回报所有证据、未验收、风险；管理者独立复核，完成即回收Agent并在备份后回收workspace。

## 调度

profiles为空，provider实际GPT-5.6-Sol已核，采用medium/full-access/default。Agent f274c383-6fb0-463a-a5e3-6c80cab1c2cd，workspace wks_55aee03ddbab0389，host srv_MEqRNkRW6fSx，cwd /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-011-source-search-navigation，分支task/INK-M1-011-source-search-navigation。已取得running回执，notifyOnFinish=true，不轮询或催促。当前仅此执行Agent；009三Agent及workspace均已回收。
