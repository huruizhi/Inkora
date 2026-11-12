# INK-FIX-168：基本写作交互四项回归

用户在本机 build6 报告：
1. 输入 # 后本行无法继续输入，Backspace 无法去掉标题格式。
2. 列表删除后无法继续向上删除，缩进残留。
3. 连续空格无法输入，有时空格无效果。
4. 标准列表语法 - [ ] 也未渲染成可勾选框（用户已确认，不扩展裸 [ ] 语法）。

本轮按 Matt diagnosing-bugs 先建立真实失败回路，再最小化、列可证伪假设、单变量修复；
完成后按固定 SHA 进行 Standards/Spec 两轴独立审查。
基线 d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e（本机 build6 源码），
不要退回 main/build5 丢掉 164/165 修复。只使用自有样稿，不读取/强退/修改用户当前文档。

验收要求：普通输入/Backspace/Enter 的真实 WebKit DOM 路径；
持续按键过程中不插入 snapshot/焦点恢复来改变节奏；末尾再检查原文、光标、历史与保存/关闭。
保留 BOM/CRLF、范围外原字节、选择方向、composition 守卫与未知语法保护。
连续空格既要源字节存在，也要能看到/继续编辑；不得靠去空白或补造整篇序列化放行。
列表需覆盖末项空白退出、首字符前删除、与上一段/项继续合并，不能仅验证 DOM 消失。
复选框应有可点击/键盘切换与原文写回、Undo/Redo 证据；裸 `[ ]` 不在本轮范围。
不引入依赖，不关闭有效测试，不占屏做重复 IME，不留下额外可启动 App 副本。

分工初始仅诊断：169 标题/空格；170 列表/复选框；168 管理真实 WK 与集成。
所有作者结果与管理者/审查者实跑区分。当前没有整体验收或修复完成结论。

## 实现与管理者独立阶段结果

已整合169初稿/扩展与170列表/任务修复；Backspace链由管理者显式合并为
`deleteSelection → clearEmptyHeading → listBoundaryBackspace → joinBackward → selectNodeBackward`。
169/170作者的运行命令与证据仅在各自任务文档列出，不冒称管理者实跑。

管理者真实隐藏WK的10例基线有7个case不符（10个失败断言）：
空标题Backspace、空任务toggle、普通/heading/list尾空白、起始空白、列表完整删字链。
空格不能只检查最终raw：原实现最终原文可能有三个空格，但输入中PM DOM依次只显示一格、零格、一格。
先补逐键settled DOM与caret断言才抓住该问题。

进一步确认裸#组合候选丢失：公开CompositionEvent/InputEvent+同一候选Text更新，
真实WK '' / '# ' 对照正常，'#'活动阶段Text已detached，最终错误保留'#zh'而非'#中'。
169新增有界组合owner证明，稳定前保持候选，稳定后canonical更新；
late final与下一普通输入分别分组，真实snapshot仍受组合稳定边界守卫。

管理者实际自跑：
- 两作者首轮合并runtime：2文件55 passed；扩展/组合后3文件93 passed。
- `make editor-build` 多个阶段实际通过（prepare-renderers/tsc/Vite，既有chunk提示）。
- 最终 `WritingInteractionHostless.sh`：**14 tests / 0 failures**。
  含空/裸#/#space/CRLF对照，候选active与确认前存活、稳定后原文/DOMcaret、一次Bridge revision，
  compositionend后5ms late-final、5ms普通后续输入独立revision/Undo、最终删除回空白、
  连续空格、列表删除、空任务勾选。没有中间每字snapshot来改变输入节奏。

14项的history通过真正Native菜单接口performEditorCommand+queryState回执，
没有向ProseMirror伪造结束composition/清composing。早期synthetic Cmd-Z夹具在end后500ms内
触发锁定PM Safari inOrNearComposition的一次保护，连空文档对照也吞第一键；
这是错误测试路径，改用实际应用菜单路由，保留失败输出，不修改有效产品IME保护。
另一次诊断console override返回JS函数导致unsupported-result夹具失败，已纠正并移除。
Native原始输出保留artifacts/INK-FIX-168；同域evidence保存基线、阶段和最终输出。

## 证据层级与剩余门槛

这是不可见真实WK+实际生产Native/Bridge编译验证，composition事件为synthetic，
不是物理搜狗、可见paint、VoiceOver或macOS14实机验收。
没有启动/强退用户App，没有替换安装，没有生成可启动.app副本。
本机仍build6。当前待冻结两轴独立审查及最终完整Web回归/lint/Bridge检查。


## 固定补正与管理者最终验证

独立 Spec 首稿固定4b38916发现三项P2 partial：引用第二尾空格丢失、
松散/引用列表首字符Backspace拒绝、strong尾空格破坏原标记。
三项都是基线已有而初稿未修完的需求，不能用普通段落已绿掩盖。
管理者在原产品上以真正WK路径再次复现，16项中新增两项失败；
原始日志含一次link选择器引号错误（夹具问题，已修正），明确不当作产品缺陷。

补正固定产品HEAD `53ffb58ab56f4269503f7936e0db3e639654fc66`：
- `717f104`接受同次ledger证明的marked/link尾边界；保留原正文Fragment和mark、
  关闭定界符、URL/title，只将新增空白放到已接受语法之外。引用投影保留容器。
- `53ffb58`补松散/引用列表的lift与继续join、必要tight属性和quote内末空task；
  只删已映射边界范围，完整parse.eq仍是强制证明，混入/非相邻/多段负控保留。
- `f2c2e95`扩展WK，逐键caret按编辑器内实际UTF16偏移测量；
  不因mark拆开Text节点误把localOffset当整段offset。

管理者在最终产品自跑：
1. `make lint test-editor test-ci`：51文件、**952 passed**；
   Swift strict格式、ESLint、prepare-renderers/tsc/Vite及CI脚本回归通过。
2. `pnpm --dir editor exec vitest run src/bridge.test.ts`：**16 passed**。
3. `tests/InkoraTests/WritingInteractionHostless.sh`：**16 tests / 0 failures**。
   quote/strong/heading+strong/link每键3空格+b、连续回删恢复原文；
   松散及quote列表连续两次首字符Backspace；所有case结束走真实
   `InkoraDocument.prepareForClose`回执成功。原14例全部保留。

完整输出见同域 `final-editor-lint-ci.txt`、`final-bridge.txt`、
`wk-sixteen-green.txt`；失败输出 `wk-review-boundaries-red.txt`保留。
不将作者230/229项或审查者probe再累加为管理者测试数。
Vite仅既有chunk体积提示；Swift CLI编译保留既有Document warnings。

本轮没有运行`make test`包含的完整Xcode Native/XCU或CI远端任务，
没有做物理IME/可见paint/VoiceOver/macOS14验收；不把synthetic事件当物理输入。
没有修改`/Applications/Inkora.app`，安装仍build6；没有生成额外.app。
最终报告以两轴固定补正复审为准，后续文档提交不会改变受检产品树。
