# INK-PROT-031：原文权威原型运行时验收

固定原型提交：`493e2b7cdbe982da02f4747e89a0cf52df3a770f`。
入口为 `editor/prototypes/source-authority/PROTOTYPE.html`，SHA-256：
`4b8a2a3d51071ce6a5e6456f48c86f65f88d0786253f4959c768bddfc2ceca99`。

管理者已独立重跑030完整自动矩阵（页面11组、集成10域）及四条原始红回归：CRLF源码no-op、未提交草稿旅行、锚点移动和compositionend后末次事务，全部通过。自动证据不是WKWebView或物理输入法证据。

## 宿主适配

只读observer兼容旧 `source-draft` 和新 `textarea#source`，记录来源统一标记为source-draft，避免误识别旧页面同名按钮。新控制器额外记录当前原文、保存点、raw选区、源码草稿和保存资格；不驱动编辑、不合成输入事件。原型仅使用验收样本，日志写本地。

实际运行：旧 `observer-check` 与新 `source-authority-observer-check` 均通过；新检查包含重复snapshot不改变控制器/DOM和源码composition事件路由，但事件为synthetic，不能证明真实IME。

## 运行规则

用 `make verify ENTRY_HTML=<绝对入口路径>` 固定唯一bundle；核对manifest、Info.plist、源/副本/script/observer SHA和实际基线。CSP只注入副本，脚本字节必须保持一致。遵循项目UI锁与desktop preflight，前台运行二进制直至验收结束，不用立即返回的open绕过锁。

普通CUA输入只验证WK普通输入与状态；真实中文输入必须由用户物理键盘完成。验收至少包括：连续两次搜狗上屏、取消、选区替换、源码输入与往返、内存保存点、Undo/Redo；候选窗及composition事件需分别记录。Save仍是内存保存点，不是NSDocument磁盘保存。

## 当前状态

宿主适配自动检查已通过。新bundle真实WK运行、物理搜狗、NSDocument/Sandbox文件流程及macOS 14实机尚未执行；待后续附记实际结果。不宣告M0或生产架构采纳。

030执行Agent及Paseo工作区均已归档：328文件逐字节备份验证及Git bundle校验完成，备份索引累计34个工作区。当前031为独立本地worktree，不新增Paseo侧栏行。

## 构建与预检实测

宿主实际构建基线为 `1c586967039c2b03b2584a901a3afa077ee17fa7`，后续本记录提交只添加验收资料，不改变该构建的代码。`make verify ENTRY_HTML=<031绝对入口>`通过，ad-hoc Hardened Runtime签名及strict验证通过；Info、manifest、入口源/副本和observer实际文件哈希一致，CSP注入只改副本，script字节相同。

- 入口源SHA：`4b8a2a3d51071ce6a5e6456f48c86f65f88d0786253f4959c768bddfc2ceca99`
- 副本SHA：`7aaa2e7f7ff79104c01bf378dd79c959a084ba7a14ce480f82a978e26c23c807`
- observer SHA：`073c1a46640c0855d7ca2c73068299519cc1faac9403de4536b7f4b906556950`

`scripts/ci/ui-preflight.sh desktop`实际退出78：屏幕已锁定。没有启动App，没有取得或遗留UI锁，没有投递物理键码或改系统权限。已向用户请求解锁并确认可配合；必须待明确回复后再做依赖物理键盘的步骤。

结构化证据见 `INK-PROT-031-evidence.json`。未重复运行无改动的生产全量测试；本次只读observer新旧接缝检查、JS语法和diff检查均已实际执行。

## 用户暂缓

用户明确选择“稍后再做，先保留当前进度”。物理搜狗/WK运行验收暂缓，不启动窗口、不创建执行Agent；原型493e2b7、宿主构建基线1c58696及上述实际产物哈希保留。恢复时先重新运行desktop preflight并检查产物哈希，再在持有UI锁的前台宿主中验收；需用户再次明确可配合，不沿用之前的即时可用状态。

自动层通过结论保持，真实WK、物理IME及M0结论不变。031本地验证目录与忽略的构建产物保留，执行Paseo工作区已回收，无新侧栏行。

## 解锁后的本轮实际运行

用户解锁后，desktop preflight通过；管理者在项目UI锁内前台运行固定宿主，bundle仍7aaa2e7f7ff7。完整日志冻结为INK-PROT-031-runtime.txt，摘要为INK-PROT-031-summary.json。

- 真实WK普通输入：a后输入Space、内存Save、主动源码no-op、新epoch重开、隐藏空格后续b、Undo/Redo，字节、选区、dirty和保存资格符合目标。
- 物理中文：最后两个实际中文会话上屏“中文”“测试”，中间有一个用户输入的普通Space。Undo顺序为测试→Space→中文，Redo逐项恢复；没有暴露中间拼音。此前12条试输入/删除历史保留，不将其抹除后伪称整次操作只有两条历史。保护数学原文保持，安全点saveEligible=true。
- 选区可见替换：测试变为替换；替换前还有一条删除状态，不能据此证明替换已合为单次Undo，也不能在缺少实际按键证据时直接认定为内核故障。
- 两次取消尝试的日志均为insertFromComposition确认“取消”，并非空结果取消；因此取消/no-op/future保护的物理证据未成立。用户最后表示“测试正确的 继续推进”，记录为体验确认，不改写日志，也不反复请求同一操作。
- 本轮没有源码区物理中文事件。后续源码检查由CUA输入ASCII source-check：草稿保持当前原文及revision/history不变，dirty草稿Undo拒绝且保留；Apply形成revision75/past18/future0，Undo76回原文、Redo77恢复，内存Save后revision77/past18不变且dirty=false。不是源码物理IME证明。

最后状态已核对当前原文等于保存点，保护片段字节未变。管理者核实可执行文件绝对路径后停止自有PID31436，前台session43410退出143，UI锁释放，无验收宿主遗留。本次仍不证明NSDocument磁盘写盘、macOS14最低系统或M0全部门槛；后续开发可以推进独立模块，架构采纳与生产内核迁移不据此宣布完成。
