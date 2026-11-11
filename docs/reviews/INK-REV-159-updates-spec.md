# Spec

固定受检 HEAD：`fe9fa20af585232c1948da556d267c0a35db56b9`；base/merge-base：`cf889ab1f9671bd90fb2820883c907edc3fa92fa`。初始 clean、十二提交、非空指定 diff 均已核对。仅审不修，详细命令、覆盖及证据层级见 [任务记录](../tasks/INK-REV-159.md)。

## (a) missing/partial

未发现额外确定缺项。真实同 Team 分发运行、生产信任激活、安装/重启和物理输入未验，不能据源码或作者测试宣称通过；这些属本轮明确保留边界。

## (b) scope creep

未发现。Native HTTPS 与 exact Sparkle 2.10.0 是明确授权例外；编辑器离线边界未扩张。没有将缺生产公钥/feed、历史 Beta1 无法确认或未知延期保守锁通道列作缺陷。

## (c) implemented wrong

**[P2] legacy 分支允许冲突顶层元数据继续产生可验证版本结果。** 位置：`app/Sources/ReleaseLookup.swift:51`、`:94–112`。规格原句（secure-updates「根已裁定的接线」）：“旧清单只允许显式兼容 `checks.*.versions`，重复字段冲突拒绝。” 同段要求缺失/冲突元数据只能显示无法确认。

该分支仅比较 checks 内的版本，忽略同时存在的顶层 `bundleIdentifier` / `buildVersion`；`schema` 存在但不是字符串也回落 legacy。独立 hostless 探针：checks 中正式 bundle/build3，顶层改为 other.app/build999，仍返回3；`schema=42` 也返回3。调用者据此可显示“没有较新的可验证发行版本”，把冲突清单当作已验证。应仅对明确旧格式启用兼容，拒绝冲突的重复语义字段及存在但无效的 schema；保留合法 legacy 对照。没有修改产品或测试。

其余静态核对：正式 archive 选择 Distribution；默认不链接 SDK且保持 LV；下载失败只清归属本次的未准备意图；普通退出与 SDK 退出共享 prepare/review/recovery 链；本地 staging/manifest 与生产安装许可分离。此结论不等同完整 Native 或安装验收。
