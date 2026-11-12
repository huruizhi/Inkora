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
