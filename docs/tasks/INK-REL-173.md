# INK-REL-173：本机写作修复 build7

用户要求替换本机。独立分支task/INK-REL-173-local-writing-hotfix，
基线1caa9b9a46e4d3f79349ae8d70929c2540962778，保留全部168修复。
本轮产品只将project.yml build6升至7，marketing仍0.1.0。

计划先make build-release构建正式bundle ID，使用源码权限清单ad-hoc+runtime签名，
核对双架构、离线资源和安装包身份。当前用户App运行且CUA native pipe失败，
已请求用户保存并正常退出；不在退出前替换、不强退、不改正式文档。
安装采用同目录staging/原位重命名和回退，旧版本压缩备份，不留额外可启动副本。
安装后以实际安装资源运行168的16项隐藏WK测试；不把它冒称物理键盘或可见启动。
本轮只本机部署，不发布GitHub、不改变Developer ID/公证状态。


## 候选验证（安装前）

构建源码固定127a3f48a97e30cb53628149531400033235a9a4。
`make build-release`成功；0.1.0/build7、正式bundle ID、macOS14及arm64/x86_64核对通过。
按源entitlements去掉Xcode额外调试权限后ad-hoc+runtime重签，strict/deep及精确权限核对通过，
无Sparkle强链接、离线bundle smoke通过。候选App实际资源运行168的生产Native/WK CLI：16/16通过。
这些事件是隐藏WK synthetic，不替代物理IME或可见启动；既有编译隔离warnings保留。

旧安装已压缩备份到根项目artifacts/deployments/build7-20261112-154629/previous-build6.zip。
桌面连接失败，不能读取当前保存对话框；通过NSRunningApplication.terminate发出一次正常退出请求，
生产applicationShouldTerminate负责未保存保护，没有SIGTERM/SIGKILL或跳过review。
安装仍需等原进程真正退出；候选就绪不能冒称安装完成。
