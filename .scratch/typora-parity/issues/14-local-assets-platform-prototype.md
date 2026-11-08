# 验证本地资源授权、迁移与失败恢复

Type: prototype
Labels: wayfinder:prototype
Status: claimed
Assignee: root / Paseo INK-PROT-011
Blocked by: 06
Parent: ../map.md

## Question

在 macOS 14+ App Sandbox 和离线 WKWebView 中，能否以显式文件/目录授权、文档隔离的原生资源 broker，以及可恢复的资源复制/Markdown 保存流程，满足[已决定的本地图片政策](06-local-assets.md)？

## Resolution criteria

用隔离文件与独立签名 Sandbox 原型验证实际权限，不使用普通非沙盒进程成功读取代替证据；不修改生产代码或真实用户文件，不把新图片编辑器作为本票交付。

- 验证只选 Markdown、选图片、选目录、拖放/粘贴各自权限，以及重启后的 security-scoped bookmark 恢复和 stale/拒绝访问反馈。
- 验证未命名草稿导入、首次保存取消/失败、成功保存、Save As、整目录移动、单文件移动和缺失资源；同时检查原引用字节、资源位置及恢复状态。
- 验证同名同字节与异内容目标、中文/空格/百分号路径、符号链接/越界、跨文档访问与取消加载；不能通过扩大任意路径访问来通过。
- 对“复制图片成功但 Markdown 保存失败”等故障注入记录创建/提交/回滚边界；原始资源与其它草稿不被误删。
- 明确最低系统与当前系统分别实际执行了什么；没有环境时保留未执行项，不冒称 macOS 14 已通过。

通过证据回写本票并供规格使用；发现政策无法安全实现时记录具体反例，由管理者按用户授权调整推荐方案。正式图片功能仍需通过 M0 架构门槛后单独规格和实施验收。

## 执行安排

用户已授权管理者按推荐自主推进。INK-PROT-011 先实现隔离原生文件状态/所有权journal与故障注入，并尝试真正签名Sandbox进程的非GUI读写探针。所有文件使用独立容器/唯一scratch会话，不访问真实用户内容；只新增 `prototypes/local-assets/`，无生产集成。

Host / Agent / Workspace：`srv_MEqRNkRW6fSx` / `1da3379f-18dd-414b-b036-f8124a95bb67` / `wks_3c98f8b2ad411c85`。分支 `task/INK-PROT-011-local-assets-platform`，固定基线 `36e636578798510d240b23520122c88578cf3fe5`；OMP GLM-5.3 / low，notifyOnFinish 已开启。

这是本票的首部分，不缩减上述完整验收标准。文件/目录面板、拖放/粘贴、书签跨重启和WK资源broker的实际授权行为不在该执行者本轮范围，继续待后续持UI锁与preflight验证；普通scratch读写不算Sandbox授权证据，无法无GUI运行Sandbox时明确留空。票据保持claimed，不能因首部分构建或数据检查成功而解决。
