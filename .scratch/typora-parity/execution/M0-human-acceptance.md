# M0 真实 WKWebView / 中文输入人工验收

当前状态：用户暂缓031真实WK/物理搜狗验收；030冻结范围自动检查已通过，M0未通过。下文保留旧版本实测历史，不能替代新bundle验收。

本记录用于[原型票11](../issues/11-incremental-fidelity-prototype.md)的第五项门槛，不是正式产品验收。2026-11-09 用户解锁并配合物理键盘，已在以下固定版本完成本轮真实WK/搜狗输入法局部检查。可视组合撤销暴露中间拼音，判失败；M0仍未通过，已派025修复并保留修复后真人复验。

## 固定产物

- 集成分支：`task/INK-PROT-008-m0-integration`，HEAD `5fbeb109ac5a4158b50014b39b3864163ae8625a`。
- 工作区：`/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-008-m0-integration`。
- App：`editor/prototypes/fidelity/native-host/artifacts/FidelityHost.app`，bundle ID `com.huruizhi.Inkora.FidelityPrototype`。
- HTML source SHA256：`c86390037282e71e4187aaea46fe92354f12c669373f3d4c1be69d2287c81090`。
- HTML bundle SHA256：`df25ee909a326fb87a74f2b5187b8c7c2cf01553593102a0261985260cab8373`。
- source/bundle script SHA256：`a60f78cb3f19c0099477955ce037f3fa6effe9ce78d1eca79030a34120932080`，脚本字节一致；CSP只在副本注入。
- observer SHA256：`2aa57f6906dd5afe0dd9a9e3bd4ad8d149f4534afd25e7d754632d66eb68696d`。
- [本机构建清单](/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-008-m0-integration/editor/prototypes/fidelity/native-host/artifacts/build-manifest.json)。Info/HEAD/hash与清单独立核对通过，ad-hoc签名通过；未据部署目标宣称macOS14真机通过。

旧014日志属于旧HTML，不能作为本版本运行证据。023/024合成信号只证明只读诊断与操作守卫，不证明系统IME。

## 启动与会话所有权

由管理者在用户解锁后先重新预检，再以前台可执行文件持锁启动：

```sh
cd /Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PROT-008-VERIFY
INKORA_UI_LOCK_TIMEOUT=30 scripts/ci/with-ui-lock.sh \
  scripts/ci/ui-preflight.sh desktop \
  editor/prototypes/fidelity/native-host/artifacts/FidelityHost.app/Contents/MacOS/FidelityHost \
  > editor/prototypes/fidelity/native-host/artifacts/M0-HITL-runtime.log 2>&1
```

包装器会话在整个验收期间保持存活；App正常关闭后才释放锁。记录本次PID、实际系统版本、当前输入源以及清单哈希。只操作隔离内置样稿；输入固定测试词，日志由管理者读取。

## 人工步骤与证据

1. 用户用物理键盘在可视正文输入“中文测试”。观察候选窗或marked text，以及observer的真实compositionstart/update/end、组合期isComposing/combined composing状态；只有直接插入中文或字母不足以判过。
2. 候选期间观察模式/保存/历史按钮处于保护状态，组合文本和选区保留。上屏后用Undo/Redo验证内容及光标恢复，记录一次撤销是否错误暴露拼音或中间候选。
3. 主动进入源码，在相同文档中重复真实中文组合。组合期保留源码草稿、模式与选区；上屏后提交回可视，Undo/Redo核对内容锚点及字节。记录sourceComposing与combined composing，不把PM visual单一标志当作源码状态。
4. 在可视与源码往返后建立原型内存保存点，继续编辑并核对dirty、保存点和撤销；组合期间保存守卫保持。此处不是NSDocument磁盘保存证明。
5. 用户审阅正文与保护片段共存、局部修改的原文差异、源码仅改格式的dirty，以及含混输入的保存阻断和主动修复。记录具体操作/可见结果，不以演示按钮数量代替体验。
6. 正常关闭本次App，确认前台进程及锁结束；若临时切换输入源，恢复步骤1记录的实际输入源。

每步分别记录PASS / FAIL / NOT_EXECUTED、用户可见现象及日志时间段。真实失败保留并交回修复；未取得候选/marked text与真实事件、用户审阅前，11保持claimed，12不锁架构。

