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


## 安装完成

用户明确回复已保存并退出。通过进程路径确认旧安装已停止后，备份持久化恢复目录
（仅复制、不打印正文、不入Git），同目录staging核对完整12文件SHA和strict签名，
原位重命名替换；回退路径保留至安装后验证完成。没有强退、改用户正式文档或清恢复记录。

实际安装为`/Applications/Inkora.app`的0.1.0/build7，bundle ID保持不变。
安装全文件SHA逐项等于固定候选清单；严格验签通过。
`INKORA_WRITING_RESOURCE_BUNDLE=/Applications/Inkora.app`运行168编译的真实生产
Native/WK测试二进制，16/16通过（含连续输入、任务勾选、列表回删、原文/历史和关闭准备）。
173的Swift产品源码与168一致，只有版本增加；没有冒称重新运行全量Native/XCU/CI。
日志见installed-wk.txt，清单与收据见installation.json。

CUA getApp再次失败native pipe startup failed，结束该桌面验证；可见启动未验证，
不改用其他桌面控制。需用户手动打开，不宣称已唤起。
旧安装已移入废纸篓；新构建候选已在核验压缩包后删除，避免多份可启动安装。
根项目备份中保留previous-build6.zip、installed-build7.zip及安装前恢复数据；
ZIP已解读plist/校验CRC，新ZIP逐文件SHA与安装一致。两个自建依赖链接完成后unlink，
保留工作树、全部原始日志/构建中间产物与压缩回退。

本轮产品变更仅project.yml build7；新增本任务记录与同域构建/签名/安装测试收据。
源码构建127a3f48a97e30cb53628149531400033235a9a4；后续文档不改变app/editor/project树。
未公开发布；仍为ad-hoc本地预览，无Developer ID/公证，可见/物理IME等边界保持。
