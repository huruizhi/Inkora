# INK-REV-159 P2 限定补正

根独立Spec审查固定整合fe9fa20发现：schema类型坏会回落legacy；合法checks同时带矛盾顶层bundle/build，仍能产生可验证结果。只修改ReleaseLookup、同域解析测试和本任务证据，没有改审查报告、root或B文件。

## RED → GREEN

在自有分支a39bec2上新增公共ReleaseLookup.build回归，未修改实现先执行 `docs/evidence/INK-UPD-156/run-policy-tests.sh`：14项中47个断言失败，见release-lookup-review-red.txt。包括schema=42/null、矛盾bundle/build、错类型别名、额外检查项坏versions；合法checks对照仍通过。

修正后并补充布尔别名/历史Beta1拒绝对照，同一hostless命令15项全过，见release-lookup-review-green.txt。测试用实际产品Swift源码，独立defaults/URLProtocol，不调用公网或AppDelegate，不显示窗口。没有重复全量/Release/UI门禁。另运行swiftc typecheck、两文件swift-format strict lint、git diff --check均通过。

## 规则

- schema键只要存在，就必须按新schema严格校验。null、数字、布尔、容器、空值或未知schema全部拒绝；类型失败不视作缺失。
- legacy仍要求checks.export/zip.versions有效、正式bundle且内容一致。额外checks项若含versions，其类型和值也必须正确一致；坏检查项容器不再静默跳过。
- 已知顶层语义别名若出现，必须为正确类型且与checks/release一致：bundleIdentifier/CFBundleIdentifier；buildVersion/build/CFBundleVersion；marketingVersion/version/CFBundleShortVersionString；tag/releaseTag/tag_name；channel；prerelease/isPrerelease。
- 营销版本别名不能凭tag补出checks中缺失值；checks含营销版本时必须与release tag匹配。prerelease别名必须是真JSON布尔，数字1也拒绝。
- schema缺失的合法旧checks格式继续支持。历史公开Beta1仅顶层build/version/releaseTag且缺bundle/checks，仍明确无法验证，不通用放宽。

原始日志保留build/release-lookup-review-{red,green}.raw.txt；入库版本仅清行尾空白。此补正不改变SDK、安装授权、生产信任未激活和真实安装未验边界。
