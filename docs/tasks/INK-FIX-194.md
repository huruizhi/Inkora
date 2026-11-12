# INK-FIX-194：普通列表的连续两次回车

用户在build11指出空列表项回车无响应，要求按提供的Typora截图：从空项目开始，一次回车新增一个空项目；连续第二次回车退出列表，保留前一个项目，光标回到普通段落。
本任务基线928929faf0a1da764415c38e241999f9287f1f83，独立分支task/INK-FIX-194-list-enter-sequence。

## 规格与实施

- 普通无序/有序列表，含标题后的多个项目：首次Enter续项；当前项为空且紧接着又Enter则退出。
- 从非空项Enter生成空项后，再Enter仍按既有退出行为；Backspace不变。
- 指针/焦点、方向键、选区、编辑、组合输入和视图重建/UndoRedo会中断连续回车。相同选区的无操作同步不会中断。
- 连续回车是当前EditorView局部状态，按已接受的不可变doc和精确head绑定；不进入Markdown、保存点或历史，不用时间阈值。
- 只有实际接受且产生空列表段的派发可建立该状态；未接受事务不会借用下一次Enter。
- 任务复选框与无view的纯命令API保持原有空项退出契约。非列表、代码、保护节点沿原路径。
- BOM不复制到续项，CRLF/已有末尾EOL保留；引用/缩进前缀逐行延续。未知事务的拒绝规则不放宽。

## 实际反馈与诊断

运行 `.tools/node_modules/.bin/pnpm --dir editor exec vitest run src/list-input-runtime.test.ts -t 'creates an empty item on first Enter'`，两例稳定红：原PM空项第一次直接退出；单空项li数0而期望2，标题+三个项目li数2而期望4。
最初缺RENDERER_NOTICES导致0测试，执行既有prepare-renderers后才得上述产品红例，原始日志分别保留。

先验证三方向：默认PM空项处理时机、结构事务到原文的有界映射、IME/选区动作误借连续状态。
首候选PluginState确实可完成截图序列；扩大Undo回归复现旧状态被历史带回（1!=3），因此改为WeakMap按真实EditorView持有，并在销毁时清理。
全量初轮2失败：无view命令API与任务列表原契约不可擅改；均已保留原行为而非删改有效断言。
初次canSplit导入是未直接声明的传递包，0测试即失败；已删除该导入，改用已有公开tr.split并在无合法split时返回false，无依赖变更。
新增BOM/CRLF负例捕获旧列表续项复制BOM，局部源行正则明确把BOM仅留BOF；原文件末尾EOL保留，因此退出后有三次CRLF的夹具期望纠正，未trim或删除原字节。

## 文件与验证边界

产品拟修改block-editing的回车命令与view生命周期、source-transaction的源行BOM/引用前缀延续；同域runtime和Native写作回归，脚本精确计数26→28。
新增Native截图序列（空项/标题多个项目/CRLF）及真正NSTextInputClient取消候选后不误作第二次Enter；保留Safari确认键保护和原26项。
既有任务、无view命令、Backspace及其他有效测试保持。完整检查、固定提交、独立复审后另记。
无用户文档/输入法设置/Schema/Bridge/Native产品/网络/Keychain变更；不提前安装，不强退用户进程。
物理IME、可见paint、VoiceOver、macOS14实机未验；公开界面行为参考用户四张截图，不声称访问Typora内部源码。

## 首轮最终候选

三份定向DOM文件153项通过；完整`make lint test-editor test-ci`已退出0，55文件1043项，tsc/Vite与Swift严格格式、CI脚本通过，既有chunk/隔离警告保留。
连续状态最终不使用PluginState或历史metadata，按EditorView弱引用+不可变doc/head持有；dispatch后只有真实view.state.doc与tr.doc一致且光标在空列表首段才建立。
同选区无操作同步不打断；视图销毁显式清理。Undo重建视图的回归先红再绿，防止历史恢复一次旧回车意图。
Native28最终结果、固定提交与两轴复审随后记录；此处不冒称完整验收或本机已更新。

## 固定验证

产品b2a321a411f227f207c99449e8b2df06a3f20a17。最终`make lint test-editor test-ci`退出0：
55文件1043项通过，tsc/Vite与Swift严格格式和CI脚本通过；写作hostless实际28/28、0失败。
新增两Native方法分别覆盖根空项/标题多项/CRLF连续两Enter和真实Native取消中文候选后重启序列。
原26项全部保留，候选确认的Safari保护仍保留。新PureAPI/任务旧断言通过而非删除重写。
证据为无损JSON输出加SHA256；原始stdout、试错夹具、放弃PluginState源码和资源保留ignored artifacts。

本轮不以合成DOM或Native文本接口代替物理键盘/搜狗、可见paint、VoiceOver或macOS14实机验收。
两轴独立复审固定b2另行结算；产品/测试和发布记录按独立工作树保留。本机尚是build11，195准备build12，未提前替换。
