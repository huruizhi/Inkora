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
