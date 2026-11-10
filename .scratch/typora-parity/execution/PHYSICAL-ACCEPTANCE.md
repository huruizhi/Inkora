# 首阶段生产物理验收包

状态：用户2026-11-10明确“不验收14版本。继续推进”后恢复当前系统验收。桌面预检已通过，持互斥锁使用冻结UITesting bundle和唯一scratch副本；真实结构编辑/保存重开已执行，实体输入法按后续用户动作结算。M0可行性仍按038裁定，不重复撤回M0。下文关于“未启动/稍后”的文字保留最初准备时点，不代表本轮状态。

本轮后续决定：用户明确“不需要再重复测试”。A段重复实体输入请求已取消，不再按该段逐步要求用户复做；以下步骤作为历史协议留存，不是新的待答问题。已有证据按原范围采用，新bundle未追加的物理动作不伪称执行。当前新增结构桌面结果已经固化；临时样稿窗口已收起，UI锁已释放。

隔离bundle与文件位于 `/Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/physical-pr77-545e3a9/`，manifest记录每个文件、bundle SHA、原始BOM/EOL/字节长度及代码版本。App为真实生产代码7305b97的Release测试bundle；PR77 head545e3a9仅增加文档/证据，editor/src无差异。已做签名严格验证，没有启动。PR精确CI与main合并另以交付总表为准，不能把准备材料称为通过。

只有用户主动恢复配合时才开始以下批次。每批使用同一冻结bundle；开始前记录OS、输入法及版本、实体键盘来源、bundle/source SHA。上一轮原型或旧生产日志不外推到此bundle。记录“自动/合成、离屏WK、物理输入、正式文件”各自证据。

PR78仅增加组合测试/记录，当前main 1e1e456与PR77的app/editor/project.yml生产源码无差异。verification-main-1e1e456.json另行记录精确CI42695919576通过、原manifest/App/九个fixture SHA保持不变；没有重标旧App或改变其准备状态。108新增四格式离屏WK和Save As重开证据，仍不填入下方物理动作的通过结果。

## A：输入与历史（约5–8分钟）

打开隔离副本 `01-IME.md`，先核对manifest；管理者定位到 `Input here.` 后。用户用搜狗及Mac实体键盘连续确认两次中文，候选窗各停约3秒。管理者核对最终原文、revision及Bridge发布，再逐步Undo/Redo，不能出现中间拼音。接着选中“测试”直接中文替换，检查单历史与有向选区；候选Esc取消时同时检查屏幕与原始事件，不把上屏和取消混为一项。

主动源码区输入中文、显式提交、no-op往返，核对BOM/CRLF完整字节、caret、dirty及保存点。只在每一步确认当前选区正确后请求该操作；看不到窗口即先修窗口，不要求盲输。若出现bug，冻结该例raw/选区/history/revision与日志后停止相关路径，按最小反例修复；无关已通过例不反复要求用户重做。

## B：可写结构与保护邻接（约8–12分钟）

`01-IME.md` 中Wiki/callout/脚注两侧普通正文应可输入，保护raw保持只读；完整可视删除应拒绝并保留意图，主动源码修复可达。`03-Source-U.md` 应保留原文和诊断；作者显式修复或确认完整源码后按GATE004保存，不允许no-op吞未解决意图。`04-Mermaid-EOF.md` 是合法代码块：直接修改、Undo/Redo、保存均不补closing fence。

`02-Structure.md` 检查表格Tab/结构操作、任务checkbox与键盘、代码语言、Mod-K表单、outline定位和宽窄窗折叠。查找/替换框及链接框自己的输入/IME/撤销与正文历史隔离；可视查找不进入保护预览。检查每次定位实际滚入视口、焦点可见、Tab顺序和VoiceOver名称，不能用jsdom或离屏坐标代替。

## C：正式文件与本地资源（约8–12分钟）

仅使用此隔离bundle及fixture副本。新建/打开→编辑→Save/Save As→关闭重开，逐字节核对未编辑格式、BOM/EOL及图片SHA。用 `image 空格 %.png` 走选择文件、系统拖放和位图粘贴；确认取消保存、失败重试、首次资源发布、跨启动书签/授权撤销及缺失资源提示。PNG/JPEG/GIF/WebP的真实WK显示逐项记录，不以ImageIO或hostless PNG自动证据替代。

四种格式的隔离样本现已补齐，文件名保留中文、空格和 `%`。PNG 保持原字节，JPEG 由同 PNG 经生产测试同款 ImageIO 编码，GIF/WebP 使用 `LocalImageStoreTests.swift` 已有的精确 fixture 字节；脚本 `prepare-images.swift` 及 `image-fixture-verification.json` 与 SHA 均进入包 manifest。ImageIO 实际 decode 4/4，PNG/JPEG 为 128×128、GIF/WebP 为 1×1；这是格式与字节准备证据，不是视觉质量或真实 WK 显示验收。补充前逐项复核原有 fixture 和 App 全部文件 SHA，均未变化。

恢复确认需要隔离测试文档与会话；先确认未涉及用户正式App/文档，再执行该恢复场景。验证pending恢复的“恢复/稍后/放弃”、常驻banner与当前选区确认、保存失败后的资源保留、关闭重开。不能为了方便终止用户正式App或改动其资源目录。

## 独立剩余门槛

macOS14版本专门验收已由用户明确取消，本轮不执行也不作为阻塞；14+部署目标仍保留，当前27.2结果不声称14实测通过。正式性能预算及可见paint/物理IME响应另冻结输入、采样和阈值；现有Node/离屏WK数据只作对应层级证据。发布签名/公证属于后续直接分发门槛，不引入Mac App Store路线。

退出条件按03完整范围、canonical支持矩阵及07阶段门槛逐项结算。单批通过、自动测试数量或准备好bundle都不等于首阶段通过；失败保留原始记录，不修改oracle制造绿灯。
