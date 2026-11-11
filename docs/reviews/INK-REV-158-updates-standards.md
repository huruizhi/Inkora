# Standards

固定审查 `cf889ab1f9671bd90fb2820883c907edc3fa92fa...fe9fa20af585232c1948da556d267c0a35db56b9`，仅 Standards 轴。初始 clean、HEAD、merge-base、十二提交及非空 diff 均核对一致。书面源、命令和证据层级见 [task](../tasks/INK-REV-158.md)。

书面标准偏离：未发现有充分证据的硬违规。Native HTTPS 与 exact Sparkle 2.10.0 为本票明确授权例外；编辑器离线边界不变。默认目标不链 SDK，Distribution 显式启用并保留签名 guard；共享退出模块维持 prepare→review→recovery/reply。生产凭据缺失及 Beta1 缺 bundle 的“无法确认”属于批准边界，不列缺陷。此结论不等于 Spec 完成度或发布许可。

判断性建议（均为低优先级、非阻塞）：

1. **possible Duplicated Code**：新增 `scripts/updates/manifest.py:37–50` 与 `staging.py:38–51` 重复 ZIP 路径、顶层 plist、bundle、build/营销版本验证形状，例如两处 `infos == ['Inkora.app/Contents/Info.plist']`。规则已出现漂移：manifest 拒绝重复 entry 并严格约束版本，staging 使用另一套版本表达式。建议抽取两工具共同的 ZIP 身份读取与基础验证，递增 build、架构和最低系统继续留在 staging。不同工具的资格差异可以保留，不主张合并各自完整政策。
2. **possible Primitive Obsession**：新增 `app/Sources/UpdateInstallationState.swift:35–41` 以 `domain: String, code: Int` 和 `"SUSparkleErrorDomain", [3000, 3001, 3002]` 表达允许释放意图的失败类别。建议 SDK adapter 用官方命名常量映射成小型领域失败枚举，独立状态机消费该枚举。当前数值与固定 2.10 头文件一致，未发现错误分类；建议旨在使安全判断可读且减少 SDK 变更时的同步点。

其余十项 Fowler baseline 已逐项考虑，未见值得单列的新增判断项；跳过格式等工具强制项。独立运行 manifest 5项、archive scheme stub 2项均通过。未运行完整 Native/Release/CI、UI/IME/macOS14 或真实安装；作者与根的历史证据仅引用，不能替代本审查实跑。

## Post-fix 限定静态复核

固定新产品 `0993c323ba299d1561de6f4a8d15b683e7635ced`，相对 `fe9fa20af585232c1948da556d267c0a35db56b9`，仅核对 ReleaseLookup legacy 冲突补正、同域测试及文档/审查记录新增 hunk。未发现新增书面 hard 偏离；原两项 possible smell 保留，不新增判断项。不作 Spec 缺陷关闭或完成度裁定。未重跑测试、构建或工具验证；精确命令见 task 追加记录。
