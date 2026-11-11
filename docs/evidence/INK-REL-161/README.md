# Beta2 build5 候选核对

构建源码：76715e0dc3dac6e0bb1aae75b513256ad7ba7eb2。后续仅证据提交，app/editor/project.yml不得变化。候选目录：artifacts/release/beta2-build5-preview；原始dry-run日志、包与build均保留，供根双备份，不上传整个build。

实际命令与结果：

- `bash docs/evidence/INK-REL-161/run-policy-tests.sh`：原实现真实RED两项失败；精确历史兼容后17项全通过。lookup-real-{red,green}.txt为有效证据。早期lookup-{red,green}.txt是夹具未复制失败，不作反例。固定夹具SHA为b29c77533ab291232e7d612f6ca293200ea93a8858e9d7da7a7d5327b19a7e26；只读历史元数据，不授予更新安装信任。
- `make lint test-ci`：通过；末次`make lint`另见final-lint.txt。没有setup、安装依赖或升级SDK。
- `make release-dry-run`：exit0，未套通用capture；原始artifacts/release/dry-run/release.log保留。Xcode出现既有SwiftCompile“exit code 0 but produced no further output”、actor隔离和App Category警告；最终archive/打包/结构核对成功。
- `xcodebuild -quiet -project Inkora.xcodeproj -scheme Inkora -destination 'platform=macOS' -derivedDataPath build/DerivedData -resultBundlePath artifacts/test-results/rel161-native.xcresult -only-testing:InkoraTests/ReleaseLookupTests -only-testing:InkoraTests/UpdatePolicyTests test`：exit0，xcresult实际12/12通过。hostless单元测试不启动产品App。
- `python3 docs/evidence/INK-REL-161/check-candidate.py`：四处plist为正式bundle、0.1.0/build5/mac14.0；真实lipo均x86_64+arm64，无Sparkle强链接。export/ZIP/DMG strict deep/runtime/精确展开entitlements/离线bundle全部通过；未关闭Library Validation。raw archive按既有CODE_SIGNING_ALLOWED=NO流程不带签名，strict=1、bundle-smoke权限阶段=65，不能报其签名权限通过；其HTML/CSP/JS阶段在权限检查前已通过。DMG仅readonly/nobrowse/noautoopen挂载并已卸载。
- 第一次archive签名权限probe失败见archive-probe-note；第二次probe因比较未展开PRODUCT_BUNDLE_IDENTIFIER占位符失败，原输出four-locations-unexpanded-entitlements-failure.txt保留，修正期望值展开后核对通过。未修改包字节。
- `make test-update-manifest`：5/5。使用既有manifest.py create及verify基于最终包字节生成严格8字段PROVENANCE，local receipt仍published=false。公开URL是最终文件名；未检查未创建的真实release metadata，由根负责。
- `swiftc app/Sources/ReleaseLookup.swift app/Sources/UpdatePolicy.swift docs/evidence/INK-REL-161/consume-manifest.swift -o build/release/rel161-consumer` 后执行实际新清单：当前consumer返回build5。
- 两包复制后实际cmp相同；SHA256SUMS包含两包、PROVENANCE、SOURCE、CHECKS，副本见本目录。没有复用build4 provenance。

未完成由根结算：完整非UI/精确HEAD CI、实际GitHub发布与匿名下载复验、原始日志与build双备份。本执行者未操作tag/PR/Release/draft/upload/App安装启动/GUI/Keychain/权限。无Developer ID或公证、未做quarantine/Gatekeeper下载首启、完整桌面与macOS14实测。不能宣称自动更新安装上线或正式质量门槛通过。