## 当前结果

| 层级 | 状态 |
| --- | --- |
| 最终组合非UI检查、只读observer与签名构建 | PASS，固定上述HEAD/hash |
| 本版本真实WK运行 | 本轮输入/模式/历史/内存保存点实际执行；有明确失败 |
| 系统中文IME与物理键盘 | 用户确认搜狗；两区真实组合已记录；可视Undo暴露拼音FAIL |
| 用户交互审阅 | 完成本轮指定输入，不代表整体审阅通过 |
| 正式产品磁盘保存/资源权限/最低OS | 独立阶段门槛，未由本原型证明 |

## 2026-11-09 本轮实测与失败交接

用户确认本轮使用搜狗输入法并以物理键盘完成两区上屏。桌面preflight通过，008固定App以前台PID52179、包装器PID52173持UI锁运行。初次用户没看到窗口，经AX Raise并回到编辑区域后继续；实际用户在保护块后末段输入，非最初定位的第一段。

- 可视区seq24–74：compositionstart/update/end、insertCompositionText/insertFromComposition及isComposing=true真实记录；组合期snapshot composing=true/saveDisabled=true。最后为“中文测试”，revision23/past23。Undo一次回“中文”，再Undo出现“中文ce'shi”（revision25/past21/future2），明确FAIL；Redo两次恢复。不得将23条中间事务当作正确用户历史。
- 源码区seq81–222：含一次取消组合，随后上屏“ 源码验证”；组合期sourceComposing/combined=true，revision27/past23不变。提交revision28/past24，PM caret75/raw179；Undo回caret70和“中文测试”，Redo回“中文测试 源码验证”。原文字节diff仅增加空格及四字。
- 内存保存点dirty=false，Undo dirty=true，Redo dirty=false；不是NSDocument磁盘证明。
- Cmd+W/Cmd+Q未关闭最小宿主；管理者核对精确PID/路径后SIGTERM，仅终止本次App，包装器exit143。已检查PID52179/52173均不存在，UI锁目录已释放；不记正常Quit。未由管理者修改输入源/系统权限。

原始272条运行记录、构建清单、SHA及详细实际AX现象保存在025准备提交`6f35866306a13bd5bcbbf6070f8bb739b0d30e8b`（分支`task/INK-PROT-025-ime-history`）的`editor/prototypes/fidelity/{IME-HITL-025.md,ime-hitl-025-runtime.txt,ime-hitl-025-summary.json}`，原始log SHA256=`f171c649dcf8a6dedc99b39bffd596434c088694d030ece991a6262e13af8176`。初始材料捕获时输入法待确认；本段及管理者给执行者的补充消息记录用户随后确认“搜狗”，不倒改原日志。

待验证：025自动回归及独立复核、修复后的物理键盘撤销/取消/替换与组合期操作矩阵、用户整体审阅、最低系统/正式磁盘等。原型票11保持claimed，架构票12依赖不解除。

## 025修复后待复验产物

008现HEAD=5bde76bab9b2bb74839fc7be99935b97d8125c66，已推送；管理者独立旧HTML红/新HTML绿及原型、ledger、selection、native、fixture矩阵通过。仅证明自动层；上述真实搜狗运行仍属于旧5fb，不能改判为修复后通过。

新宿主同路径，baseline5bde76b；source SHA256=23730ee34cc06c708c14f7112a4dfb39cd0d0d0898831e354003b2f8764586ff；bundle=df2b8056f176d260777ed4b97ef68d1978ceb46bc6524867b8464fb355d619e5；script=c1d32d4fdc35115036b13105d84c9ac3f063f2bedeba69d0fc98060d8d916d16；observer仍2aa57f69…b68696d。native-host verify/签名、manifest/Info/HEAD及source/script核对通过，新App尚未启动。

已询问用户现在或稍后是否可配合约2分钟物理复验。至少连续两次上屏中文/测试，Undo/Redo只跨完整会话、不露拼音；再覆盖取消/no-op、选区替换、源码历史/保存点与组合期动作。最小2分钟步骤不缩减完整门槛，未覆盖项如实待验收。025按PM composition元数据分组，自动重放给定ID不证明真实WK元数据时序。

