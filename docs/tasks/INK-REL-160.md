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
