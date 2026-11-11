# INK-UPD-157：签名 appcast 与发行工具

起点：`b206f1986bfb2b3b3002e157747ec6f4ecdefa5e`，独立分支 `task/INK-UPD-157-signed-appcast`，初始 clean。仅修改 B 归属，不修改 Swift/App/工程/entitlements。

## 完成

- 新增 scripts/updates/staging.py、verify-public.swift：本地 ZIP/feed Ed25519 签验、固定官方工具摘要、bundle/build/架构/系统/channel/HTTPS 检查、旧收据失效与 SHA 绑定。
- Makefile 增加 updates-stage / updates-verify / test-updates；不改变默认发布动作。
- scripts/release/sign-nested.py 对 Sparkle helper、XPC、Framework 内向外签名，主 App 最后签；metadata 从 source 展开 bundleID，不放松精确权限检查；原缺凭据检查保留。
- docs/updates.md 与 docs/release.md 写明凭据、staging、未来同字节 provenance、回滚及旧范围被本票取代；没有新增发布授权。
- 测试与证据见 docs/evidence/INK-UPD-157。没有读写生产 Keychain、没有发布或安装。

## 实际验证

1. 最小 RED：`python3 -m unittest discover -s tests/updates`，旧 receipt 未被删除导致失败，见 red.txt。
2. `SPARKLE_BIN=/tmp/inkora-sparkle-2.10.0/bin UPDATE_EVIDENCE=docs/evidence/INK-UPD-157 UPDATE_FIXTURE_DIR=build/updates-fixture make test-updates` 通过：2测试、13个真实官方工具正负场景，包含正确签名、错seed/公钥、改ZIP/feed、降级、错误bundle、HTTP、key权限、beta/stable、截断ZIP；真实loopback声明完整长度但断开，读取失败且临时安装sentinel保持原字节。测试临时seed为0600且退出清理，不留私钥。
3. `bash tests/ci/release-smoke.sh` 通过：全部原缺凭据/参数/脱敏/权限检查保留，新增 source 宏展开测试。
4. `python3 scripts/release/sign-nested.py build/updates-sign-fixture/Inkora.app - --timestamp=none`，随后 `codesign --verify --deep --strict <副本Framework>` 通过。未用 `--deep` 签名。
5. C CLI `dlopen` 反例：副本Framework与CLI均ad-hoc/runtime，加载实际失败 different Team IDs，见 load.txt。这是安全限制证据，绝非runtime通过，不关闭Library Validation。
6. `bash -n scripts/release/release.sh`、Python py_compile、`git diff --check` 通过。

## 未完成与风险

- 未运行完整 Release/archive/dry-run；根统一执行整合门禁。无 Developer ID / notary 凭据，真实正式导出/公证未测。
- 本轮禁止 App/GUI/安装，真实 Sparkle A→B安装、重启、用户取消及失败恢复未验；loopback与sentinel仅传输/工具边界验证。
- staging使用自有最小Mach-O fixture，不冒称生产客户端包。fixture receipt/feed公钥为临时测试公钥；example.org目的地无发布。原ZIP保留忽略目录 build/updates-fixture/Inkora.zip，重签SDK副本/C探针保留build/updates-sign-fixture，等待根双层备份。
- 生产 key/public/feed 与后续发布由根协调，本票不生成生产key、不发布feed、不上传旧Beta2。
- 采用单条本地候选 staging；正式feed保留历史、上传后同字节SOURCE/PROVENANCE仍属未来发布流程，不能把staging receipt当正式资格。

提交 fullSHA 与真实 remote 核对由最终交付消息给出。
