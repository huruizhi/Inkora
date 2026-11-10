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

## 组合审查与限定补正

固定产品`d3edf8803c661d1fb2dbebf9e8abdd826720f69d`已吸收A/B/C交付。管理者实际运行`make lint editor-build`及`tests/InkoraTests/SidebarNavigationHostless.sh`，均退出0；后者4/4，通过真实但始终不可见NSWindow/WK的标题顶沿、hit-test、窗口转交和外改拒写接缝。日志在`artifacts/delegation/root-combined-{build,navigation}.log`。不能外推真实系统面板或完整窄窗动画。

两名独立Agent完成固定diff审查：[Standards](../reviews/INK-REV-133-sidebar-standards.md)发现完整正文经独立定位通道传输的协议硬偏离；[Spec](../reviews/INK-REV-134-sidebar-spec.md)发现关闭确认后打开过期目标、普通编辑令目录扫描/搜索静默丢回包、dirty目标普通卡片被额外限制、窄窗侧栏与正文重叠。前两项有独立后台反例，后两项有静态生产路径/尺寸推导，均未冒称实机观察。原报告已原样吸收，结论仍不通过。

已向原执行Agent分派限定补正：A修异步绑定及受限二次文件验证；B修共享布局宽度；C修转交前重验、普通卡片复用、正式定位协议及隐藏WK几何。协议扩展决定同步于交接契约；不靠扩大“纯UI”豁免掩盖正文旁路。补正未交付前不合main、不替换正式安装。

A的Timer安装线程补正`554d50c`已吸收为`140438c`；管理者独立重跑`tests/InkoraTests/SidebarHostless.sh`，15/15、0失败，日志`artifacts/delegation/root-sidebar-timer-fix.log`。该专项证明有限线程/生命周期行为，不代表上述审查问题已关闭。后续仍须固定补正SHA复审、组合门禁与精确HEAD CI。

## 集成执行通道恢复

2026-11-11，原C在原生8项及Web定向137项已结束后连续两次provider `Bad Request`。管理者实际核对其状态`error/activeTurn=null`、无残留132测试进程；没有按观察超时重启测试。原工作树10个修改完整保留，另冻结binary patch，SHA256为`7367dca931cdecf416cdcee657aa064ea42e96d70cf03100cde245a2c92149ef`，源HEAD为`e18d8d0e9bee72282b0668c5c645ae355a64f4b6`。

新增独立`task/INK-UX-135-sidebar-integration-recovery`从组合`cb14288`承接该精确patch，apply前检查通过；原作者日志复制至新工作树`artifacts/inherited-INK-UX-132`并注明借用证据。新Agent仅完成同一范围的检查、必要补正、文档及固定提交，不重写产品或缩小原要求。原C分支、未提交修改和证据先保留，待新提交与远端备份核实后回收。此provider失败不属于产品测试失败。
