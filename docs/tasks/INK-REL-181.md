# INK-REL-181：安装任务空格修复 build9

用户要求更新本机。基线1fb0714c515e433fe7d203eee01c0010f3cc0efb，独立分支
 task/INK-REL-181-local-task-space-hotfix；产品只project.yml build8→9，marketing0.1.0。
包含178固定修复；原文/输入/历史语义不另改，无新依赖或发行权限扩张。

先make build-release，按源entitlements ad-hoc+runtime签名；核双架构/版本/资源及签名。
旧版压缩备份，发送正常退出请求，真实进程结束后才staging原位替换，不强退。
恢复目录仅私有备份，不打印/提交正文；安装后用真实资源跑178的21项生产Native/WK。
验证压缩回退后清临时可启动副本，保留唯一/Applications/Inkora.app入口。
只本机安装，不改公开GitHub Release，不触碰生产Keychain/签名公证资格。


## 实际安装与验证

源码构建161c29e9771df2fe6a371b42fa1768deef62307e，make build-release退出0。
0.1.0/build9、正式bundle ID、macOS14、arm64+x86_64核对通过；ad-hoc/runtime按源权限重签，
strict/deep及精确权限、离线资源通过，无Sparkle强链接，editor逐字节同178最终已测资源。
候选和安装后分别使用实际App资源运行178的21项生产Native/WK CLI，均21/21、0失败。
本轮不是重跑178的981/16 Web回归，不冒称其为本轮自跑；Swift产品源与178一致、只有版本不同。

旧进程12916正常terminate请求后曾仍运行；用户明确回复保存并退出，核对真实进程结束才替换。
正常退出后恢复目录私有备份、不打印/提交正文，staging全12文件SHA和签名核对后原位重命名。
安装全文件SHA与候选一致，失败回退保留到验证结束；严格签名再次通过，版本真实9。
根项目artifacts/deployments/build9-20261112-193144保留previous-build8.zip、installed-build9.zip与恢复备份，
ZIP CRC/plist、新包逐文件SHA通过。旧安装移废纸篓，生成临时Inkora.app在压缩校验后删除；
构建树额外Inkora bundle为0，/Applications无遗留.Inkora-*.app，第三方SDK helper不改。

通过系统LaunchServices正常重新打开新版，退出码0、新进程PID20041、路径为安装后可执行文件，
核对进程持续运行与磁盘build9；没有修改窗口或输入正式文档。
CUA native pipe本轮不可用，不能确认可见窗口/对话框；process launch与可见paint分开记录，
不把进程存在当成完整GUI/物理IME验收。未跑全量Native/XCU/CI、公证或公开发布。
既有Swift隔离/Vite chunk警告保留。产品变更仅project.yml版本，新增本记录与同域证据/收据。
源码产品树与构建commit一致；完成后仅unlink两个自建依赖链接，保留工作树与压缩回退。
