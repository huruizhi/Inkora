# INK-UPD-156：原生检查更新与自动更新接线

基线 `b206f1986bfb2b3b3002e157747ec6f4ecdefa5e`，产品基线 `cf889ab1f9671bd90fb2820883c907edc3fa92fa`。分支 `task/INK-UPD-156-native-updater`。

## 完成内容与入口

应用启动完成后，Inkora 菜单提供“检查更新…”和“更新设置”。设置包含自动检查、后台下载并在退出时安装、Stable/Beta；默认自动检查和下载，初始通道 Beta。设置持久化；关闭自动检查同时关闭 SDK 后台下载调度，但保留下载偏好以供重新开启。通道切换在更新会话（包括已准备退出安装）及只读查询期间禁用，不把进行中旧通道操作投向新通道。设置影响后续调度，已开始的更新由 Sparkle 标准 UI 管理。SDK明确指出sessionInProgress可能不含已下载/延后安装，因此额外持久化pendingBuild；待当前host达到该build才解锁通道，菜单tooltip说明。本进程本次尚未准备的下载，若收到官方domain下3000/3001/3002终止错误则清自己的记录、允许切通道；已准备/跨进程未知或较早延期记录不盲清，不擅自操作SDK缓存。详installation-state.md。

- 普通 `Inkora` target / scheme：绝不链接或加载 Sparkle。Release 预览通过 Foundation 只读查询固定 GitHub 仓库发行信息，不下载或执行 App 包，不提供自制安装器。显示查询中状态、新版/无较新可验证发行/无法验证版本信息，以及官方发行页入口。
- `InkoraDistribution` target / scheme：显式 `INKORA_SPARKLE` 编译宏，真正链接 Sparkle **2.10.0 exact** package；产品仍 `Inkora.app` / `com.huruizhi.Inkora` / build4。签名 guard 要求非空真实 signing identity / team；Release 只允许 Developer ID，Debug 可 Apple Development。不允许 ad-hoc 开启此路径，不关闭 LV/Sandbox/Hardened Runtime。
- 分发配置的可信公钥或feed安全字段不齐时不创建 updater；不填占位公钥。完整配置后标准 SDK UI 提供检查、进度、无新版本和错误反馈；自动调度约1天，不发送系统画像，不接触正文、路径或恢复数据。
- Debug、UITesting 与 hostless bundle 不启动更新器或只读网络检查。测试仅用独立defaults与URLProtocol。

现有 Beta1/2 没有更新客户端，需要一次手动安装含更新器的新版本。当前没有生产公钥/已激活签名 feed，也没有可用代码签名身份；**自动安装尚未上线**。预览只读信息提示不能替代可信签名链或安装授权。

## 软件边界

`UpdatePolicy`处理可信资格、启动资格与偏好；`UpdateService`隐藏SDK；`UpdateInstallationState`按下载尝试归属保护安装意图；`SparkleUpdateDriver`仅在分发宏下编译；`UpdateMenuController`提供原生入口；`ReleaseLookup`只读公开元数据。

只读查询固定 `api.github.com/repos/huruizhi/Inkora/releases?per_page=10`，最多10项、单响应1MiB流式上限、15秒请求/30秒资源时限；不使用cookies或凭据，HTTPS重定向限GitHub官方资产域。Stable排除prerelease，Beta包含stable。按严格正整数CFBundleVersion比较，溢出拒绝；不从tag推断build。新 `inkora.release.v1` 校验bundle、通道、tag/marketing、sourceCommit、资产名称、同release URL、长度与SHA格式，拒绝重复JSON键和额外schema字段。legacy仅允许checks.export/zip.versions一致且所有checks版本无冲突。

公开Beta1旧顶层metadata缺bundleIdentifier，本实现明确显示“无法验证版本信息”，没有放松通用缺bundle规则，也不因本地build4大于历史build3就宣称所有渠道最新。尚未发布或改动任何feed/Release。

`DocumentTerminationReview` 与 `TerminationReviewGate` 提取原有prepareForClose→reviewUnsavedDocuments→成功后finishRecovery/reply。普通quit和Sparkle的Apple quit event都进入AppDelegate.applicationShouldTerminate单一屏障。重复terminate只保留一次审阅，失败/取消不清恢复数据；不把可缺席的postpone callback当唯一guard。

## 修改文件

