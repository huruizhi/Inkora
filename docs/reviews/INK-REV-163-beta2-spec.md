# Spec

受检 HEAD：`846fd178e723378cde86f90e292943bf16152e6f`；base/merge-base：`b2e0ac89e5cca13f20a8307437c1ff6c6d14e4af`。仅审固定五提交，不修产品。

## (a) missing / partial

未发现候选准备阶段的阻塞遗漏。INK-REL-160:15 明确“执行者161只准备本地候选”；默认完整非UI/精确HEAD CI、tag/draft/upload/publish及公开下载复验由根执行，当前待执行不计为161遗漏。

## (b) scope creep

未发现。INK-REL-160:17 允许“精确固定旧Beta1 tag/prerelease/清单SHA…并验证同release资产URL”；ReleaseLookup.swift:57–70 仅接受固定原字节、指定标签/渠道及两包URL，没有扩大到任意缺bundle清单，也不授予安装信任。

## (c) implemented wrong

P3：更新说明仍有版本歧义。契约 INK-REL-160:9：“本版包含当前main变化及原生只读‘检查更新’”，且只有“旧Beta1无更新客户端”。docs/updates.md:7 已说明 Beta2 历史适配，但 :11 仍称“旧 Beta1/2 没有更新客户端”，未限定旧Beta2/build4未发候选，容易让读者误以为本次build5也没有只读检查入口。建议明确build4与build5，保持生产自动安装未激活的说明。

独立核对：hostless 17/17通过；实际manifest consumer返回build5；Python核对严格8字段、两包长度/SHA、ZIP正式bundle/0.1.0/build5/mac14.0及source/HEAD产品树一致。ZIP `bb1a9537…4033e`，DMG `3724e8a1…7c0e5`。SOURCE为local候选，最终公共SOURCE由根替换；PROVENANCE及包字节保持。

作者证据引用：export/ZIP/DMG严格签名、权限、双架构和离线资源通过；raw archive strict=1、权限smoke=65，记录没有伪报通过。本人未重跑签名/挂载、完整Native/Release/CI或人工门槛，未安装启动App、未操作GitHub Release。结论：1项P3说明歧义，无已发现产品/包阻塞；不代表发布门禁已完成。
