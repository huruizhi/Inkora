# INK-UPD-156 证据索引

- phase1.md：官方固定SDK、加载反例及退出源码语义。
- adhoc-load-probe.m / adhoc-load.txt：真实runtime+LV加载失败；预期1，非成功。
- sdk-version-probe.swift / sdk-version-probe.txt：真实SDK comparator，非runtime资格证明。
- spm-resolve.txt / config/Package.resolved：官方exact包解析。
- native-build.txt：普通Xcode Debug编译，通过；不等于签名运行。
- native-test-summary.json / native-tests.txt：同工程48定向测试通过。
- close-barrier-tests.txt：新增关闭测试首轮fixture失败，保留。
- close-barrier-tests-retry.txt / close-barrier-summary.json：修正真实文档挂接后离屏WK测试通过。
- run-policy-tests.sh / policy-tests.txt：可重复hostless9项测试通过。
- distribution-typecheck.txt / distribution-link.txt：全源码+真实SDK编译检查和独立链接，无执行。
- distribution-guard.txt：真实分发构建因身份缺失被guard拒绝，不能叫分发构建成功。

没有完整客户端实际安装/重启、生产信任源或UI验证证据。详见任务文档。