- project.yml / config/Package.resolved：分发目标、exact package与真实解析锁。XcodeGen postGen恢复锁到生成工程。
- app/Resources/Info.plist、Inkora.entitlements、Sparkle-LICENSE.txt：可信源安全字段、bundle宏mach lookup与官方完整许可。
- app/Sources/AppDelegate.swift 与上述8个同域模块：菜单、检查、偏好、SDK及共享退出接线。
- tests/InkoraTests/{UpdatePolicy,UpdateService,ReleaseLookup,TerminationReviewGate}Tests.swift、EditorWebViewTests.swift：定向测试。
- 本任务文档与 docs/evidence/INK-UPD-156。

## 实际验证

1. 官方SDK SHA校验及真实ad-hoc+runtime dlopen：预期拒绝different Team IDs，详phase1.md / adhoc-load.txt。未关闭LV，未重签SDK。B独立复测inside-out重签副本也拒绝。
2. `xcodebuild -resolvePackageDependencies -project Inkora.xcodeproj -scheme InkoraDistribution -clonedSourcePackagesDirPath build/SourcePackages`：通过；2.10.0 revision `eef1a539a373c1f1a320624b1130fc5de7b2e100`。
3. 普通Debug `xcodebuild ... -scheme Inkora CODE_SIGNING_ALLOWED=NO build`：通过，保留原有源码warning。`otool -L`确认普通产物没有Sparkle依赖。此未签名编译不是Release安全签名验证。
4. 同工程hostless定向原生测试48项通过：4个新域测试类及InkoraDocumentTests；summary见native-test-summary.json。未启动AppDelegate、未显示窗口。
5. 新增真实离屏WK prepareForClose composition/source draft测试1项通过；close-barrier-summary.json。首轮fixture未attachSidebarEditor导致两断言失败，修正为真实文档挂接后通过，失败日志保留，不删断言。
6. `docs/evidence/INK-UPD-156/run-policy-tests.sh`：9项hostless XCTest通过，独立defaults与URLProtocol，无公网。保存/放弃均以原生review成功布尔结果注入真实共享gate；没有声称实际点击原生保存面板通过。
7. 全源码 `swiftc -swift-version 6 -parse-as-library -typecheck -D INKORA_SPARKLE -F /tmp/inkora-sparkle-2.10.0 app/Sources/*.swift`：通过。实际Swift编译链接独立未运行的SDK二进制亦通过（distribution-link.txt）；不等于Xcode签名嵌入或运行通过。
8. `xcodebuild ... -scheme InkoraDistribution -configuration Release CODE_SIGNING_ALLOWED=NO build`：按预期被可信签名guard拒绝，distribution-guard.txt；没有添加bypass。
9. 本任务Swift `xcrun swift-format lint --strict`、plist lint、git diff --check：通过。

## 未验证与风险

没有真实Developer ID身份，故Xcode分发完整链接/嵌入/同Team签名与运行、生产Ed25519信任激活、实际更新安装/重启均未验证。完整非UI/Release/默认CI由根统一执行。本轮没有AppDelegate启动、UI/XCU/物理IME/macOS14验收，不改变正式App或用户文档；未碰生产Keychain/私钥。SDK仅做公开来源校验、离屏API与编译探针，临时密钥链签验由B单独报告。

ignored原件保留build/SourcePackages、build/DerivedData及临时SDK固定缓存，待根双层备份回收。借用工具只unlink本worktree自建symlink，不动共享目录。

补正：安装意图失败恢复公共反例先红（10项1失败）再绿（11项0失败）；SDK adapter按真实2.10模块typecheck通过。本次未重复全量/Release门禁。

## INK-REV-159 P2 限定补正

根独立Spec审查后的追加修复，仅涉及ReleaseLookup/同域测试及自身文档证据。schema出现但类型错误不再回落legacy；旧格式已知顶层语义别名必须与checks及release一致；额外checks.*.versions坏类型/冲突拒绝。合法旧checks继续可解析，历史公开Beta1缺bundle/checks仍无法确认。

公共解析回归先RED：14测试47断言失败；修正并补布尔/历史格式对照后GREEN：15测试0失败。hostless、typecheck、两文件strict lint与diff检查通过；未重跑全量/Release/UI。详 [补正证据](../evidence/INK-UPD-156/release-lookup-review.md)。
