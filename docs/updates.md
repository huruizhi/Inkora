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
