# INK-UPD-155：检查更新与自动更新管理

用户2026-11-11新增明确功能要求；基线cf889ab1f9671bd90fb2820883c907edc3fa92fa。已核对Issue31仍open、原生App无更新模块、现network.client已启用；官方Sparkle当前稳定2.10.0支持14+目标与Sandbox。新依赖/网络例外/范围见[实施契约](../design/secure-updates.md)，不改编辑器离线/CSP或发布授权。

实现委派156 Native与157发行工具。先取得真实SDK/ad-hoc/终止语义事实，不凭“无DeveloperID”预设放弃或放松安全；生产凭据另由根在可审阅接线后协调。本轮无新功能实现或通过结论，不占屏、不发布、不替换正式安装。

## 实际委派与环境

已通过Paseo重新核对本机host、无configured profile、可用Codex/GPT-6.1 Sol，采用medium/full-access：156 agent `e4e7fa96-1167-40eb-8ed8-72cf87977dc7` / workspace `wks_47e985c371d2a42c`；157 agent `195c0212-2f94-488b-8c1f-eef6b55e73e9` / workspace `wks_17d43c3b0c994db0`。独立分支均从b206f19契约提交起步，双方已获彼此ID以协调固定SDK/tools和接口，不修改对方文件；完成通知开启。

根实际只读执行security find-identity（不输出身份名称或秘密）：exit0，valid identities=0、DeveloperID Application=0、Apple Development=0。此事实不能单独推出ad-hoc SDK加载失败，仍需156真实探针。生产key未创建，公钥/首个feed未发布；用户的默认更新策略选择尚未返回，当前按已说明推荐方向继续独立实施。
