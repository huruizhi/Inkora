# 验证本地资源授权、迁移与失败恢复

Type: prototype
Labels: wayfinder:prototype
Status: claimed
Assignee: root
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

首轮产物 `1a413b7` 已接收，执行者报告9项scratch场景及本机签名Sandbox的EPERM正例；管理者审核发现结果判定、会话隔离、唯一命名和回滚无引用证明的缺口，已立即交同Agent限定修正。首部分尚未最终接受，父票继续claimed；代码存在和报告通过不替代上述完整验收。

修正产物 `256c30edbfa9230b93b793e9780bd1923350328a` 的实际签名Sandbox探针层证据已接收：管理者实跑make check，10项已有scratch场景和8项判定检查通过，容器读写成功、同一外部fixture非沙盒对照SHA正确且Sandbox返回EPERM。原Agent已归档，工作区/证据保留。但代码审核发现staging后先写最终Markdown、再发布图片的顺序违背既定政策，且未托管相对图片源存在时Save As可能静默断链；现有正例不覆盖这些反例，不能据overallStatus=pass接受完整保存模型。

提交顺序与Save As由INK-PROT-013接续，GLM-5.3/high，固定基线256c30e；host/agent/workspace为`srv_MEqRNkRW6fSx` / `dad521e7-c0ac-4883-ab1e-8dd7f4b05f13` / `wks_15302ab6dfd393d7`，分支`task/INK-PROT-013-asset-commit-order`。要求资源先发布、Markdown最后提交，故障时旧Markdown字节不变、草稿/原资源保留，已发布孤儿如实记录；本票仍未通过。

原013执行者因GLM明确429限额终止后已归档，其Model.swift/probe未提交改动保留，同workspace由Codex GPT-5.6-Sol/high Agent `a61d140e-4132-4e58-ab01-fdab17e966f4`接续；notifyOnFinish开启。该交接不是新实现验收，完整状态见执行记录。

## 已接收的首部分证据

固定修正版 `a60b7b9a513f5949e83aa25ef9b2c99dfa7986e2` 已推送，管理者核实远端一致、干净，实际复跑 `make -C prototypes/local-assets check` exit 0：14项普通scratch场景、严格判定自测、签名Sandbox读写/外部EPERM与非Sandbox同fixture SHA对照，以及非法runID不写入检查通过。保存顺序为全部资源发布成功后最后提交Markdown；S11/S12保留旧文件与草稿/其它资源，S13并发缝明确标为模拟，S14覆盖未托管图片目标缺失/异字节/同字节。

执行Agent已归档，工作区/证据保留。本票仍claimed由管理者维护，不因为首部分成功而解决：内存journal不能跨重启恢复；图片识别仍为保守正则；NSOpenPanel授权、拖放/粘贴、书签跨启动、WK资源broker、路径安全完整矩阵与macOS 14实机仍须后续验证。M0的WK/IME专项由另一原型执行，不等于本票的资源授权/加载验收。
