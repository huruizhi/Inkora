# INK-UX-174：标题创建的延后呈现

基线4d762fa（本机build7）。用户以Typora截图明确：输入#和空格后，#变灰且仍可见，
文字输入阶段不先切大字号；回车结束该行才呈现正式标题。
本任务改变创建标题的可视呈现时序，不改变Markdown标题语法或替用户补空格。
原文、语义投影、位置账本、保存资格、历史和composition保持既有契约；
原文中的#与分隔空白原字节保留，灰标记不得插入正文Text或污染复制/光标。
打开现有标题、菜单设标题不受新建输入时序影响；无空格的#文字仍是普通段落。
只使用自有样稿和不可见测试，不占屏，不替换正在运行的本机安装。


## 原因、实现与限定验证

回路：`pnpm --dir editor exec vitest run src/heading-entry-runtime.test.ts`。
准备既有离线renderer资源后，初始8例7失败/1通过，直接复现缺少灰标记/输入期排版。
首次未准备资源的0测试导入错误单独保留，不当作产品红例。

三个可证伪方向已先回报：立即语义重投影直接套用标题CSS、input rule单独提前转换、
composition收尾触发外观变化。纯ASCII同样复现，排除必须依赖输入法的解释；
保留canonical节点/输入规则，仅改变局部呈现即可全部通过，故无需改语法或原文会话。

新增HeadingEntryPresentation，以immutable PM doc identity为WeakMap key记录本地创建
标题的显示状态，范围绑定真实初始空段落、原文插入点和限定纯文本事务；不搜首次同文。
新建根级ATX1–6级在输入中使用正文大小，CSS伪元素显示原始#与分隔空白，分隔后为灰色。
伪元素不插入正文Text，不改PM doc、原文、选区或history；回车产生原来的分段事务后恢复标题样式。
已有标题/菜单格式化/完整粘贴按原规则显示。离开源码模式/销毁清理瞬时显示记录；
Undo/Redo依据原doc身份恢复对应显示，不额外创建历史步骤。
composition期只变装饰属性，稳定收尾仅同语义doc转交显示状态，候选Text不重建。

初版测试把既有Enter分隔误写单LF，而当前生产本来生成双LF；保留失败输出并纠正期望，
没有为呈现变化改写换行策略。另一同文fixture误在初始标题头输入，修正为显式移到末尾
并按Enter后创建第二标题；原错误输出保留，不称其为新回归。

自跑：
- 新entry11例通过，含灰标记/6级、无空格文字、既有标题、Enter Undo/Redo、源码no-op、重复同文归属。
- 初阶段4相关runtime文件121例通过（后增3例不与最终重复累加）。
- `make lint test-editor test-ci`：52文件**963 passed**，Swift strict格式、ESLint、tsc/Vite及CI脚本通过。
- Bridge独立16/16。
- `INKORA_WRITING_ARTIFACTS_DIR=$PWD/artifacts/INK-UX-174/native WritingInteractionHostless.sh`：
  **18/18**，旧16例全保留；新增真实WK level1/2 17px输入→34/25.5px渲染，
  灰色伪标记的computed content/color、#不在DOM正文Text、原文和关闭准备；
  新建标题中文composition保持candidate连接、一次logical revision、Enter恢复样式。
  沿用Safari公开500ms确认键保护，composition后的下一Enter在550ms后发送，未关闭保护。

修改文件：heading-entry.ts、editor-runtime.ts最小接线、writing-surface.css、
heading-entry-runtime.test.ts、既有WritingInteractionHostlessTests.swift和脚本，及本记录/evidence。
无新依赖，无语法/位置账本/保存协议变更；Vite既有chunk提示、Swift既有隔离warnings保留。
未运行全量Native/XCU/远端CI、物理IME、可见paint、VoiceOver/macOS14；隐藏WK不是上述验收。
本机仍build7，未新建.app/替换安装；尚待固定代码复审与交付。


## 行内格式后空格的限定补正

