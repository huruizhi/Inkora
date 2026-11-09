# INK-M1-009：当前文档查找面板第一步

固定基线task/INK-M1-008-navigation-runtime-review @ 1e3b509（开工核实完整SHA/clean），包含006修正。006真实布局待桌面解锁，不以本任务解除其门槛。设计依据007最终10a6e33，最终文档只读副本：/Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-m1-checks/INK-M1-007-design/source-search-integration.md。本任务执行其中A：可用的查询与结果列表，不实施位置映射或替换。

## 范围

只新增editor/src/search-panel.ts及.test.ts、docs/search-panel.md、docs/tasks/INK-M1-009.md；可改editor/src/main.ts及main.test.ts、style.css。不改source-search/analysis纯模块、runtime/kernel/session/schema/parser/Bridge/Swift、依赖、任何原型/冻结资料，不创建子Agent。既有大纲/导航/折叠/滚动布局不得回退。

## 行为

- Web中可键盘访问的“查找”入口，展开查询输入/大小写开关/关闭按钮和结果区域。默认大小写敏感、字面搜索；不加原生菜单、⌘F、全局快捷键或协议。
- 复用source-search纯函数。显示有限结果、查询与当前文档匹配数量；maxResults固定100，truncated时文案明确“至少100处，仅显示前100处”，不得把截断数冒充全文精确总数。空查询为清楚空态。逐条显示安全的原文匹配或上下文，textContent渲染、无HTML/资源加载，摘要不切断字素或无限长渲染。结果含Markdown语法及保护片段是全文原文搜索，面板明确“结果基于Markdown原文”；初版不提供点击跳转/替换或虚假禁用的一堆按钮，说明定位与替换尚未开放。
- 状态私有于Web面板，快照绑定documentID/revision/raw/accepted-load epoch；读取只用当前runtime.getText和真实stateChanged。不伪造revision/Bridge消息，不增加第二内容真值。不持久化到用户偏好/磁盘。
- 查询/大小写变化重算；真实编辑、Undo/Redo、markSaved、跨文档和重复load后按最新有效快照刷新。接受load立即清旧结果与绑定（保留面板开关，查询/大小写可重置，文档中明确）；被拒load完全保留有效查找状态与待分析任务。代际与取消保证旧任务不能覆盖新文档或新查询，销毁后不残留任务/listener。
- 编辑器或查询输入框composition中不夺焦点、不改原文/候选/选区，保留上一稳定结果，不用半拼音重新搜索。query compositionend后自然重算；runtime compositionend后的真实stateChanged重算。打开/关闭按钮pointerdown不能先迫使编辑器composition提交再绕过守卫；组合中拒绝会移动焦点的动作并给局部提示，不自动排队旧操作。Esc仅在query非composition且event.isComposing为false时关闭面板，其他场合不截获候选Esc/正文Esc；正常关闭可回焦点正文。查询框输入/Enter等不得触发正文编辑或原生UndoRedo命令。
- 面板自身查询、开关、刷新、错误不得改正文、dirty、revision、history/future、保存点或Bridge消息数；错误只显示局部文案，不发editorError/stop_saving。不渲染未实现的可视定位/替换，也不为搜索自动整篇源码化。
- 初始创建稳定布局容器，工具条/查找区与editorHost隔离；既有createEditorRuntime会replaceChildren(editorHost)，不能把工具条放进去后每次load消失。不在活编辑器上每次更新重建/移动DOM。页面不滚动、内部编辑/面板各自滚动；窄窗不能遮挡控制和正文。

## 验收与交付

真实search模块+DOM组件、main/Bridge/runtime接缝验证：大小写/中文emoji/正则字面/空查询、截断提示/恶意文本安全、query composition、runtime source和PM composition、被拒load保留、快速切文档同revision、重复load epoch、编辑/UndoRedo后结果变化、面板动作零Bridge/dirty/history副作用、焦点/选区不被后台刷新打断。jsdom不冒充WK/IME或真实尺寸。既有006和004回归保持。

只读复用主仓锁定pnpm/依赖；不得运行setup/install或安装包。若Paseo/运行环境已自动生成node_modules，如实记录，不修改清单或锁文件；临时自建链接清理。禁止GUI/原生App/浏览器。运行专项、完整干净editor非UI（含bridge）、lint/build/git diff --check，临时根反例另计。英文Conventional subject<=72，commit/push同分支核对origin/fullSHA/clean；不开PR不合main不改Issue。回报完成内容/文件/命令结果/未完风险/分支提交。管理者独立验收，完成立即归档Agent，备份后归档workspace。

## 调度

profiles为空，再核实OMP实际GLM-5.3后采用medium/full。Agent e83acc61-4f4a-452d-8286-b6d9cff4b01b，workspace wks_2dae5486f8fbab83，host srv_MEqRNkRW6fSx，cwd /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-009-search-panel，分支task/INK-M1-009-search-panel。已取得running回执，notifyOnFinish=true，不轮询催促。当前仅这一执行任务；006的两个完成Agent及workspace已备份回收。

## 首稿独立复核退回

首稿67a20ab仅改原7文件，origin/clean核对；执行Agent已立即归档。管理者独立干净16文件245项通过，但另建真实main/searchSource/DOM/CSS冻结反例7/7红：清空查询保留旧结果；排队timer读取query组合中间值；query composition中关闭/case守卫缺失；hidden属性被作者display:flex覆盖；长命中摘要反而保留9913单位中段；长组合字素context切割。无产品接收结论，不把245自动通过覆盖独立红例。

冻结root-m1-checks/search-panel-review.test.ts SHA e8bb5127d5ece2f968af6a4158da1e0311b8dd7adc37cf0370f2771c1c91cb35；SEARCH-PANEL-REVIEW-RED.txt SHA 8cef4a2aeb3198bd6439e62bc736b782cb33c134c0742b9e898f1307160a8e7c，执行者不得改写/追加。限定补正复用原workspace，不新增窗口；profiles仍空，provider核实GPT-5.6-Sol/medium/full-access/default，原7文件修正与回归，不扩大产品范围。未启动UI。

接续Agent b058a3c6-3668-403a-97e8-0aac12c9652e已取得running回执，notifyOnFinish=true；当前只这一执行Agent。完成后立即归档，仍按独立反例/干净套件/实际UI分层验收。
