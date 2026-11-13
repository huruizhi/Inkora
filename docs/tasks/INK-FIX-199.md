# INK-FIX-199：标题行首退格及上方空行删除

基线4e82ea0ac72f27ad5bf1b9ccf2145d87060cfd6b；独立分支task/INK-FIX-199-heading-backspace。
用户在build13截图反馈：光标位于标题“地方”起点，删除无效。按此前标题起点Enter插入上方空段的规则，Backspace应能逐次删掉上方空段并上移标题；文档首块标题则去掉标题格式而不删正文；有前一非空文本块时接回上一段。

## 规格与边界

仅折叠选区、root标题起点。先删文本选区的原行为不变；中文composition/settling仍由原会话和运行时保护。
根首块标题去格式，局部只删除ATX开/闭标记或Setext下划线，保留正文、marks、BOM、CRLF和范围外字节。
上方是刚插入的空paragraph时，一次Backspace只删除该段的已接受空行；再次Backspace可继续，最后才去标题格式。
上方是普通段落或标题时，接合正文，并将左标题的闭标记/Setext下划线保留在接合内容之后；完整目标doc必须相同。
嵌套引用/列表、非行首、非文本结构和未能唯一证明的事务仍沿既有规则，不扩大未知事务接受范围。

## 诊断与实现

使用Matt diagnosing-bugs流程；全文核读GLOSSARY、ADR-0004及既有194/195的源行/取消/保存边界。
新增真实公共runtime/DOM最小6例全部RED：根非空标题未去格式；标题接前段的replace被拒；1个空段仅投影消失而原文空行残留，3个空段的事务PM边界缺锚点。
三个假设分别是标题起点命令缺失、join的源码映射范围仅支持paragraph、刚插入空段与旧标题caret共享视觉位置；逐项证实。

block-editing增加标题边界命令：首块转paragraph，前空段仅删除其PM节点并保留标题光标。已有删除选区优先，IME守卫保留。
source-transaction增加有界headingBackwardPlan，先核完整目标PM doc，后按同次NativeRange/ledger核原文。
空段不能取max旧caret来代替其原文；从同次ledger唯一的insertion-anchor中证明其一/两次换行归属，不能借parse忽略空行就宣告删除成功。
局部去格式最初尝试整owner替换；连续删除后旧边界anchor重证失败，已改为仅删标题标记的最小patch，未放宽source-authority验收。
根文本接合在两个真实块范围内保留body原字节，完整parse(candidate).doc必须等于请求目标doc。混入范围外X的伪造事务保持原子拒绝。

## 文件

- editor/src/block-editing.ts：标题起点退格命令及键绑定顺序。
- editor/src/source-transaction.ts：标题标记定位与有界原文退格计划。
- editor/src/heading-backspace-runtime.test.ts：14项公开runtime/DOM回归；BOM/CRLF、ATX闭标记/Setext/marks、反复删除、UndoRedo、组合输入、选区删除和伪造事务负控。
- tests/InkoraTests/WritingInteractionHostlessTests.swift：2项真实离屏WK方法；原标题/空格/列表/中文输入31项保留；新增逐空段标题y上移、历史及实际prepareForClose检查。
- tests/InkoraTests/WritingInteractionHostless.sh：精确执行计数31→33。
- project.yml：本机候选build13→14，marketing0.1.0不变。
- 本任务及docs/evidence/INK-FIX-199：日志摘要/校验；原始输出、冻结基线与试错夹具均保留ignored artifacts。

## 实跑与诚实边界

`make lint test-editor test-ci`退出0，56文件1070项全过，tsc/Vite/Swift严格格式与发行脚本等既有smoke通过。
初次误用不存在的prepare-renderers包脚本，导致许可资源缺失/0测试；执行既有make editor-build后才取得6例真实产品RED，原始失败保留。
Native首次新夹具把Native解码元数据BOM当成Bridge正文，期望错误；修正为该层无BOM自有样稿，BOM原字节用DOM层验证，保留原日志。另保留一次夹具去BOM后误dropFirst删#的期望错误；已纠正，并不删除实际退格/历史/几何/close断言。
Native最终固定RED/GREEN与构建随后追加。无物理搜狗键盘、可见paint、VoiceOver或macOS14实机证据，不冒称完整体验已验。
未改Native产品、source-authority、Schema、Bridge、依赖、CSP/权限、网络或Keychain；未知事务拒绝和保存保护保留。

## 后续本机安装门禁

本机仍build13。build14候选需最终固定提交审查、Release签名/权限/离线资源及精确HEAD CI通过后，再待用户保存退出才替换。
不沿用build12强退授权；若关闭报错必须重新询问待保留内容。旧/新包ZIP及恢复目录私有备份、逐文件校验和两层证据备份后才回收本任务临时App。
未创建公开Release/tag/feed，不冒充正式签名/公证或真实编辑序列后的桌面关闭验收。

## 固定候选验证

真实离屏WK最终33/33、0失败；新增两项也经过实际document.prepareForClose完成，标题删除后的snapshot/save资格有效。真实DOM geometry证实每次删除空段标题均上移，未冒称paint。
新增14项runtime/DOM回归全部通过；全量56文件1070通过。原生夹具最终不带BOM，Bridge层BOM期望与dropFirst错误均已纠正，原始日志不删除。
基线build/editor已冻结为独立baseline.bundle，独立原生探针复跑待结算；不把并发资源重建时的早期结果冒称固定RED。
固定源码提交后使用Matt code-review的独立Standards/Spec两轴检查；审查者证据与作者1070/33明确分开。

## 固定基线与候选包结果

同一最终Native33二进制、相同最终新夹具，显式指向独立冻结baseline.bundle真实RED：原31项通过；新增2方法失败、23个失败断言（含6个旧unsupported错误抛出），prepareForClose也拒绝。冻结资源和当前候选资源SHA不同，详candidate.json；不采用资源重建并发时的试跑作RED证据。
固定源码09af68a827f7eca1be9568c2abcaa43efe0b8dcb的`make build-release`退出0；源entitlements重签后strict/deep、精确权限、离线bundle smoke、正式ID/macOS14/x86_64+arm64全部通过。
实际build14候选App资源再跑Native33/33、0失败；包内editor逐文件SHA与构建产物相等。无可见窗口，不把Native接口与合成keydown冒称物理键盘/paint。
原始编译日志保留既有隔离/Any转换警告；构建及Native/raw fixture均按SHA存证。等待独立审查和精确HEAD默认CI，尚未安装。

## 独立Spec发现的选区守卫补正

201在固定09af以公共runtime dispatch混合join+setSelection证明新增P1：PM caret移至后文而sourceCaret仍绑定旧接合位置，下一次X写入前段，snapshot还会成功。属于可调用公共编辑接口边界，不声称物理键盘路径可复现。原始固定首稿保留，候选09af不得安装。
作者补三个真正RED负例：去格式/接合/删除上空段分别混入偏离目标位置的Selection，均被接受而不该接受。
补正只在完整目标doc等于该已知命令时，再校验完整Selection.eq(expected.selection)，不符即原子拒绝；保留现有source-authority/全局拒绝语义，不把caret借给别处。
定向最终17/17通过（原14项+新3负控），真实RED/GREEN存SHA。作者未把审查者probe当本人测试；旧候选JSON/原始源码与日志保留。
新固定源码随后重新构建、全量及Native33，再交201限定复验；不沿用09af候选作为已修版本。
