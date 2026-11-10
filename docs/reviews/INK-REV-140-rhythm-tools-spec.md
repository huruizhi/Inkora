# INK-REV-140：阅读节奏与表格工具 Spec 轴审查

## 摘要

固定受检 HEAD `ce4dd2ff0487ead9d0970f21b81d9d6b84bae009`，基线 `666ef210b814c1a7e779b7468781764b44980239`。初始 HEAD 一致、工作树 clean、差异非空，提交恰为240b8bc、2da1162、e4c5b3b、e94a677、4fc4a78、e121db9、ce4dd2f。唯一差异入口为 `git diff 666ef210b814c1a7e779b7468781764b44980239...HEAD`。

仅 Spec 轴：未发现有明确代码依据或本次反例证据的 missing/partial、scope creep 或实现错误，发现数为0。该结论是有界审查，不代表完整产品验收。本次只实跑2个文件4项测试，其中2项是本人新增的有限 runtime/DOM 探针；作者/管理者的88项及隐藏WK八组合均是受检证据，不能算本人实跑。

未运行 App、GUI、物理输入法、VoiceOver、macOS14专项、全量 Native/Release/CI；不以这些未验边界报产品缺陷。未重复几何测量，也不把隐藏WK几何当作 paint 或用户观感验收。未修改产品、已有测试及冻结 oracle。

## 依据及范围

已查阅 AGENTS.md、GLOSSARY.md、ADR-0004、docs/testing.md、docs/editor-session.md、docs/save-barrier.md、docs/markdown-support.md，以及两份设计规格。当前原文为唯一权威，PM/DOM仅承担投影与交互；据此核对内容、位置、历史与取消边界。未混入 Standards 轴评判。

下表引文均来自 `docs/design/typora-rhythm-tools.md`；实现行号以固定受检 HEAD 为准。

