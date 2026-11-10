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

## 最终本地候选

- 源码 commit：`bd45d4bd4bb62e9cc5ae4d8891664de5b6183cc4`；后续若仅追加本文结果，不改变候选产品源。
- `make release-dry-run`：exit 0。Release archive、ad-hoc/runtime 签名结构、正式 bundle id/entitlements、只读 DMG 挂载及 ZIP 解压校验、离线 bundle 检查均通过，未启动 App。
- App：0.1.0 / build 3，`lipo -archs` 实测 `x86_64 arm64`。
- ZIP SHA-256：`1eefe39701165fe63d26b0fb5aa77212e97e83a5f1b9e634ccf125ca793836c6`。
- DMG SHA-256：`8b35253dd40aa3f6de9e02cb5d79f07ab0e1cd1c3597e5d78ac188fd5cfd9b66`。
- 包中 Mermaid vendor SHA：`581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8`；生产依赖许可 SHA：`e3172016448d716c712ba40170958abc9a87b3975862e3d81b4ccb47cf187dc4`。
- 原产物在本 worktree `artifacts/release/dry-run/`；稳定副本在主仓库 `artifacts/release-candidates/0.1.0-beta.1-build3/`，复制后逐文件 SHA 再核对，含 PROVENANCE.json 和 RELEASE-NOTES.md。
- `make lint`、`make test-ci` 在候选阶段也已实际 exit 0。最终默认 CI 将按仓库手动规则在最终分支提交上触发，链接/结果记录在 PR 及最终回报，不提前宣称通过。

当前证据不包含 Developer ID、公证、Gatekeeper 下载首启、最终深色/窄窗桌面检查；用户已明确此时只准备候选。没有创建公开 Release 或版本 tag。