025专用workspace及其他28个完成workspace已备份后归档以清理侧栏。025三份冻结真人材料和新IME-HISTORY-EVIDENCE已进入008；旧路径是历史引用，恢复方式见M0-dispatch末节。

## 025修复后的实际搜狗复验（有新发现）

已实际启动上述5bde版本并由用户物理搜狗完成两次上屏。composition seq98–127为中文、136–156为测试。运行含前置48条普通输入/删除及后置6条普通空格/删除，按实际轨迹保留。composition分别结束时past49、50，各是一条历史；管理者先Undo6普通编辑，然后Undo2会话，末段中文测试→中文→原句，无中间拼音；Redo2回完整中文测试。025目标本轮未再出现，但不代表全部IME矩阵通过。

新发现：revision77/78/80/81等恢复点pending=false、无语法边界问题，却保存被补丁重解析等价错误阻断。随后Redo6普通编辑，revision87/past56/future0、caret70及用户最终中文加空格全部恢复，blocked=null；未改源码或点修复来掩盖异常。原始203条记录与6个blocked snapshot已冻结到026准备abd4c58，见其IME-RETEST-026.md/raw/summary文件；原始log SHA=4f2befce2dc99ec3a3dd14e946b05d32c092e1ddb22f3595144e92dfc7089b89。保存资格异常的内部根因需诊断，不凭AX表象直接清错误。

本次App精确PID79074已SIGTERM，前台包装器session38883退出143，进程/锁均确认释放；不是正常Quit，也不涉及用户文件持久化。026已派独立非UI诊断，用户本轮无需继续操作。取消/no-op/选区替换/完整组合期动作、真实修复后保存资格、最低OS与整体审阅仍未全部通过；M0/11保持未通过。

026首轮186d自动修正尚未接收：独立反例显示失败后直接Undo仍保留当前操作错误，虽已恢复安全文档。已交同026workspace限定补正，没有启动新宿主/要求用户继续输入。008仍5bde，首轮026不得当作新的通过产物。

## 026最新接收与真实WK普通输入结果

当前代码ea63941a6ca320c5aa888eb18263c870fb361846，source7c1fa47b665f60b42fdb04b2f495ad8786baa2058107eac32298b33e2c8e9577，bundlecec18aebe609813eac526967df50c191bb359695784b06fd78c3410d11190a95。原Paseo008目录观察不再存在，已从同提交在 /Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PROT-008-VERIFY 重建签名宿主，保持integration分支且不增加侧栏workspace；以此为当前启动目录。

管理者独立旧红/新绿与矩阵通过，继而真实WK普通CUA输入测试通过：X之后拒绝Space、直接Undo可save；保留future拒绝后空Undo不清错误，直接Redo可save；pending缓冲Undo clean/Redo pending保持资格，最终内存保存点dirty=false。这不是搜狗物理输入、候选窗或磁盘save验收。22条运行记录和逐步AX结果冻结在027准备84adcab的INK-PROT-026-WK-EVIDENCE.md/raw/summary。PID87910已SIGTERM，session44623退出143，锁释放。

普通尾随Space依然被拒，正确光标原生输入alpha/space/beta丢空格为alphabeta。027在独立工作区自动修正这条基本连续写作路径，暂不再占用用户输入时间。最新物理IME组合取消/替换、用户整体审阅等门槛仍待集中验证，不因026局部修复宣布M0通过。

027交付7607079尚未接收完整闭环：连续字词空格测试通过，但停在合法尾随空格时保存和主动源码均受阻；候选本身已可安全解析重开。已由两名只读委员比较统一原文/编辑投影边界及候选方案，不再让用户重复复验仅覆盖连续输入的子集。当前008仍ea63941，本轮没有启动新的App，也未追加人工操作要求。

028共识已收敛、029纯数据判据已冻结，030一个隔离原型正在按新边界实现；尚无其真实WK/物理IME证据。不再要求用户逐条验证临时staged小补丁，待完整自动主链/负例后固定同一产物集中验收。旧5fb/5bde物理搜狗、ea普通WK仍只支持各自固定版本，不能外推新核心通过。
