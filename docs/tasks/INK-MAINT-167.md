# INK-MAINT-167：只保留本机最新 Inkora 部署

用户要求删除本机无用部署，只留最新。保留 `/Applications/Inkora.app`，
正式 bundle ID `com.huruizhi.Inkora`，0.1.0/build6。
本任务不修改产品、文档内容、源码分支或恢复策略；仅清理生成物与旧安装包。
分支 `task/INK-MAINT-167-clean-deployments`，从本机安装交付 d4976d3 分出。

## 清点与执行

- 先查 Spotlight /Applications，再递归清点项目、Paseo/Codex 工作树、归档、
  Downloads/Desktop、Xcode DerivedData、本机 CI 产物与已挂载卷。
- 共发现 25 个相关 app 路径，其中 5 个原本就在废纸篓，2 个在旧安装盘，
  1 个是保留的正式安装，其余 17 个为旧安装副本、构建、原型与测试 runner。
- 每个待移除目标均复核 Git 无 tracked 文件；检查没有运行的相关 app/Runner.Worker。
- 正常卸载两个旧安装盘（build3/build5），没有使用 force，也没有打开旧 app。
- 使用系统 FileManager.trashItem 将 17 个 app 和 22 个旧安装 ZIP/DMG 移到废纸篓，
  系统返回目标位置收据，39/39 成功。未永久删除、未清空废纸篓。
- 保留 4 个示例文档 ZIP；不删除任何源码、用户文档、恢复数据或测试源码。
- 对旧 LaunchServices 路径进行定点 unregister，重新登记唯一正式安装；
  未 reset/delete/seed 全局数据库，未改默认文件关联。

## 实际核对

- 原扫描范围再次完整扫描：非废纸篓内仅 `/Applications/Inkora.app`。
- 版本仍 build6；全部 app 文件 SHA256 与清理前完全相同。
- `codesign --verify --deep --strict /Applications/Inkora.app` 通过。
- 恢复目录逐文件 SHA256 与清理前完全相同；示例 ZIP 保留。
- 每个已移除原路径均不存在，系统返回的废纸篓目标均存在。
- 两个原挂载点均已卸载。
- 纯文件维护任务，不重跑产品测试/构建或 GUI，不启动/终止用户 app。

LaunchServices 边界：对 118 个旧路径发定点 unregister，其中 13 个返回非零；
垃圾回收后仅正式 app 及 4 条旧离线卷/卷内 app 元数据仍保留。
为验证可否定点清除，曾只读、nobrowse/noautoopen 短暂挂载废纸篓内旧镜像，
对有效 app 路径 unregister 仍返回 -10814，随后立即 eject。
这些离线元数据不对应现存应用或挂载盘。未为抹掉缓存而重置整个系统登记库；
不声称已经做过 Finder/Launchpad 可见检查。

## 文件与收据

本任务只新增本记录与 `docs/evidence/INK-MAINT-167/verified.json`（汇总结果）。
完整清点、原位置→废纸篓位置、登记结果及逐文件校验收据保留根项目：
`artifacts/cleanup/20261112-120430/`。
恢复数据的私有 hash 清单仅保留该本机目录，不提交 Git。
旧安装与旧安装包可从废纸篓恢复；没有创建新的可启动 app 副本。

GitHub Release 与远端文件未删除。未来重新构建可能再次生成测试 app；
本次收束的是当前已存在的本机部署与副本，不删除项目构建能力。
