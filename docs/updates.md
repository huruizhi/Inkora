# 本地可信更新 staging（INK-UPD-157）

更新契约见 [secure-updates](design/secure-updates.md)。本工具只生成本地文件，不安装、不上传、不发布 feed；旧 Beta2 没有 EdDSA 更新链，不挂入可信 feed。生产公钥与首个签名空 feed 由根另行结算。

固定 SDK：官方 https://github.com/sparkle-project/Sparkle/releases/tag/2.10.0 的 Sparkle-2.10.0.tar.xz，SHA256 `c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c`。入口额外固定官方 sign_update 二进制 SHA256，防止工具漂移。工具实际帮助保存在 evidence。

```sh
# UPDATE_ARGS 仅包含文件路径、公钥、公开版本元数据。不要放私钥文本。
make updates-stage UPDATE_ARGS='--archive /absolute/Inkora.zip --tool /absolute/sdk/bin/sign_update --key-file /private/seed --public-key PUBLIC_BASE64 --url https://example.org/Inkora.zip --feed-url https://example.org/appcast.xml --current-build 9 --architectures arm64,x86_64 --channel stable'
make updates-verify UPDATE_ARGS='相同参数'
SPARKLE_BIN=/absolute/sdk/bin make test-updates
```

key-file 必须是 0600 普通文件、32字节 seed 的 Base64；每次操作都显式传给官方工具，绝不隐式查 Keychain。工具输出可能回显坏密钥，入口只返回统一失败信息，不转发原输出。生产私钥不得进入日志、参数文本、源码、产物或 commit。`generate_keys` 仅支持 Keychain 创建，不把它用于测试；测试通过 CryptoKit 在临时目录创建 seed，退出自动删除。

`generate_keys --account com.huruizhi.Inkora.sparkle.production.<唯一后缀>` 的方案供根审阅，**本任务不执行**。同 account 加 `-p` 只输出公钥。Keychain service 为 `https://sparkle-project.org`，generic password，protocol SSH；不用默认共享 account `ed25519`。不要执行 `-x` 导出或 `-f` 导入生产 key。

stage 校验 ZIP 顶层 Inkora.app、正式 bundleID、递增整数 build、营销版本、macOS14+、Mach-O 架构和 HTTPS 目的地；stable 省略 channel，beta 写 beta。官方 sign_update 签 ZIP 与 XML feed，再官方验签与 CryptoKit 公钥交叉验签 ZIP。verify 重新检查 feed 元数据、字节长度与签名。输出 staging/appcast.xml 与 receipt.json；收据绑定 ZIP/feed 的 SHA256。每次尝试在参数完整校验前删除旧 receipt；失败不得当作成功，也不得只依赖仍存在的 appcast.xml。无 output 参数无法定位上次目录，调用方必须固定 output；Make 入口始终固定它。

本地收据只证明 staging 签名与元数据。它不证明 Developer ID、公证、客户端安装或发布资格。正式包必须先 `make release`，保持缺凭据 fail closed；Sparkle helper/XPC/Framework 由内到外重签，主 App 最后签，不使用 `--deep` 签名。主 App 权限从 source entitlements 展开正式 bundleID 后精确检查，不允许额外权限。dry-run 仅 ad-hoc 结构验证，不冒充正式包。

未来发布必须从同一已验证 ZIP 字节产生 SOURCE/PROVENANCE：记录完整源码 commit、生产 `make release` 与签名验证结果、ZIP 长度/SHA、feed SHA、公钥、版本/channel 和不可变资产 URL；上传后重新下载逐字节校验，禁止重新打包后复用旧收据。此处没有发布入口，也没有授权创建 tag/Release/draft。建议单一 raw GitHub appcast，stable 默认、beta 额外通道；首次客户端仍需手动安装。

回滚时暂停问题条目，以更高 build 修复，不自动降级。人工回退前备份 Markdown、图片 `.assets`、偏好及恢复目录；不得删除恢复草稿或用户文档。

真实安装需要自有 A/B App fixture、独立默认值和临时安装目录，并运行 Sparkle 安装/重启路径，可能涉及 GUI/权限。本轮禁止运行 App，因此尚未执行。loopback 中断只验证真实传输异常及自有 sentinel 未被写入，不声称客户端安装恢复通过。

## 公开发行信息契约：inkora.release.v1

`manifest.py` 从实际候选 ZIP 的 Info.plist 和实际资产字节生成 `PROVENANCE.json`。它为将来的只读 GitHub 版本检查准备数据，不访问网络、不上传、不授权安装。当前输出仅为 **local candidate**；旁置 receipt 明确 `scope=local-candidate-only`、`published=false`、`installationAuthorized=false`，与上面的签名 staging 收据互不替代。

```sh
make updates-manifest UPDATE_MANIFEST_ARGS='--archive /absolute/Inkora.zip --asset /absolute/Inkora.zip --asset /absolute/Inkora.dmg --tag v0.1.0-beta.3 --channel beta --source-commit FULL_40_LOWER_HEX_COMMIT'
make updates-manifest-verify UPDATE_MANIFEST_ARGS='--manifest /absolute/PROVENANCE.json --archive /absolute/Inkora.zip --asset /absolute/Inkora.zip --asset /absolute/Inkora.dmg --tag v0.1.0-beta.3 --channel beta --source-commit FULL_40_LOWER_HEX_COMMIT'
make test-update-manifest
```

顶层字段固定为 `schema`、`bundleIdentifier`、`buildVersion`、`marketingVersion`、`channel`、`tag`、`sourceCommit`、`assets`。schema 为 `inkora.release.v1`；bundle 固定 `com.huruizhi.Inkora`。buildVersion 从 ZIP 读取，必须是无前导零的十进制正整数字符串，最大 `9223372036854775807`（与客户端 Int64 上限一致），不能用 JSON 数值代替。sourceCommit 必须为40位小写十六进制。stable tag 为 `v<marketingVersion>`，beta tag 为 `v<marketingVersion>-beta.<正整数>`，营销版本从 ZIP 取值。

assets 按 name 排序，每项含 name、url、byteLength、sha256。必须包含候选 ZIP，名称不能重复，名称仅允许 ASCII 字母数字、点、下划线和连字符，以字母数字开头。长度和小写 SHA256 来自实际字节；URL 必须精确为 `https://github.com/huruizhi/Inkora/releases/download/<tag>/<name>`，不能含凭据、端口、query、fragment 或其他仓库/资产名。验证模式重算完整对象并精确对比，拒绝未知字段、重复JSON字段和混入冲突legacy字段。现有Beta2 legacy格式由客户端显式兼容分支处理，本工具不把它当新schema。

未来得到实际 GitHub Release API 响应时，可以附加 `--release-metadata /absolute/release.json`：验证 tag_name、draft=false、prerelease/channel、html_url 指向固定仓库和tag，并把每个候选资产的 name、browser_download_url、size 与响应绑定；响应包含 digest 时也精确核验。该输入不会触发上传/发布，也不能证明当前远端内容没有变化；未来真正发布仍需重新获取响应、下载验证同字节及另行授权。

每次尝试先撤销旧 PROVENANCE.json 和 receipt.json；verify 可以原地读同目录 manifest，先快照输入再撤销旧成功输出，验证失败不会留下旧候选冒充新结果。输出目录须固定且专用于此工具；不能把源 ZIP/资产放在同目录且命名 PROVENANCE.json 或 receipt.json。此 manifest 不校验 Apple 签名、公证、架构或客户端安装资格，相应门禁仍由发行/Sparkle签名工具负责。只读客户端对缺失、坏值或冲突返回“无法确认”，不从tag猜build、不称为“最新”。
