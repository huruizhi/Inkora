# INK-REL-177：安装标题输入呈现修改 build8

用户授权安装本次174修改。独立分支task/INK-REL-177-local-heading-hotfix，
基线8c35645a67957be03887a4cf46668c40b8a74e2e；本轮产品仅project.yml build7→8，
marketing 0.1.0不变，保留174全部固定代码/测试/复审。

构建正式bundle ID Release、源码entitlements ad-hoc+runtime签名；
核对双架构、离线资源、完整字节清单，原位staging/rollback替换。
当前旧安装运行；已请求保存并退出，桌面CUA native pipe失败；不在退出前替换、不强退。
安装后用真实安装资源跑174生产Native/WK 19项，核对版本/签名/资源身份。
只本机安装，不发布GitHub/不改Developer ID或公证状态；旧包压缩备份和临时.app收起。
无用户正式文档改动，恢复数据只做私有备份，不打印或提交正文。


## 实际执行与结果

源码构建固定04e7b95e7543b0f013314582e428605cd1ff7c50，`make build-release`实际exit0。
当前安装从7升至8，marketing0.1.0、正式bundle ID与macOS14保持；lipo实测arm64+x86_64。
使用源权限清单ad-hoc/runtime重签去掉Xcode额外调试权限；strict/deep验签与精确权限检查通过。
无Sparkle强链接，离线bundle smoke通过；包内editor资源与174最后验证的build/editor逐字节同SHA。
本轮不是重复运行174的965/16 Web检查；该组仅作已验证源码依据，不冒称本轮自跑。

旧进程98171以路径核验后通过NSRunningApplication.terminate发出一次正常退出，
随后实际进程消失；未用SIGKILL/SIGTERM，不在进程存活时替换。
正常退出后的持久化恢复目录私有备份（不打印/提交正文），同目录staging全文件SHA+strict签名
通过才原位重命名替换，失败回退逻辑保留；安装后全12文件SHA与候选一致。

`INKORA_WRITING_RESOURCE_BUNDLE=/Applications/Inkora.app`使用174最后编译的真实生产
Native/WK测试CLI，**19/19、0失败**：含level1/2正文大小→标题字号、灰色伪标记、
strong末尾空格、中文候选连接/logical revision及原文/UndoRedo/关闭准备。
本轮Swift产品源码与174一致，只版本不同，检查已安装资源而非旧构建路径。
收据见installation.json，原始命令输出另留/tmp与artifacts，文档仅去行尾/末尾空白。

原版previous-build7.zip与installed-build8.zip私有备份在根项目artifacts/deployments/
build8-20261112-184805，ZIP CRC/plist及新包逐文件SHA通过。旧安装移至废纸篓，
本任务生成的临时Inkora.app在压缩核验后删除；自建两个依赖symlink已unlink，源依赖不动。
第三方SDK Updater.app未改动，不属于Inkora副安装；构建树额外Inkora bundle数量为0。

## 文件与未验边界

产品文件仅project.yml build8；新增本任务记录及同域构建、签名、安装测试和完整SHA收据。
安装位置/Applications/Inkora.app，用户正式文档/恢复原件未改写。
CUA getApp本轮再次native pipe失败，结束桌面连接验证；未作可见启动、物理IME/paint/
VoiceOver/macOS14验收，需用户手动打开。没有绕过桌面连接去操作窗口。
仍为未公证ad-hoc本机预览，无GitHub tag/Release/公开上传/生产Keychain变更。
未跑完整Xcode Native/XCU、远端CI或正式Release公证。既有Swift隔离与Vite chunk警告保留。
工作树、构建中间产物、原始日志和压缩回退均保留。
