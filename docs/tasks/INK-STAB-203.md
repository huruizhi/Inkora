# INK-STAB-203：标题起点编辑事务契约稳定化

用户已接受202顾问建议并要求按建议推进。固定基线6b392fc6a2a50a3335b3c548390ee1c8774c1c29（build14）；独立分支task/INK-STAB-203-heading-edit-contract。
本任务不扩功能、不换ProseMirror、不建立第二套编辑内核；只迁移“标题起点Enter→逐次Backspace→继续输入”这一切片。

## 已接受的Interface与验证Seam

外部Interface继续使用生产SourceAuthoritySession.dispatch(transaction)及已有选择、历史、保存入口；不新增测试专用派发、内部getter或Facade。
1. 公开会话派发：输入真实PM事务，观察当前原文、完整PM/原文选区、历史操作、未解决输入意图和保存资格；覆盖事务契约，不证明WK/物理输入。
2. 已有公开runtime/DOM与Native/WK入口：保留原测试和真实输入/关闭准备流程；合成keydown与Native输入接口不冒称物理中文键盘和paint。
这沿用用户对202建议的确认，不再要求用户重复批准同一Seam。新测试不得读取private或依赖具体planner函数/调用计数。

## 固定反馈回路

先把201的“join＋偏移选区＋下一次X”写成公开会话行为测试：冻结09af应红、当前build14应绿；拒绝时原文/doc/完整选区/历史保持，保存阻断，随后合法输入只能写在原目标。
只有该命令实际红/绿稳定，才进行重构。原始旧代码及日志保留ignored artifacts，不能靠修改有效期望制造红例。
逐个增加正常标题序列对照，不批量预写未知接口测试；旧/新运行同一公开行为脚本，对照字节、双向选区、UndoRedo、拒绝意图及保存资格。

## 候选设计与删除条件

在现有会话内部集中标题契约：键盘命令与原生PM事务两个adapter共享一份标题操作定义；目标doc、完整Selection、原文patch及落点绑定由同一模块证明。
Runtime不需了解ledger/anchor，SourceAuthoritySession负责现有原子提交与回滚，不另建历史/保存机制。
迁移后删除block-editing中的标题结构规则、source-transaction中的标题起点重建/规划重复分支；标题末尾Enter、列表、技术节点等未迁移行为保持。
只增加转发包装、调用方仍须掌握旧规则、或相邻行为变化时，停止扩大范围并修正/回退切片；收益以调用方规则减少和真实旧分支删除衡量，不以文件/测试行数衡量。

## 交付门槛与停止条件

先公开会话反馈与旧/新差分，再完整既有回归/Native/构建及独立复核、精确HEAD CI；最后候选真实资源、当前macOS物理中文输入/可见光标/保存关闭旅程。
物理控制若仍不可用则保留候选，不安装、不扩大功能；不追加已取消的macOS14专门实机门槛。
未经用户保存退出不替换运行中的App；上一轮强退授权不复用。用户文档、生产Keychain、依赖、Schema、Bridge、权限、发布渠道均不在范围。
所有原始证据/工作树保留待两层备份；只解除本人借用依赖链接。此文为任务契约，不宣称已完成。

## 已实现的最小切片

- heading-start-edit集中标题起点的操作构造、完整doc/Selection匹配、原文局部patch与落点绑定；键盘命令和Native事务两个adapter共享同一个operation，不在调用方各建一份期望文档。
- block-editing仅注册既有命令，原headingBoundaryBackspace导出保留兼容；非空前段接合继续走PM原joinBackward，列表/标题末尾Enter等未迁移部分不改。
- source-transaction删除headingBackwardPlan、headingSourceParts、splitPlan的标题起点分支及入口对该分支的重复调用，只委托一次新契约。
- native-source-edit仅承载原有NativePlan/patch/EOL纯数据与函数，避免跨模块环引用；其旧函数和类型从原文件兼容re-export。没有新框架、依赖、历史或保存系统。
- 新契约返回绑定实际不可变目标doc及完整Selection的placement解析器；会话原子提交前消费该凭据，标题路径不再套用旧标量caret推断。类型区分旧标量和已绑定落点，不能混填。全局回滚/未解决输入意图/保护片段检查保留。
- source-authority仅增加通用凭据消费，不理解标题类型或具体行偏移；EditorRuntime/Bridge/Schema/Native产品接口不改，不增加private测试getter。

收益不是代码行数下降：外围两份标题结构知识已删除，修改一个操作只需改共享operation；落点证明及原文实现留在同一Module。不能据此宣告全编辑器稳定或扩展到所有planner。

## 本人实际反馈

1. 公开会话同一用例冻结09af真实RED（1项失败，错误接受join+偏移选区）；当前基线6b39真实GREEN。不是改夹具或旧源码造红。
2. 新增正常旅程，冻结基线与新实现各跑3项公开会话行为测试；20个检查点的原文字节、doc、完整双向PM/原文选区、stored marks、revision/dirty/history状态、保存资格和未解决意图完全相同，differential.json记录摘要。
3. 迁移中故意尚未接入会话凭据消费时，真实公开旅程在Backspace失败；接线后通过。该日志是未完成接线的过程失败，不冒充历史产品缺陷。
4. 初始严格类型检查捕获一个原list helper的宽NativePlan返回类型可能混填标量与凭据，限定标注其既有LegacyNativePlan返回类型后通过；未改list运行逻辑。原始错误日志保留。
5. 初轮make lint test-editor test-ci退出0，57文件1076测试；Native/WK33/33通过。最后仅将ownership校验恢复为先于选区拒绝，公开旅程及20点差分再次通过；最终固定源码全量/Native/构建随后结算。

公开会话测试不访问private，不检查内部planner调用次数；原有效测试全部保留。新增3项分别覆盖旧缺陷拒绝与继续输入、完整标题旅程、Native将caret落在标题前空段的另一合法形式。
所有原始日志与两份冻结源码保留artifacts/INK-STAB-203；tracked evidence仅摘要/SHA。构建Vite既有chunk警告保留，未伪报零警告。

## 候选而非安装

project.yml准备build15以区别已安装build14，marketing0.1.0不变。版本更改不表示允许跳过物理验收。
下一步固定提交独立Standards/Spec复核，重新构建及实际候选资源Native33；完整精确HEAD CI之后，当前系统隔离候选完成真实输入/保存关闭旅程才可安装。
若屏幕控制仍失败，将提供自有隔离样稿及可核对字节的短清单请求配合，不用旧build14测试代替新候选、不碰用户正式文档；不能完成则留候选，不安装。
