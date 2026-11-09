# Spec

- 任务：INK-REV-076 图片集成 Spec 独立审查
- 固定起点：`c9e247defa790db399f6286f8e83086b736bfd4d`
- 受检 HEAD：`a58b8ba1edddb7863856214b9c36f0893030bf11`
- 分支：`task/INK-REV-076-image-integration-spec`
- 状态：完成，4 项 finding，0 项范围扩张

## 完成内容

- 核对固定 refs、HEAD、clean 状态、非空三点 diff 与 7 条提交列表。
- 读取指定领域、保存、Bridge、恢复、测试与 V4 规格，仅执行 Spec 轴。
- 以生产 `SourceAuthoritySession` 复现首存失败后的同目标/异目标重试拒绝。
- 以生产 Swift migration seam 复现合法括号 destination 被截断。
- 静态贯通 pending import 的跨进程发现链与 bookmark/scope/lease 链。

## 实际验证

- 临时 Vitest：`1 passed`；确认已改写 owner 的同目标重试和异目标改写均返回 `false`。
- 临时 Swift scratch：输出 `["Old.assets/a(b"]`，确认 `![x](Old.assets/a(b).png)` 被截断。
- 未重复 root 已执行的 Web 570、Native 159、lint、Release/offline bundle 与 `test-ci`；这些不是本审查者执行证据。
- 未运行 App、GUI、CUA、XCUITest、真实 Sandbox/WK、系统面板、输入源或用户文件验收。

## 产物与风险

- 审查报告：`docs/reviews/INK-REV-076-image-integration-spec.md`
- 任务记录：`docs/tasks/INK-REV-076.md`
- 未修改产品实现、依赖、lock、entitlement；临时测试、二进制、目录与借用 symlink 已清理。
- 风险：4 项均待 root/实现任务处理；本任务不修复、不 PR、不 merge、不改 Issue。
