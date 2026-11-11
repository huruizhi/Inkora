# INK-UPD-155：检查更新与自动更新管理

用户2026-11-11新增明确功能要求；基线cf889ab1f9671bd90fb2820883c907edc3fa92fa。已核对Issue31仍open、原生App无更新模块、现network.client已启用；官方Sparkle当前稳定2.10.0支持14+目标与Sandbox。新依赖/网络例外/范围见[实施契约](../design/secure-updates.md)，不改编辑器离线/CSP或发布授权。

实现委派156 Native与157发行工具。先取得真实SDK/ad-hoc/终止语义事实，不凭“无DeveloperID”预设放弃或放松安全；生产凭据另由根在可审阅接线后协调。本轮无新功能实现或通过结论，不占屏、不发布、不替换正式安装。
