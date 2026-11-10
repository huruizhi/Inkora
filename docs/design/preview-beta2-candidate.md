# Beta 2 本地候选收口

基线`main@c48d717e9235680142913448d1de80b54cb2890d`，功能候选来源为已通过默认CI的77ba1d7（PR #89，CI 42871839283 attempt 2）。本轮准备可审阅的本地候选，不覆盖已发布的`v0.1.0-beta.1`、不新增发布例外或宣布完整体验/物理验收通过。用户当前没有新的优先级回复时，先按已说明的推荐顺序准备候选；行内标记显隐仍留独立原型选择，不悄悄进入生产。

## 范围与版本

- 保留macOS 14+部署、GitHub直接分发、不上架App Store、编辑器离线、既有Sandbox/资源保存政策。编辑器功能不再顺带变更。
- 预备版本名`0.1.0-beta.2`；App MARKETING_VERSION仍为数字`0.1.0`，CURRENT_PROJECT_VERSION从3单调增至4。既有beta.1的标签、说明和资产字节保持不变。
- CHANGELOG新增明确“候选、未发布”的条目；新增`docs/releases/0.1.0-beta.2.md`，覆盖beta.1之后实际已合改动，包括900/760、右上控件/侧栏、图标、表格工具、技术修改入口、图片描述稳定与许可；不把原有能力写成新实现，不以Typora目标声称像素或功能全等。
- 明确无Developer ID/公证、Gatekeeper下载首启未验；截图/真实paint、人工VoiceOver和系统授权仍按实际证据报告。用户取消的macOS14专项、重复物理IME不复做。公开仓库现有beta.1仍是旧固定版本，不默默替换。

## 实施与证据

INK-REL-147独占project.yml版本、CHANGELOG及新beta.2发行说明/自身task/evidence。不改editor/app生产逻辑、Bridge/依赖/lock/entitlement/既有release严格凭据策略；脚本若真实失败，先回报原因与最小修复建议，不自行放宽校验。

先固定版本/说明提交，再以精确源码运行既有`make release-dry-run`，不用额外通用capture或shell tracing绕开既有脱敏。只使用本机工具，不安装依赖或证书、不请求/打印私钥、密码、Team/profile值。可核对签名身份可用状态但仅回报计数/类别，不把keychain内容或环境快照写产物。无凭据时保持dry-run身份，严格`make release`仍应拒绝，不改成自动降级。

实际核对archive/export App、ZIP解出App、只读无浏览自动打开挂载DMG内App：bundle id、0.1.0/build4、arm64+x86_64、14.0、Sandbox/既有权限、strict codesign/Hardened Runtime和离线资源。不要假定generic archive一定Universal；实际lipo证明，缺一架构时明确失败/提案。挂载只用现有`-readonly -nobrowse -noautoopen`并确认卸载，绝不启动App或Finder窗口。

保留原始dry-run输出。可在独立候选目录按CANDIDATE/unsigned命名复制同字节ZIP/DMG，必须cmp和重新SHA256核对；禁止重新打包而沿用旧校验值。新增本地PROVENANCE.json、SHA256SUMS和候选检查清单，绑定source SHA、app/editor/project blob或tree身份、版本/架构/签名类别、工具链/实际系统、资产哈希与确实执行的命令，不伪造CI成功或人工验收。提交后的纯文档变化若与候选Git HEAD不同，必须证明app/editor/project完全相同。

自跑`make lint test-ci`与相称打包检查；不重复全套editor/Native/bench。版本候选的精确最终HEAD默认CI由管理者集中结算，ui-tests=false/full-bench=false。候选检查不等于Developer ID发行门槛，也不声称通过正式release-verify。

## 权限、交付与总体目标

本轮不建tag/GitHub release/draft，不上传资产、不改仓库权限、App Store/自动更新或正式安装，不强退现有Inkora。`docs/release.md`现有未签名例外明确针对beta.1，不能因为本候选机器检查通过就自动写成beta.2公开授权；需要发布时先交付具体可审阅候选，再按用户授权与政策结算。

禁止App/显示窗口/系统面板/CUA/browser/XCU/物理IME/macOS14专项、新子Agent。只暂借主仓锁定.tools/editor/node_modules symlink，完成仅unlink自建项。中文回报完成项/文件/真实命令结果/未完成与风险/branch/fullSHA，英文Conventional commit不超过72字符，push并核对真实remote=HEAD/clean。保留worktree、候选与临时日志，待管理者独立审查与两层备份后回收。

本轮为完整开发目标的发行候选收口，不替代此前尚无证据的实际paint、人工AX或系统授权，也不将未选定的原型、图片跨节点属性草稿政策当成已完成。管理者后续按需求逐项审计，不能由green checks反推整个目标通过。
