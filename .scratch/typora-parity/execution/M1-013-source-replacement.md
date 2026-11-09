# INK-M1-013：源码模式原子替换

基线task/INK-M1-012-source-navigation-runtime-review @ 58c5c3a（核实完整SHA/clean），含011接收ae143f5、干净276项。执行007契约C：只在可编辑source runtime开放单个/全部替换。结构化PM、bareCR只读均不支持替换，不自动切源码。不改变M0或既有真实UI门槛。

## 范围

允许改editor/src/editor-runtime.ts及.test.ts、main.ts及main.test.ts、search-panel.ts及.test.ts、style.css；可新增editor/src/source-replacement.ts及.test.ts作纯计划验证接缝；文档docs/search-panel.md、docs/tasks/INK-M1-013.md。只读复用source-search/source-navigation，不改kernel/session/codec/schema/Bridge/Swift/analysis/heading-navigation、纯search/导航模块、依赖、原型/冻结材料。不得创建子Agent。

## 先冻结不变量，再实施

1. runtime显式声明可替换能力，只有SourceEditorRuntime为true；不能复用sourceNavigation=true误开放bareCR只读。公开接口最小，不暴露textarea/EditorView，不设第二内容权威或私有revision计数。
2. 新增单行字面替换文本输入、“替换选中匹配”“全部替换”按钮。不加原生菜单/⌘F/正则/多行UI。单个只替换当前正文选区精确选中的有效匹配（范围比较，不按文字首次查找）；没有选定匹配给明确“先选择结果”提示，不暗自替换其他处。全部替换拒绝truncated结果，禁用按钮并解释；不能把显示的前100误当全文。空查询无替换。
3. main在执行时重验documentID/revision/raw/loadEpoch/query/case/完整搜索结果及replacement意图；旧按钮、编辑后计划、同revision异raw、跨doc或同身份reload旧epoch一律失败、保留查询与替换输入，不部分写入。调用既有planSourceReplacement/planSourceReplaceAll按当前快照生成完整计划；纯模块没有documentID，main不能漏补身份校验。
4. runtime新增原子提交接缝。基线replaceText只是私有恢复helper、不push历史，禁止直接调用后声称单步撤销。写入前完整验证当前raw与textarea投影一致、计划.source、patch降序/不重叠/范围与expected/Unicode边界/resultRaw重推导一致、结果选区可映射、composition等，所有验证完成前不得修改raw/kernel/selection/history/future。计划无效/过期/只读/组合一律零修改。不能发伪造input事件，不能逐patch写多次。
5. changed=true时一次采纳resultRaw、一次登记编辑前历史、清future、一次真实runtime change通知；main沿既有recordChange只bump一次revision，saved保持原值。单/全部替换均只有一个Undo单元。Undo恢复替换前精确raw与有向选区，Redo恢复替换后raw与选区；连续两次替换是两个单元。已有普通输入/Undo/Redo/保存回流保持，不能清历史或重建runtime。已有string[]源码历史如需扩展只改SourceRuntime私有快照；普通输入原有行为不在本任务全量重做，文档说明新增选区保证适用替换链。
6. changed=false（无匹配/替换相同文本）不改raw/dirty/revision/选区/history/future/保存点、不发stateChanged。结果文案清楚“未产生更改”，不能伪造成功编辑。新编辑在Undo后正确失效旧future；失败或no-op保留future。
7. 保真：无关字节、BOM、CRLF/LF/mixed、无尾换行、引用定义/链接href等都按计划保留；支持中文/emoji/ZWJ/组合重音，replacement中的$&/$1按字面。禁止把resultRaw经PM serialize或规范化写回。UI首批仅单行文本，纯计划中的多行能力不冒充UI支持；不允许插入未配对surrogate或切断字素/CRLF的caret。
8. runtime/query/replacement输入任一composition中不应用/导航/关面板/移动焦点或修改候选；统一面板组合协调，不能新增replacement field后忘记大纲与native文档UndoRedo交叉守卫。候选Enter/Esc不preventDefault；非组合replacement输入不隐式触发替换，按钮显式执行。旧009跨load候选策略延伸到新输入，不在组合中偷偷重置value；收口后执行明确重置。所有输入/查询/开关自身不改正文历史。
9. 操作后保留发起的查询/替换控件焦点；更新正文raw和选区不能把焦点移进正文导致用户续输入误写。关闭面板后焦点正文，正常文档UndoRedo可用；面板持焦时native文档UndoRedo仍拒绝越过输入框。失败局部提示，不发editorError/stop_saving；真实替换变更按正常stateChanged刷新大纲、计数和查找结果，旧索引失效。
10. UI只对可替换模式开放，readonly/PM显示原因。保留011导航和全部隐藏/折叠/内部滚动约束，不改真实UI验收结论。本任务不承诺磁盘保存/重开或实际IME/布局通过。

## 验收

先在真实plan/runtime/main/DOM接缝建立回归，再实现。至少：单个当前匹配+全部替换精确结果/一个UndoRedo；BOM+CRLF/mixed+无尾换行/中文emoji/重复文本/引用与$字面；替换前后有向选区、连续两替换、已有past/future、Undo后新分支；no-op保future/不发消息；truncated全部替换失败；过期raw/revision/epoch/query/case/替换意图/旧按钮；伪计划resultRaw与patch不符、expected错、重叠乱序、非法Unicode/结果caret、textarea投影不一致均原子失败；source/query/replacement composition、late final input、新doc重置、候选键默认行为；readonly/PM无替换控件；面板焦点不被提交/刷新夺走；006/009/011全部回归控制。

只运行非UI，禁止GUI/App/浏览器/安装包或子Agent。只读复用主仓锁定pnpm和依赖，自动store生成目录如实记录，不改清单/锁。新专项、旧009根9与011根4只读控制（临时复制再删、不得改/追加root档案）、清临时文件后的完整editor非UI/lint/build/git diff --check，数量分列。Conventional英文subject<=72，push本任务分支核对origin/fullSHA/clean，不PR不合main不改Issue。回报完成/文件/实际命令结果/未验收/风险/分支提交；管理者独立复核，完成立即回收Agent，备份后回收workspace。

## 调度

profiles为空，provider实际GPT-5.6-Sol已核，medium/full-access/default。Agent 98793f65-95a2-4b75-9f2a-58a897c2243a，workspace wks_73b6aa7f9103452d，host srv_MEqRNkRW6fSx，cwd /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-013-source-replacement，分支task/INK-M1-013-source-replacement。已取得running回执，notifyOnFinish=true，不轮询催促。当前只有这一执行Agent；011两个完成Agent及workspace已备份回收。
