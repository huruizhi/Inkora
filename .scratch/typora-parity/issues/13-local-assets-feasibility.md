# 核实 Sandbox 下本地图片访问与迁移约束

Type: research
Labels: wayfinder:research
Status: claimed
Assignee: Codex 10924b8b-564b-48fc-81c0-2e8df68ac355
Blocked by: None
Parent: ../map.md

## Question

当前 macOS Sandbox、NSDocument、离线 WKWebView 与资源 scheme 约束下，文档相对路径图片的访问、拖放/粘贴导入、未命名文档保存、Save As、移动、缺失资源及恢复有哪些可查证的能力与限制？引用原路径或复制到文档旁目录分别需要怎样的用户授权与文件管理？

## Resolution criteria

以固定产品代码和 Apple 官方一手资料支持判断；区分文档权限、目录权限与资源代理边界，不臆测相邻文件访问能力。只研究事实与候选策略代价，不实施图片功能，不替用户选择策略。

## Execution

- Host / Agent：`srv_MEqRNkRW6fSx` / `10924b8b-564b-48fc-81c0-2e8df68ac355`。
- Workspace：`wks_394cc660a127da5d`，工作分支 `task/INK-RES-001-local-assets-research`，固定产品基线 `57aeaac`。
- 产物：研究分支中的 `docs/research/INK-RES-001-local-assets.md`，完成后以固定提交链接记录。
- Paseo 创建回执 running；notifyOnFinish 已启用。未有研究结论，不运行 UI/产品测试，不改真实文档或产品代码。
