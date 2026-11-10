# INK-REL-118：显示优化 Release 候选

用户目标为完成显示优化并发布 Release；经发布预检发现无有效 Developer ID 身份和公证配置后，用户明确选择“暂时没有，先准备 Release 候选”。本任务收口本地候选，不宣告公开发布完成。

分支 `task/INK-REL-118-display-release-candidate`，固定起点 `a61dee1`，包含 INK-UX-110 的事实、112 的排版与低干扰界面、115 的离线技术内容渲染。版本 0.1.0，build 从 1 递增为 2；未创建或覆盖 tag。

## 门禁与范围

- 产品源自 UX-115 的 Web 772、Native 190 total / 182 passed / 0 failed / 8 performance skip，Bridge Web 14 / Swift 15，lint/Debug/CI 入口实际通过。
- 112 独立审查 P2 键盘工具入口已补正并后验关闭；115 独立审查 P2 容器公式已在 `2e0be9f` 补正，Spec 后验关闭，Standards 有限补正无新增 hard。
- 候选采用既有 `make release-dry-run`，保持签名、公证与候选层级分离。
- 最终桌面复查预检为锁屏 exit 78；不绕过或重新要求既有用户输入测试。候选结构不等于完整视觉/物理验收。

## 产物与结果

构建后追加本任务真实命令结果、源码 commit、ZIP/DMG SHA256、App 架构与资源校验。当前不提前写成构建通过或公开发布。

## 候选迭代

build 2 在独立审查完整收口前生成，结构与离线检查通过，但其公式容器显示存在 P2，未发布。最终候选递增为 build 3，集成只读 canonical 数学正文与账本误拒补正，Web 777、Native 182 passed/8 skip、Bridge 14/15 及非 UI 门禁已通过；不沿用 build 2 的包或校验和。
