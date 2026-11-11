# INK-UPD-155：检查更新与自动更新管理

用户2026-11-11新增明确功能要求；基线cf889ab1f9671bd90fb2820883c907edc3fa92fa。已核对Issue31仍open、原生App无更新模块、现network.client已启用；官方Sparkle当前稳定2.10.0支持14+目标与Sandbox。新依赖/网络例外/范围见[实施契约](../design/secure-updates.md)，不改编辑器离线/CSP或发布授权。

实现委派156 Native与157发行工具。先取得真实SDK/ad-hoc/终止语义事实，不凭“无DeveloperID”预设放弃或放松安全；生产凭据另由根在可审阅接线后协调。本轮无新功能实现或通过结论，不占屏、不发布、不替换正式安装。

## 实际委派与环境

已通过Paseo重新核对本机host、无configured profile、可用Codex/GPT-6.1 Sol，采用medium/full-access：156 agent `e4e7fa96-1167-40eb-8ed8-72cf87977dc7` / workspace `wks_47e985c371d2a42c`；157 agent `195c0212-2f94-488b-8c1f-eef6b55e73e9` / workspace `wks_17d43c3b0c994db0`。独立分支均从b206f19契约提交起步，双方已获彼此ID以协调固定SDK/tools和接口，不修改对方文件；完成通知开启。

根实际只读执行security find-identity（不输出身份名称或秘密）：exit0，valid identities=0、DeveloperID Application=0、Apple Development=0。此事实不能单独推出ad-hoc SDK加载失败，仍需156真实探针。生产key未创建，公钥/首个feed未发布；用户已选择自动检查和下载、退出时安装。

## 接线与元数据决定

已核读157固定提交e13234f的工具、签验测试、发行脚本及generate_keys实际帮助。A/B分别实证hardened ad-hoc加载失败，未放松LV。根批准显式INKORA_SPARKLE正式分发配置、共享DocumentTerminationReview，以及默认预览的真实只读GitHub版本检查；已发A继续实现。公开清单契约与严格版本解析见设计文档；已委派B独立追加本地清单生成/校验及测试，不发布、不触碰生产Keychain。

157的13场景、内部签名和加载结果目前仅为作者证据；根尚未运行整合门禁，不冒称整体验收通过。生产generate_keys创建/查公钥命令已可审阅，尚未执行；生产签名、feed发布及真实客户端安装仍须各自证据。

## 根已实际运行的限定检查

吸收157固定e13234f为5e21856后，根独立执行 `SPARKLE_BIN=/tmp/inkora-sparkle-2.10.0/bin make test-updates`：2测试通过，其中官方Sparkle/CryptoKit签验13场景通过；只验证工具和fixture，无安装。`bash tests/ci/release-smoke.sh`通过，`git diff --check`通过。测试日志保留于管理者 `artifacts/INK-UPD-155/staging-tests.log`。Native组合、完整门禁及真实更新安装尚未运行。

根通过GitHub connector实际读取公开Beta1 Release：id439886819、prerelease=true、tag=v0.1.0-beta.1。其PROVENANCE资产SHA256为b29c77533ab291232e7d612f6ca293200ea93a8858e9d7da7a7d5327b19a7e26，与本地匿名下载原件一致；ZIP本地plist为正式bundle/build3。旧清单实际只有顶层build/version/releaseTag/artifacts，缺bundle字段，并非Beta2的checks版本结构。已告知A：只能精确固定该历史清单适配，不能通用放松缺bundle规则；不适配则返回无法确认，禁止伪报最新。

根现读官方sandboxing说明并实际枚举固定SDK嵌套权限：Downloader/Installer/Updater为空，Autoupdate仅原供应者application-identifier；本票内向外签名不传播供应者team或主App权限。此核读不代替同Team生产运行证据。
