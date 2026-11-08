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
