# Typora 对齐：阅读节奏与表格工具

本切片继续[第二轮计划](typora-ui-round2-plan.md)第2、3项，基线`main@666ef210b814c1a7e779b7468781764b44980239`。上一轮侧栏、真实标题行、5000ms显隐、统计选择和安装已由PR #87交付；不重复建设或推翻它们。本文件把已有P1方向转为有限实施契约，不把尚待决策的行内标记、主题或导出顺带纳入。

## A：INK-UX-137 阅读节奏

- 根据已保留同文档对照，收敛h1底线到首段、连续h2/h3的局部留白；保留明确标题层级、段落/嵌套列表/引用/表格/代码的连续阅读层次。先报告实际before测量与拟改数字，再实施；不能只凭总高度更小宣称更像Typora。
- 保留默认17px/1.8、900px与可选760px、源码等宽、标题行/侧栏行为。不给主题、缩放或字体建立新偏好；纯CSS不改变原文、选区、历史、dirty、保存点，也不重挂载EditorView。
- 生产仅修改`editor/src/writing-surface.css`中正文排版规则；不得修改该文件的表格/代码上下文工具规则、全局`style.css`、main/runtime/Bridge。必要的前后测量harness放自身artifacts/build，不写产品调试入口。
- 使用自有fixture及不显示窗口的真实WK，记录宽/窄、900/760、深浅色下前后实际几何；检查无页面横向溢出、代码/表格自行滚动、标题和引用/链接可辨。可尝试离屏WK快照（不能读取桌面或显示窗口），失败如实保留；截图/实际paint未获证不声称观感验收通过。
- 不为纯间距常量增加镜像测试。复用既有runtime与布局回归；跑tsc/build和相称的后台检查，保留原始字节与组件身份不变证据。文档新增`docs/tasks/INK-UX-137.md`及对应evidence，旧截图/报告不覆盖。

## B：INK-UX-138 表格工具层级

- 进入表格后，常驻工具只保留后插行、后插列与“更多”；另外九项仍全部可达：前插行/删除行、前插列/删除列、四种对齐、删除表格。不删原命令或其合理禁用条件。
- “更多”具备中文AX名称、展开状态、菜单语义；鼠标与键盘均可操作。沿用Option+F10进入工具、Esc回原编辑位置；菜单持焦保持可用，关闭/取消不占历史、不夺走可信选区。不能依靠hover作为唯一入口。
- 菜单动作绑定作者打开时的表格及当前选区/内容依据。源模式、readonly、composition、跨load/destroy、旧detached按钮或等待中目标变化必须拒绝或关闭菜单，不能改投新光标/另一个表格。不得把DOM文本当内容owner。
- 操作仍走既有`applyTableCommand`→runtime局部原文补丁；单次合理Undo/Redo、BOM/EOL、未编辑字节与失败原子性不变。打开/收起更多本身不发布正文、不写dirty/revision/history/future。
- 窄窗下菜单不被工具横滚容器裁切，不与表格内容横滚混淆；显隐不挤动正文、不遮挡上一段。只看class或DOM存在不算实际几何证明，使用真实隐藏WK检查。
- 拥有`editor/src/table-editing.ts`、`context-tools.ts`及其对应测试，可新增同域菜单模块和独立CSS（由本模块import），避免与A的排版文件冲突。必要时仅在`editor-runtime.ts`的NodeView选项接线增加最小交互守卫；不改parser/ledger/transactions/Bridge或资源政策。不要为了菜单引入泛化框架/依赖。
- 保留全部有效旧测试与冻结表格golden；测试主链是实际runtime/EditorView/公开DOM事件。先用真实失败反例锁住新菜单的键盘/取消/过期动作边界，再修，不靠私有计数器证明正确。任务/evidence独立为138。

## 委派、验证与交付

主会话负责契约、协调、固定提交整合和独立复核；产品实现由两个独立worktree的Agent完成，归属互斥，不能改对方工作树。接口变化先协调。

统一禁止App启动、显示窗口/系统面板、CUA/browser/XCU、物理IME与macOS14专项、全屏截图。允许真实但不可见的NSWindow/WK及注入UI选择的后台接缝；不启动GUI补证。不得新建子Agent。

不setup/install/修改依赖与lockfile。可暂借主仓锁定`.tools`及`editor/node_modules`的symlink，只unlink自建链接。各执行者仅跑相称定向检查；完整非UI/Release/默认CI由管理者对最终组合集中结算一次，不能因纯样式改动反复跑全套。

每Agent回报完成内容、修改文件、实际命令/结果、未验与风险、branch/fullSHA；commit/push并核对真实remote与clean。不自行PR/merge/安装、改Issue或发布；保留工作树至管理者证据/commit两层备份后回收。最终先合并精确HEAD默认CI通过的PR，再按既有授权更新唯一正式安装，不强退用户文档。
