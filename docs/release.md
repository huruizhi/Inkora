# Developer ID 直接分发与 Beta 发布（INK-025）

发行渠道为 GitHub Releases 直接分发，不上架 Mac App Store；自动更新属于 #31。
正式分发使用 Developer ID 签名与公证。2026-11-10 用户另行明确授权先发布未签名预览版，范围及限制见下节。
本任务只验证无凭据部分；真实 Developer ID 导出、公证、Gatekeeper 与干净用户首次启动，须在持有凭据的发布机执行后记录证据。

## 未签名预览版例外（INK-REL-119）

用户确认“现在发布 GitHub 未签名预览版”后，允许把已验证的 build 3 ad-hoc 候选作为 `v0.1.0-beta.1` 预发布。
“未签名”表示无 Developer ID 分发签名，实际保留 ad-hoc/runtime 结构签名；没有 Apple 公证，也未验证带 quarantine 下载后的 Gatekeeper 首启。
安装包名称带 `unsigned`，发行说明首段明确系统可能拦截、本版仅供预览，且不代表完整视觉、物理输入或最低系统验收。

此例外不修改 `make release` 的严格凭据检查，也不把 ad-hoc 包标为签名/公证成功。仅可复用已绑定源码 commit、结构检查及 SHA256 的候选字节；
发布前再次校验 ZIP/DMG，并证明候选的 `app/`、`editor/` 与 `project.yml` 和标签目标相同。
打包内容不变，文件名改为 `Inkora-0.1.0-beta.1-unsigned-universal.zip` / `.dmg`，同时发布对应 `SHA256SUMS` 与 provenance。
先创建 GitHub draft prerelease、上传全部资产并核对，再发布该预发布；发布沿用仓库可见性，不自动公开仓库。
本版最初沿用私有仓库权限发布，有权限下载校验通过；用户随后明确授权将现有 Inkora 仓库改为 public，当前可匿名下载，不另建下载仓库。
发布前扫描已获取的 Git 历史及 Issue/PR 正文中常见凭据与私钥模式，未检出命中；该检查不等同完整安全审计。公开后通过匿名 API 与实际下载复验包和 SHA256，标签与资产未变更。

以下凭据、公证和干净用户步骤仍适用于后续正式分发；本例外只免除本次预览的这些完成声明，不制造相应通过证据。

## 环境与入口

macOS 14+、完整 Xcode（含系统 Python 3）、仓库既有 XcodeGen / Node / 固定 pnpm；先按 README 执行 `make setup`。
不引入 create-dmg。DMG 使用系统 `hdiutil`，ZIP 使用 `ditto`。
所有发布入口均不启动 App；挂载验证使用 `-readonly -nobrowse -noautoopen`。
构建架构遵循 Xcode 默认目标（本机 dry-run 为 arm64）；这不等同已提供 Universal Binary，发布前应按目标机器检查架构。

| 命令 | 行为 |
| --- | --- |
| `make release-archive` | 构建离线资源、生成工程，Release `xcodebuild archive`，正式 bundle id 与 Hardened Runtime |
| `make release-sign` | 使用仓库 `ExportOptions.plist`，填入环境变量后执行 `xcodebuild -exportArchive`，method=developer-id；校验签名与权限 |
| `make release-dmg` | 从已导出的 App 生成签名 DMG / ZIP；不公证，不代表可发布 |
| `make release-notarize` | ZIP 提交公证并等待 Accepted → staple App → 重建 ZIP/DMG → 公证并 staple DMG |
| `make release-verify` | 校验 App、DMG 内 App 与解压 ZIP 内 App；成功后生成 SHA256SUMS |
| `make release` | 按 archive → sign → notarize（含打包）→ verify 顺序完整执行 |
| `make release-dry-run` | 无凭据 archive → 显式 ad-hoc 签名 → DMG/ZIP → 结构验证；不提交 Apple、不做 Gatekeeper / staple 验证 |

不要并行执行发布目标；每个 worktree 同一时间只运行一次发布操作。
单独重跑 `release-sign`、`release-dmg` 会改变产物或移除票据，应重新执行 `release-notarize release-verify`。
每次修改代码、版本或权限后从 `make release` 开始，不能复用旧 archive。

## 凭据：由发布者在本机准备

脚本不读取 Apple ID、密码或 API key，不会自动安装证书。将 Developer ID Application 证书及其私钥导入登录钥匙串并解锁，再检查：

