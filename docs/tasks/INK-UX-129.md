# INK-UX-129：侧栏委派与集成管理

## 基线与目标

当前生产基线`main@30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。用户要求完成Typora方向开发，并明确要求由Agent实现；随后补充标题同行、默认隐藏/移开5秒、可选统计、先正文让位再出现侧栏动画。执行以[完整契约](../design/typora-sidebar.md)为准，不能按当前草稿重新定义完成。

## 已做的管理动作

- 保存初始产品草稿为`466d351`，并冻结包含用户四项追加要求的交接提交`bf8f7e5`；均明确为未完成候选，未合main。
- 通过Paseo创建三个独立工作树/执行Agent，已发现provider/model能力后使用Codex Sol high；无预设profile可选，使用已发现配置。
- `INK-UX-130`：原生目录/授权/搜索/版本证明；分支`task/INK-UX-130-sidebar-native`。
- `INK-UX-131`：Web侧栏/统计选择/5秒显隐/两阶段动画；分支`task/INK-UX-131-sidebar-web`。
- `INK-UX-132`：真实标题行、文档窗口与保存关闭、位置导航及生产接线；分支`task/INK-UX-132-sidebar-integration`。
- 文件归属互斥，接口变更须协调；不让执行Agent再分派子Agent，不安装、不PR/merge、不占屏、不各自跑全套CI。执行句柄与工作树对应关系保留于本地`artifacts/delegation/agents.json`。
- A/B初次运行因provider Bad Request终止；核对其工作树与状态后在原Agent恢复，均已报告恢复实现。C始终运行，无重复启动。错误保留，不作为产品测试失败。
- C先交付解阻提交`348d757`（main可选链修复，作者报告tsc通过），管理者已fast-forward到该提交；没有越界替Agent继续修改产品。

## 独立验收

已建立[逐项验收矩阵](../reviews/INK-UX-129-acceptance-matrix.md)，覆盖截图功能和四项追加交互的15组证明义务。初始全部未证明；Agent回报与绿色数量不能替代真实生产路径、状态及失败反例审查。

管理者此阶段仅核对git/进程/已结束测试结果、保存草稿、编写契约、分派与协调。尚未运行新的全量测试、App、GUI、XCU、物理IME或macOS14专项；不能宣告功能完成或验收通过。

## 剩余事项与风险

三执行任务仍在运行；待固定SHA交付后组合、独立检查、相称回归和精确HEAD默认CI，再按既有授权交付并只保留正式安装。主要风险为：标题行Native命中区域、读取后URL重开TOCTOU、异步目录/搜索迟到、dirty源码关闭取消、raw定位与动画期间输入稳定。风险必须实际验证，不能靠缩小目标回避。

管理分支`task/INK-UX-129-typora-sidebar`保留为集成分支，目标保持active。Agent与workspace仅在固定SHA及报告备份、管理者确认后两层回收。