根新增第12个公共runtime回归：输入# **加粗**后再输入空格/尾部，原文字节正确，
但entry class丢失提前渲染。原12例11通过/1失败输出保留inline-body-red.txt；
独立Spec也在原固定aec23e2自证，不把根结果代作其自跑。
原因是SourceAuthority在接受空格时会给同一个可变Transaction追加removeMark安全步骤；
原先在接受后读steps.length会把一次用户输入误认作多步格式操作。
改为接受前capture原始有界输入事实，接受成功后才应用外观收据；
没有放宽单文本/同owner资格，不干涉SourceAuthority附加的有效安全步骤。
限定3文件49例通过。新增真实WK strong末尾空格外观/原文/Enter例，既有18例保留。
完整Web/CI/lint复跑52文件964通过，Bridge16通过；Native19结果另记。

初稿evidence末尾空白引发固定range diff-check的工具警告，已只规范化末尾空白，
原始输出继续保留ignored artifacts；不改删任何失败断言或产品日志事实。


## 补正固定验证

固定产品512ad4e41660355fe14dd6a7db6fa0c2672fa2a9。
完整`make lint test-editor test-ci`实际exit0：52文件964例；Bridge16例。
真实后台WK **19/19、0失败**，新增strong文字末尾空格始终17px/灰标记，
Enter后正常渲染；旧18例全部保留，关闭准备成功。
同域final-full-checks.txt、final-bridge.txt、wk-nineteen-green.txt留完整结果，
原18例与早期失败输出不删除，不重复累计作者/审查者结果。

最终固定两轴复审另记175/176，原首稿P2必须保留并追加后验关闭，不改写历史。
任务开发与限定验证不等于安装：`/Applications/Inkora.app`仍为原build7，
本轮无.app构建、强退、替换或用户文档操作；可见paint/物理IME等仍未验。


## 两轴独立结算

Standards175：固定首稿与补正后验均hard 0、possible 0；只静态检查。
Spec176：首稿1项P2（strong空格提前显示）在固定512ad4e独立反例与12项entry复验后关闭。
首稿/task逐字保留，仅追加后验。Spec另一个paste负例在base同样拒绝，未当作本次引入问题。
审查者未运行全量/WK，根964/16/19只作外部证据，不算其自跑。
开发与限定复审完成，无剩余本切片阻断finding；本机部署和物理/可见验收仍未执行。


## 同一标题正文行内格式的显示连续性

最后补公共toggleMark对照：# 标题输入态中选中文字加粗，原实现因addMark不是单文本
事务而过早清显示；13例12通过/1失败输出body-format-red.txt保留。
外观收据现在也可由已接受的同一根heading正文行内格式延续：要求节点markup不变、
根节点数不变、其他每个兄弟节点eq且sourceStart之前原文相同；
Enter分段/级别或块类型变化/其他块编辑不继承。只有原先限定文本输入可首次创建此状态。
这是显示状态连续性的证明，不扩大SourceAuthority输入资格、不发内容或历史事务。
13例green保留；完整最终计数及固定后验另补。


### 最后创建收窄守卫与结果

行内格式补正后首轮完整lint被TS18048阻断：创建分支的step类型无法从闭包外plain判断
静态收窄。已加显式`if (!plain || !step) return`，使“只有限定文本输入可新建entry”
在该分支再次明示，未放宽条件；该次失败输出保留creation-typecheck-red.txt。
再次完整自跑：52文件**965通过**、Bridge**16通过**、真实WK**19/19、0失败**。
这些是最终代码对应结果，见last-full-green/last-bridge/wk-last-nineteen-green。
Native既有全部case保留，未改有效断言、未用旧19例输出充作新代码结果。


## 最终固定交付

受检产品716c5131252ab1311961fc64c4b7b6a9cfc4a2c5。
175对最后行内格式延续与创建守卫的限定静态后验均hard 0/possible 0；
176对行内格式延续固定13例通过、最后单行创建守卫静态核对保持结论，原P2关闭。
两轴首稿与各阶段追加完整保留；没有将根965/16/19说成审查者自跑。
产品至此固定，后续仅报告和本记录，不改app/editor/project内容。

开发/限定复审无剩余阻断；本机仍build7，本次呈现调整尚未安装。
临时依赖链接仅清理本任务自建项，源依赖不动；worktree/原始日志/复审探针与副本保留。