```sh
security find-identity -v -p codesigning
# 在交互式终端中填写个人资料；不要把密码放进命令行、环境变量或仓库。
xcrun notarytool store-credentials 'inkora-notary'

export INKORA_SIGN_IDENTITY='Developer ID Application: YOUR NAME (ABCDEFGHIJ)'
export INKORA_TEAM_ID='ABCDEFGHIJ'
export INKORA_NOTARY_PROFILE='inkora-notary'
make release
# 或逐步执行，便于定位失败阶段：
make release-archive release-sign release-notarize release-verify
```

示例均为占位符，替换为实际身份。`INKORA_NOTARY_PROFILE` 只指向钥匙串中已保存的凭据。
签名身份必须是与 Team ID 匹配的完整 Developer ID Application 名称；不支持 ad-hoc、Apple Development 或以证书哈希代替完整名称。
未设置环境变量、Team ID 格式无效、钥匙串查询失败、找不到证书/私钥均以 **78** 停止，不自动降级签名。
参数错误为 **64**；缺 archive/App/包为 **66**；权限、bundle id、runtime、公证非 Accepted 等校验错误为 **65**；系统工具错误保留非零退出码。
缺失或失效的 notary profile 由 notarytool 报错；脚本不会读取 profile 内容。
若公证不为 Accepted，用提交日志中的 id 在本机诊断：

```sh
xcrun notarytool log '<submission-id>' --keychain-profile "$INKORA_NOTARY_PROFILE"
```

诊断输出由发布者在本机审阅；分享前手动检查脱敏，不提交原始公证日志。

## 签名、权限与产物验证

`project.yml` 既有 `ENABLE_HARDENED_RUNTIME: YES` 覆盖 Release；脚本另在 archive 强制 YES。
保留 `app/Resources/Inkora.entitlements` 中的 App Sandbox、用户所选文件读写、app-scope 书签和 network.client。
network.client 只为系统 WebKit 子进程通信保留；离线资源、自定义 scheme、CSP 与导航限制继续阻止编辑器 HTTP(S) 访问，见 ADR-0003。
WKWebView 的 JS 在系统 WebContent 进程运行，因此不为 Inkora 主进程添加 allow-jit、unsigned-executable-memory、disable-library-validation 等 runtime exception。
权限是否满足正式签名后的真实启动仍须凭据阶段人工确认，本次不会启动 App 验证。

