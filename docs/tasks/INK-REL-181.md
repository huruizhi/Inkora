# INK-REL-181：安装任务空格修复 build9

用户要求更新本机。基线1fb0714c515e433fe7d203eee01c0010f3cc0efb，独立分支
 task/INK-REL-181-local-task-space-hotfix；产品只project.yml build8→9，marketing0.1.0。
包含178固定修复；原文/输入/历史语义不另改，无新依赖或发行权限扩张。

先make build-release，按源entitlements ad-hoc+runtime签名；核双架构/版本/资源及签名。
旧版压缩备份，发送正常退出请求，真实进程结束后才staging原位替换，不强退。
恢复目录仅私有备份，不打印/提交正文；安装后用真实资源跑178的21项生产Native/WK。
验证压缩回退后清临时可启动副本，保留唯一/Applications/Inkora.app入口。
只本机安装，不改公开GitHub Release，不触碰生产Keychain/签名公证资格。
