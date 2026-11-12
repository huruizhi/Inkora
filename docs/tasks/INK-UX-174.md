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
