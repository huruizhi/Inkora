# 检查更新与自动更新（INK-UPD-155 / #31）

用户2026-11-11明确要求 Inkora 具备检查更新与自动更新。固定产品起点 `cf889ab1f9671bd90fb2820883c907edc3fa92fa`，来源 [Issue31](https://github.com/huruizhi/Inkora/issues/31)：可信签名、Stable/Beta、失败不破坏安装、凭据隔离的发布流程。此前“自动更新后置”由本次要求取代；Beta2发布许可与桌面验收是独立事项，不自动扩张。

## 选型与原文保护

采用 Sparkle **2.10.0 exact**（官方发布页当前稳定版、最低macOS12，产品继续14+），新依赖及必要锁文件在本票明确授权。使用官方标准更新器/签名验证/安装器，不自制shell替换器，不修改SDK安全验证。根通过官方setup、sandbox、customization、publishing与delegate文档核读选型；原始支持范围不缩减。

原AGENTS的离线约束对编辑器保持；用户本次要求明确授权**独立Native更新模块**访问HTTPS更新源和发行资产。不得修改编辑器CSP/Bridge、发送Markdown/路径/恢复数据、开启Sparkle系统画像或遥测。不新启用Downloader XPC：现App已有network.client，遵照官方sandbox说明，仅启Installer与当前bundle对应两项mach-lookup（spks/spki）；Sandbox、Hardened Runtime保持。

官方特别提示ad-hoc与Library Validation可能冲突。**先实测、后定结论**：A必须先固定SDK并以不显示窗口的真实链接/加载探针核对本机ad-hoc情形。禁止为拿绿关闭Release Library Validation、关闭Sandbox/Hardened Runtime、使用deep重签所有helper，或发布会在dyld阶段崩溃的预览构建。若出现实际失败，先给最小反例和保持安全的集成提案；不能把“以后有证书”当现有预览可运行的证据。

## 用户行为

- Inkora原生应用菜单提供“检查更新…”，网络中断/无新版本/无可信配置的结果可理解，不伪报“最新”。仅更新器范围联网，启动不阻塞正文。
- 提供自动检查、自动下载/安装和Stable/Beta选择，默认不采集系统画像。用户已明确选择“自动检查+后台下载，退出时安装”；用户关闭立即遵循。初始检查按Sparkle约1天间隔，避免每次焦点或文档变更联网。
- 使用同一HTTPS appcast、Sparkle channels：stable仅默认通道；beta包含默认+beta。切换不会自动降级；可切回，需更高可信版本才安装。安装/下载中的旧通道动作必须有清楚取消/延后规则，不能误装旧意图。
- 安装前/重新启动必须经过现有文档prepareForClose、composition/源码草稿、原生保存/放弃/取消流程。用户取消或失败时保持原安装、当前原文/选区/历史/恢复资源，不强退。复用或提取一个真实关闭审阅模块供正常退出和Sparkle使用，禁止另建绕过保存屏障的退出路径。
- 只接受有效Ed25519签名更新；启用可用的解包前验证及签名feed。HTTPS、正确bundleID、递增CFBundleVersion、系统支持范围和包签名交由SDK并由发行验证额外核对。当前旧Beta1/2不含更新器，需要一次手动安装首个支持更新的版本，不伪造无客户端情况下的自举。
- Debug、UITesting bundle与hostless测试默认完全不启动更新器/联网/弹窗；显式测试配置只作用自有fixture与独立defaults，不复用用户偏好或正式安装。

## 信任与上线

### 根已裁定的接线（2026-11-11）

A、B均以实际 hardened ad-hoc CLI 加载官方SDK及内向外重签副本，得到不同Team ID的Library Validation拒绝；结构验签成功不等于运行加载成功。因此采用显式 `INKORA_SPARKLE` 正式分发构建配置：默认ad-hoc不强链接或加载SDK，正式同Team签名配置才启用真实Sparkle。不得关闭LV或以不受类型检查的动态反射绕过。SPM精确依赖、正式配置编译及嵌入仍须交付，不能只留下不可用菜单。

默认预览的“检查更新”采用独立Foundation只读GitHub版本查询，仅访问固定huruizhi/Inkora的HTTPS发行元数据及版本清单，限制超时、大小、重定向和请求代际。不下载应用包、不执行安装；可打开官方发布页。严格比较CFBundleVersion数值，不从tag推测build。网络错误或不可信/缺失/冲突元数据只能显示“无法确认版本”，不能显示“已是最新”。正式签名路径使用Sparkle签名更新链；两种能力明确区分。

公开版本清单固定 `schema=inkora.release.v1`，字段为 `bundleIdentifier`、`buildVersion`（正十进制整数字符串，拒绝前导零及Int64溢出）、`marketingVersion`、`channel=stable|beta`、`tag`、完整40位十六进制 `sourceCommit`、`assets=[{name,url,byteLength,sha256}]`。读取方将tag和资产URL绑定GitHub返回的同一Release，验证正式bundle/channel/prerelease一致；Stable排除prerelease，Beta可包含stable。旧清单只允许显式兼容 `checks.*.versions`，重复字段冲突拒绝。local-staging-only签验收据不能冒充公开清单或安装许可。本票可生成/验证本地候选清单，不发布它。

批准A抽取共享 `DocumentTerminationReview`，保持原prepare→原生review→finishRecovery/reply顺序及一次进行中守卫。官方实际安装器发送正常terminate；最终退出仍走applicationShouldTerminate。postponement只允许辅助延后，不能成为唯一保存守卫或产生第二条保存路径。

生产公钥允许入库，私钥不得进代码/日志/命令参数明文/产物。两执行Agent**禁止生成、导出、覆盖或读取生产私钥/钥匙串条目**；只用临时测试密钥（0600文件、结束清理，不上传）做真实SDK验证。根在工具/方案已可审阅后另行结算生产密钥创建与保管；不填示例公钥冒充发布可用。

生产feed建议固定 `https://raw.githubusercontent.com/huruizhi/Inkora/main/updates/appcast.xml`，包URL为现GitHub Releases HTTPS下载。新增公钥和首个签名空feed必须经根协调，不能先把未签名旧包挂入可信源。无有效公钥/feed时明确配置未就绪、fail closed，不冒称自动安装已上线；此时仍须把完整软件接入和本地真实签名链测试做到可审阅。

不创建tag/Release/draft、不上传资产/发布feed、不改GitHub权限、不更新或重启用户App。没有Developer ID/公证的现状如实保留，不放松现有严格make release凭据门槛。签名Ed25519与Apple签名/公证分别报告，不互相替代。

## A：INK-UPD-156 Native模块与接线

归属 project.yml、SPM精确锁/必要构建配置、Info.plist、当前entitlements、AppDelegate菜单/关闭接线、更新同域Swift模块/测试、必要共享关闭审阅模块、依赖许可说明及自身task/evidence。不得改B的release脚本/Makefile/测试。AppDelegate和既有quit路径变更先基于实际SDK delegate语义提出最小接口，根确认后实现；其他方只消费小接口。

先回报：SDK固定来源/版本/校验；ad-hoc加载实测；现有quit保存路径与SDK安装/重启语义；计划的生产配置字段/小接口。随后落实真正可调用的检查、设置/通道、状态与保存保护。用户拥有的Documents、App安装和AppDelegate启动均不作为测试容器。

定向公共测试覆盖菜单/配置资格、偏好保持、Stable/Beta/无降级、无重复检查、旧通道/迟到回调、关闭保存/放弃/取消/失败/源码草稿/composition守卫。真实SDK只在离屏/无AppDelegate的专用测试host或受控CLI探针内执行；不占屏，不假装完整UI通过。

## B：INK-UPD-157 可信feed与发行工具

归属 scripts/updates/、相关独立测试、必要scripts/release/和metadata校验、Makefile更新专用目标、docs/release及updates文档、feed样本/自身task/evidence。不改A文件。先核对Sparkle2.10实际工具与锁定artifact，不从记忆编CLI参数；可只读复用A固定的SDK/tools缓存，不修改其worktree。

实现可重复的appcast/包签名与校验流程：默认只输出本地staging；验证正式bundle/version/架构/系统、archive精确字节长度/Ed25519签名、channel及HTTPS目的地；生产发布仍保留DeveloperID/公证门槛，preview不得被误作正式包。每次失效旧成功收据，参数/缺凭据/坏签名/损坏包/中断与降级都fail closed，保护现有安装。保留历史版本以更高版本修复，不自动降级；回滚说明保留Markdown与图片、偏好/恢复目录。

真实本地签名/损坏/错误key/feed测试至少跨官方Sparkle工具或SDK验证，不以仅自家Python签/验环冒充客户端兼容。小本地loopback服务可做网络中断/损坏响应，不访问公网/用户安装，不弹窗；实际临时A→B安装若需运行App/UI/特殊权限，先回报最小可行方案，禁止自行假报。重签新增Framework/XPC/helper必须inside-out、按各自权限，不以outer --deep一刀切。release-dry-run必须保持结构可验证，现有有效测试不能删。

## 统一交付

用户要求实现由Agent承担；根负责契约、接口/凭据决定、固定整合和独立两轴审查/最终默认CI。无configured profile时按实际provider/model选择可用执行者。每人独立worktree，不再建子Agent；可借锁定Node工具/依赖链接，只unlink自己链接。Sparkle本票是明确新依赖，其下载/构建缓存与pin需记录，不借机升级其他依赖。

本轮禁止显示窗口、系统面板、CUA/browser/XCU、AppDelegate启动、物理IME/mac14专项或改变用户权限；电脑控制故障不影响后台实施。只跑相称定向检查和必要构建；完整非UI/Release/默认CI由根集中做一次。任务完成中文报告：文件、实际命令/结果、未验风险、branch/fullSHA；英文Conventional Commit≤72，push后核对真实remote=HEAD和clean，保留全部原始证据等待两层备份/回收。

## 官方依据（2026-11-11实际核读）

- https://github.com/sparkle-project/Sparkle/releases/tag/2.10.0
- https://sparkle-project.org/documentation/
- https://sparkle-project.org/documentation/sandboxing/
- https://sparkle-project.org/documentation/programmatic-setup/
- https://sparkle-project.org/documentation/customization/
- https://sparkle-project.org/documentation/publishing/
- https://sparkle-project.org/documentation/api-reference/Protocols/SPUUpdaterDelegate.html