验证精确比较签名后的权限与仓库权限，仅容许 Xcode 添加且与 Team / bundle id 匹配的签名元数据；拒绝 get-task-allow、UITesting id 或额外 runtime exception。
正式验证包括 `codesign --verify --deep --strict`、runtime 标志、Developer ID authority / Team、`spctl -a -vvv -t exec`、`xcrun stapler validate`、`hdiutil verify`。
同样检查只读挂载 DMG 和解压 ZIP 后的 App，并调用 `make release-bundle-check RELEASE_APP_BUNDLE="<现有 App 路径>"`，复用 `tests/ci/editor-bundle-smoke.sh` 检查 HTML、脚本、CSP 和 WebKit 权限。指定现有包时不重新构建，不改写正式 bundle id；输出由发布脚本统一脱敏。默认不传此参数时仍构建隔离 UITesting Release，供常规 CI / `test-ui-release` 使用。
ZIP 本身不能 staple，因此先 staple App，再重建 ZIP；DMG 另行签名、公证、staple。
依据：[Apple 公证要求](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)、[自定义公证流程](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。

- 正式产物与脱敏日志：`artifacts/release/developer-id/Inkora.dmg`、`Inkora.zip`、`SHA256SUMS`、`release.log`。
- dry-run：`artifacts/release/dry-run/Inkora-DRY-RUN.dmg`、`Inkora-DRY-RUN.zip`、`SHA256SUMS`、`release.log`。仅证明结构验证，不代表通过公证；默认不能发布，本次已明确授权的未签名预览版按上节例外处理。
- archive / export 位于忽略的 `build/release/<kind>/`；Xcode 可能在这里留下身份元数据，不能上传整个 build 目录。
- 临时 ExportOptions 在系统临时目录中生成，权限仅当前用户可读，退出时清理；仓库 plist 只有占位符。
- 所有发布子进程 stdout/stderr 先脱敏身份、Team ID、profile 名称，再写控制台和 release.log；不要以 `bash -x`、shell tracing 或额外通用 capture 包装发布入口。
- 不上传原始 Xcode distribution 日志、钥匙串、环境变量快照或临时文件。签名 App 本身依法包含公开证书信息，日志脱敏不移除签名证书。
- dry-run 不进入常规 CI；CI 的 `make test-ci` 只运行隔离的参数、缺凭据、脱敏与权限回归测试。

## 干净用户 / VM 人工烟测

机器结构检查已由 `make release-verify` 脚本化，不会启动 GUI；以下步骤必须由人实际执行并记录 macOS、CPU、版本/build、SHA256、结果和问题。

1. 在当前验收 macOS 上准备干净 VM 或新建用户；没有已安装 Inkora、个人偏好、最近文件和恢复草稿。本轮按用户[当前系统验收决定](decisions/current-system-acceptance.md)不执行 macOS 14 专门验收；部署目标不变，不将当前结果声称为 14 实测兼容。
2. 在干净环境用浏览器下载真正签名并公证的候选 DMG 和 ZIP，使下载带 quarantine 属性；对照发布机 SHA256SUMS 校验。不要去掉 quarantine 或关闭 Gatekeeper。
3. **断网**，挂载 DMG，将 Inkora 拖入 Applications 后弹出 DMG。首次双击 App，确认 Gatekeeper 正常放行（允许标准下载确认提示，无“无法验证开发者”错误），不使用 Open Anyway 绕过。
4. 在 Finder 双击 `.md`，验证文件关联和文件名；如默认编辑器未关联，使用“打开方式”选择 Inkora，并记录关联结果。
5. 编辑中文、输入法 composition、选区、撤销重做，保存，关闭并重开，对照磁盘文件；验证离线资源加载和无网络依赖。使用测试文档，不使用真实笔记。
6. 对 ZIP 解压后的 App 独立重复首次启动与文件打开，避免已放行的 App 掩盖问题；必要时还原 VM 快照或使用另一干净用户。
7. 汇总通过/失败、实际验收系统与日志；任一未解决阻塞问题都停止 Beta 发布。新用户不能替代真实 quarantine/Gatekeeper 测试；本轮 macOS 14 专门验收已由用户明确排除。

## Beta 发布检查表

- [ ] `MARKETING_VERSION` 是 `major.minor.patch`，`CURRENT_PROJECT_VERSION` 为单调递增整数；修改 `project.yml` 并重新生成工程。Beta 标签例如 `v0.1.0-beta.1`，候选迭代递增 beta 序号和 build 号，绝不覆盖既有标签。
- [ ] 在 CHANGELOG 中记录该版本变化、已知问题、最低 macOS、支持 CPU 架构和数据安全限制；本任务不虚构尚未发布版本的 CHANGELOG。
- [ ] `make lint test-non-ui release-dry-run`、默认非 UI CI 和数据安全/性能验收通过；发布前另手动触发 CI 的 UI 套件（`-f ui-tests=true`）并通过，记录 commit、CI 链接及人工烟测结果。
- [ ] 使用持凭据发布机完成 `make release`，检查脱敏 release.log，机器验证和两种包的干净用户离线烟测通过。
- [ ] 仅选用 developer-id 目录最终包，验证 `shasum -a 256`，并与 `SHA256SUMS` 一致；修改或重新打包后必须重新签名、公证、验证和计算 checksum。
- [ ] 建立 GitHub Releases 草稿并由人审阅发行说明、产物及 checksum。下面命令只供发布者使用，本任务不执行：

```sh
cd artifacts/release/developer-id
shasum -a 256 Inkora.dmg Inkora.zip
shasum -a 256 -c SHA256SUMS
# 将标签与 commit 改为已验证的候选版本；beta-notes.md 由发布者准备。
gh release create v0.1.0-beta.1 --target '<verified-commit>' \
  --draft --prerelease --title 'Inkora 0.1.0 Beta 1' \
  --notes-file /path/to/beta-notes.md Inkora.dmg Inkora.zip SHA256SUMS
```

- [ ] 人工最终确认后发布草稿；本任务不执行创建或发布 Release，不将凭据放入 CI。
- [ ] 回滚：暂停或撤下故障 Beta 的下载入口，发行说明标明停止使用原因；保留原标签、校验和和诊断记录用于追踪。指引下载上一已验证版本并先备份 Markdown 文件，禁止覆盖或删除用户文档、恢复草稿及偏好。修复后以更高 build / 新标签发布，不悄悄替换旧资产。自动更新不在本任务范围内。