| 条款及规格原句 | 核对结果与依据 |
| --- | --- |
| A，第7行：“收敛h1底线到首段、连续h2/h3的局部留白”“先报告实际before测量与拟改数字，再实施” | writing-surface.css:24–26仅增加h1紧接p和h2/h3交替相邻选择器。137报告记录候选与生产两阶段、25.5→17和34→21.25px；原始JSON分别保留。未据总高度推断Typora相似度。先报告的会话时序未由本次静态审查独立复演。 |
| A，第8行：“保留默认17px/1.8、900px与可选760px、源码等宽、标题行/侧栏行为” | 差异无字体/宽度设置、源码、标题行、侧栏或EditorView生命周期变更；仅正文局部CSS，无状态写路径。 |
| A，第9行：“生产仅修改…正文排版规则” | A产品修改限writing-surface.css三行，不涉及同文件上下文工具、style.css、main/runtime/Bridge。B独立CSS由table-editing.ts导入。 |
| A，第10行：“自有fixture及不显示窗口的真实WK…宽/窄、900/760、深浅色…截图/实际paint未获证不声称观感验收通过” | 137有自有fixture、before/候选与production-after JSON和资源哈希；报告明确8组合、内部滚动和默认侧栏关闭，明确未取paint。本次仅审阅已提交证据，不称本人验证了几何或色彩观感。 |
| A，第11行：“不为纯间距常量增加镜像测试…保留原始字节与组件身份不变证据” | 未新增间距常量镜像测试，137任务/evidence独立；其报告记录build含tsc、原文与身份检查。本人未重复构建。 |
| B，第15行：“常驻工具只保留后插行、后插列与‘更多’；另外九项仍全部可达” | table-editing.ts:207–223、307–324保留11个原命令，2主入口加更多；9项菜单；delete_column禁用条件仍在325–328行。菜单role/AX名称未丢失。 |
| B，第16行：“鼠标与键盘均可操作…Option+F10…Esc回原编辑位置…关闭/取消不占历史、不夺走可信选区” | more原生button支持click与ArrowDown；菜单ArrowUp/Down、Home/End，Tab关闭；context-tools.ts现有Esc冒泡处理回view。本人探针确认Home和Esc恢复原选区且status/发布不变；已有菜单测试End亦本次实跑。未把合成事件称作物理键盘或AX审计。 |
| B，第17行：“绑定作者打开时的表格及当前选区/内容依据…源模式、readonly、composition、跨load/destroy、旧detached按钮或等待中目标变化必须拒绝或关闭菜单” | table-editing.ts:224–270捕获EditorState，315–320执行前复核身份、alive、isConnected、view.isDestroyed、view.editable及双composition守卫，并用所属NodeView的getPos；update/destroy关闭。即使observer尚未执行，同步click也受身份检查。本人探针覆盖选区移走再回来、进入源码旧按钮及destroy后同内容新runtime；未改投新光标/新runtime。readonly为静态路径核对，未额外实跑动态readonly场景；生产bare-CR只读使用独立runtime。 |
| B，第18行：“仍走既有applyTableCommand→runtime局部原文补丁…打开/收起更多本身不发布正文” | 320行继续调用既有applyTableCommand，parser/ledger/事务链未改。本人实跑现有菜单测试含BOM/CRLF对齐、Undo/Redo与composition拒绝；新增取消/过期探针确认原文、status、可信选区与发布不变。未声称覆盖所有命令/失败原子性排列。 |
| B，第19行：“窄窗下菜单不被工具横滚容器裁切…显隐不挤动正文、不遮挡上一段…真实隐藏WK检查” | table-menu.css将toolbar overflow设visible，菜单absolute独立纵滚；table-editing.ts:254–264取viewport与裁切祖先下边界交集、focusItem仅滚菜单；resize/外部scroll关闭，菜单自身scroll保活。138几何与底部先红后绿记录覆盖360/900宽及底部40/80空间。未独立重跑，不能外推任意嵌套/极端零空间，尚无本次可报告反例。 |
| B，第20行：“可新增同域菜单模块和独立CSS…不改parser/ledger/transactions/Bridge或资源政策…不…引入…依赖” | 产品差异限table-editing.ts、新table-menu.css及A正文CSS；依赖、锁文件、parser/ledger/Bridge均无变化。 |
| B，第21行：“保留全部有效旧测试与冻结表格golden…实际runtime/EditorView/公开DOM事件…先用真实失败反例” | 原测试仅首焦点期待与helper打开菜单适配，未删除冻结golden或断言。新增table-menu.test.ts使用真实runtime及DOM事件；138保留red/green和底部反例输出。本人未复演作者的历史红阶段。 |

## 第二轮计划核对

`typora-ui-round2-plan.md`第2项要求“局部间距”与“宽度对照另外记录”，本切片继承已确认900默认/760可选，未另建偏好系统；A报告局部gap和实际宽度，不以列宽变化冒充间距优化。

第3项要求“表格保留少量常用入口，其余行列/对齐/删除进入‘更多’；不删命令”，B保持全部命令、既有快捷入口和局部事务。计划中的代码许可层级、成功图片态描述控件属于“其余先核对”；本切片第3行已明确“有限实施契约”，A/B未承诺这些产品改动，不能把其未交付报为本切片missing。第4/5项技术导航及行内标记原型、主题/导出亦未纳入。未发现扩大产品范围；其他提交为契约、任务过程与验证材料。

## 本人验证及局限

实际命令（cwd为editor）：

```sh
node node_modules/vitest/vitest.mjs run artifacts/INK-REV-140/spec-probe.test.ts src/table-menu.test.ts
```

结果：2文件、4测试全部通过，exit 0，685ms。探针使用真实createEditorRuntime/EditorView、DOM click/keydown和公开runtime状态；仅用view取得投影以建立选区，未修改生产逻辑/私有计数器。源码位于被忽略的`editor/artifacts/INK-REV-140/spec-probe.test.ts`，等待管理者证据备份。

未执行make setup/install、make lint、make test、make editor-build、全量NativeReleaseCI或任何窗口操作。作者/管理者既有测试和几何证据仅作阅读资料；本次没有新增paint、原生AX、真实键盘/IME、系统版本或安装验收声明。动态readonly、全部跨load排列、任意裁切祖先以及所有历史/future排列仍为本次未实跑边界，不据此推断产品失败。
