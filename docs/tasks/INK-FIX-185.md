# 空闲快照保持原生焦点

表格集成CI 43216656865（ad4f22f）执行完整Native时，259通过、9跳过，WritingInteractionHostlessTests.testNewHeadingEntrySurvivesCompositionBeforeRendering一项失败。表格功能保持固定；本任务独立分支定位必要集成阻断，不放宽原文事务校验。

## 反馈与诊断

既有真实隐藏WK单项编译为独立反馈循环：未改用例8次中1失败；临时事务trace另8次中2失败。高频失败点为版本快照之后回车，不是正文输入或表格事务。临时trace捕获回车被正常PM keymap处理（dispatch返回false），phase=idle且pmComposing=false，排除500ms Safari抑制/浏览器默认分段兜底；DOM选区在Native版本快照焦点切换时从标题尾回到头，随后PM合法“标题前加空段”的多步事务被严格拒绝。未把未知多步事务普遍放行。

3个初始可证伪假设为Safari组合输入抑制、默认insertParagraph多步、标题结算/快照导致DOM选区延后变化。带selectionchange与settle-before/after的32次追踪中3次失败：结算前后仍在尾，Native快照之后才回跳；每份JSON保留独立文件，原始交错stdout也保留。定位到EditorViewController.requestSnapshot无条件清空并恢复firstResponder。原模板注释是提交真实IME，普通无marked text快照不需要该切换。

## 限定修复与正式回归

EditorViewController仅在NSTextInputContext的当前client报告marked text时执行原有commit/restore；client不可获取时保留旧保守提交路径。普通无候选快照不动Native响应者。保存仍经过原文资格、whenCompositionStable、revision和图片所有权校验。

新增真实NSWindow/WK回归：自有NSWindow子类完整转发makeFirstResponder，仅观察公开响应者切换；明确断言client存在且无marked text，然后普通版本快照不得清空响应者，并核对原文、响应者身份与DOM光标。修前1项稳定红（resetRequests 1 != 0）；不依赖偶发光标回跳。修后运行完整写作专项及全量CI，记录以下最终结果。既有21项均保留，脚本精确计数改为22。

临时trace只作用自有fixture，不加载用户文档；instrumented Swift/JS位于ignored artifacts/INK-FIX-185，产品源码DEBUG-185探针已删除。未改PM安全规则、输入法设置或系统权限。SDK API使用本机实际SDK typecheck，不添加依赖。

## 交付边界

分支task/INK-FIX-185-heading-enter，基线ad4f22f。未运行物理IME或可见桌面；marked text提交分支保留原有语义，但不声称本轮系统输入法验收。Native/WK合成composition与真实NSTextInputContext无候选分支分别说明，不混同。原CI失败日志保留于主仓artifacts/diagnostics/INK-UX-182-ci/failed-job.log；下载完整74MB artifact传输未完成，已终止本人下载进程，没有修改runner或网络。

## 实跑结果

- 新增焦点回归修前稳定1/1红；窄修复候选的既有失败标题用例独立8/8绿。
- `INKORA_WRITING_ARTIFACTS_DIR=artifacts/INK-FIX-185/full-native tests/InkoraTests/WritingInteractionHostless.sh` 最终22/22绿，包含原21项和新焦点/反向选区回归；完整保留所有断言。
- 新测试首次误把H1 element的child offset当TextNode字符offset（1与2），属于本人夹具坐标错误；已改为DOM Range前缀长度核对实际[anchor=2,head=0]，原失败日志保留，不冒称产品问题。
- `make editor-build`退出0，Swift strict格式和`git diff --check`通过。源码中DEBUG-185已无匹配。
- 完整Native/离线Release与最终精确HEAD CI在整合后运行，不将本专项当全量。物理IME未验。
