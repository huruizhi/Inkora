# INK-DIAG-208：验收交接

**v3 尚未物理验收，禁止记为通过。** 用户此前“全部通过”仅授权继续；原 result.json 的 passed=false 保持不变。

现场观察（2026-11-14 11:34–11:35，UTC+8）：主机 RayHudeMac-Mini.local／RayHu的Mac Mini，macOS 27.2（26B123）；本工作区初始 clean，HEAD `ec8bd6740483d65b24c76589e8f4056f57738df9`。管理者配对 serverId=`srv_MEqRNkRW6fSx`、workspaceId=`wks_e5608b27a030b9a9`，该 ID 映射来自交接，未独立查询服务。

候选产品源 `afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe`。v3 隔离包在 `build/AcceptanceDerivedData-v3/Build/Products/Release/Inkora.app`（203工作树），0.1.0/build16，ID `com.huruizhi.Inkora.UITesting`；两候选包所列5个 editor 文件哈希实核一致。正式 `/Applications/Inkora.app` 实核仍 build14，不能混用。自有样稿哈希仍等于初始值，未达期望值。

历史引用：[软件摘要](../evidence/INK-STAB-203/build16-software-checks.json)记1080编辑器、35 WK/Native通过；[206](INK-REV-206-heading-space-standards.md)/[207](INK-REV-207-heading-space-spec.md)记P1有界关闭。归档 CI 43499742784 对应上述精确HEAD成功，UI步骤跳过；本任务未重跑或联网复核。

当前阻塞：真实中文、可见光标、保存退出及重开未执行。历史记录曾启动候选并锁屏；现场 ps 被拒、CGSession入口不存在，当前进程/锁屏未知。

下一步：
1. 人在上述Mac核对隔离候选，按[原PLAN](/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-STAB-203/artifacts/INK-STAB-203/acceptance-v3/PLAN.md)完成并报告实际操作。
2. 管理者另核磁盘字节、精确路径退出及同路径重开；确认前保持未验收，不合并、不安装。
3. 保留旧失败现场、原证据和工作树待双备份；不追加macOS14实机门槛。
