# INK-REL-160：发布 Beta2 未签名预览版

用户2026-11-11明确要求“完成打包发布新预览版”，已授权本次实际创建tag、GitHub draft prerelease、上传、核对后公开发布；不再停在本地候选。固定起点 main `b2e0ac89e5cca13f20a8307437c1ff6c6d14e4af`，只有公开Beta1/build3，旧未发布Beta2/build4候选完整保留。本版采用 `v0.1.0-beta.2`、0.1.0/build5，macOS14+、Universal，GitHub直接分发，不上架App Store。

## 发行边界

用户本次授权扩展docs/release.md的未签名预览例外到本版。仅发布既有dry-run链生成、严格结构/权限/资源/双架构核对的ad-hoc/runtime包；文件名带unsigned，说明首段明确无Developer ID/公证、Gatekeeper可能拦截、尚未完成下载首启/完整桌面验收。正式make release门槛不变，不关闭LV/Sandbox/runtime，不移除quarantine，不伪称正式质量或自动安装上线。

本版包含当前main变化及原生只读“检查更新”。真实Sparkle下载/安装仍需生产信任和同Team分发签名，不启用生产公钥/feed、不触碰Keychain/私钥。旧Beta1无更新客户端，需手动下载安装本版。只操作自有候选，不替换/重启本机安装，不启动App或显示窗口/面板/CUA/XCU，不重复物理IME/macOS14验收。

候选ZIP/DMG字节固定后生成严格 `inkora.release.v1` PROVENANCE、SHA256SUMS、SOURCE/发行检查证据，绑定真实ZIP plist、资产字节、build5及完整sourceCommit。先提交构建源码，再打包；后续证据提交不能改变app/editor/project。最终main/tag目标必须与打包源码产品文件相同且精确HEAD默认非UI CI通过。先draft上传并下载校验；发布后匿名下载复验资产和manifest producer/consumer。保留Beta1及旧候选，不覆盖既有tag/资产；此任务不发布Sparkle可信appcast。

## 分工与最小兼容核对

用户此前要求由Agent实施，根负责固定契约、整合、独立复核、默认CI、最终tag/draft/上传/公开及两层备份回收。执行者161只准备本地候选，不自行发布或安装。

161归属project.yml build4→5、CHANGELOG、docs/releases/0.1.0-beta.2.md、docs/release.md本次授权说明、自身task/evidence。另明确允许一个发行前纵向检查：用实际旧Beta1 PROVENANCE和合法新schema模拟两版列表，核对当前ReleaseLookup在遇到旧清单时是否丢弃新结果。若真实公共接缝复现，只允许精确固定旧Beta1 tag/prerelease/清单SHA与已核对build3的只读历史适配，并验证同release资产URL；原始manifest SHA为 `b29c77533ab291232e7d612f6ca293200ea93a8858e9d7da7a7d5327b19a7e26`，本地保存ZIP plist与公开资产核对为正式bundle/build3。禁止通用接受缺bundle、冲突或未知schema，也不跳过任意坏清单伪报最新。只可改ReleaseLookup.swift/同域测试和固定历史fixture；先红后绿，记录根新增授权取代此前“历史Beta1统一无法确认”边界。无反例则不改产品。

实际打包使用既有 `make release-dry-run`，相称lint/test-ci、manifest与有限Native测试；完整非UI/最终CI由根集中结算。先固定source commit，然后新构建，不复用build4字节；候选命名Inkora-0.1.0-beta.2-unsigned-universal.zip/.dmg，复制只能cmp同字节、不重打包。原始日志和包、所有失败probe完整保留，依赖仅借用既有锁定工具、仅unlink自建链接，SDK不升级。完成push/fullSHA/真实remote一致/clean；分支task/INK-REL-161-beta2-package。只创建必要任务内文件，不生成新子Agent。

## 管理者已核对

已核对root/main clean，公开Release仅Beta1，远端v0.1.0-beta.2标签不存在。Paseo profiles为空，实际发现Codex gpt-6.1-sol可用，委派161 agent db6cc6e1-27b0-4e09-ad2f-6120116c8819 / workspace wks_407e182fe383c0b4，采用独立分支与medium/full-access、完成通知。

根只读复核旧Beta1公开Release id439886819、5项资产长度/digest/URL，保存管理者artifacts/INK-REL-160/beta1-before.json；PROVENANCE摘要与本地原件一致，旧ZIP实际plist正式bundle/build3也已核对。当前GitHub连接工具没有Release写入/上传能力，最终创建/上传/公开使用现有gh CLI；已核读create/upload/edit真实help，采用新tag、draft→上传校验→publish，不用clobber。

161首报已复现公共两版列表RED，并得到17项定向GREEN与lint/test-ci通过；目前仅为作者证据，尚未独立复核或发布。后续源码/包固定后才进入根独立验包和默认CI。

## 固定候选及根独立验证

161构建源码76715e0dc3dac6e0bb1aae75b513256ad7ba7eb2、证据HEAD47f7a5d1cf4341f763e94df0e0446524d0ef80da已按序吸收；root固定组合846fd178e723378cde86f90e292943bf16152e6f。相对b2e0ac8共五提交、diff非空，source到root的app/editor/project/config逐字一致。候选复制至主仓artifacts/releases/0.1.0-beta.2-build5，全文件cmp一致；旧build4候选与Beta1未动。

根独立执行 `make lint test-non-ui release-bundle-check` exit0：editor811、Web Bridge16、Native232 passed/0 failed/9既有性能skip，Native Bridge16；test-ci、Release离线资源通过。根独立manifest.py verify从实际ZIP plist与两资产字节核对新schema通过。固定两包SHA：ZIP bb1a9537acd756891e0e6afad2b6e40afcd643d48e28951ea491051152b4033e；DMG 3724e8a136c63093384a755ba2a1d09e8bd4f7ca44463bdb1f5d0fc2e617c0e5。

管理者artifacts/INK-REL-160/verify-candidate.py实际独立复查export/解ZIP/只读无浏览挂载DMG：正式bundle/0.1.0/build5/14.0、arm64+x86_64、无Sparkle强链、strict deep签名、ad-hoc/runtime、精确展开权限与离线资源均通过，三处Mach-O SHA一致，DMG卸载。raw archive未签名边界只引用作者记录，未把它报为签名通过。详细candidate-result.json、command log、xcresult和完整门禁日志保留；未启动或安装App。

新上下文162 Standards（b0bd3a84-f8d4-4fc8-8319-bb00611fca2b / wks_ba1653dd4da13f50）与163 Spec（aa3157ff-bbd2-4444-a196-a5d844ff83ee / wks_4f1b5dba1909ab8d）从846fd17只审不修，完成前不宣告两轴通过。准备发布的公共文件仅ZIP/DMG/PROVENANCE/SOURCE/SHA256SUMS；候选CHECKS和receipt保留私有验证，不上传含原始路径/命令的检查文件；发布前公共SOURCE加入最终CI/tag绑定并重新算文本校验和，包与PROVENANCE字节不变。
