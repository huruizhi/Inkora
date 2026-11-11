# INK-REL-161：Beta2 build5 本地候选

归属与授权以 INK-REL-160 为准；固定起点6ce04cc2122b59a764f408c7c025a44643127709，初始clean。仅准备本地候选；根管理者负责实际发布，不安装或启动App。

版本0.1.0/build5，旧build4候选保留。公共ReleaseLookup遇实际Beta1旧清单会使新build5列表查询整体失败：真实URLProtocol接缝原实现RED、修复GREEN见 evidence/INK-REL-161/lookup-real-{red,green}.txt。仅对固定SHA/tag/prerelease和同release两包URL做历史适配；不授予安装信任，不放宽未知坏清单。原始fixture是公开只读元数据。

早期lookup-red/green日志因既有runner未复制fixture而失败，不作为产品反例；新增同域runner后才取得真实RED/GREEN。17项GREEN包含改字节、错渠道、缺URL与原schema/冲突/null负控。make lint test-ci通过。后续源码提交后运行release-dry-run，新包不复用旧字节。完整非UI/精确HEAD CI归根管理者集中结算；物理IME/macOS14/下载首启/桌面验收未执行。
