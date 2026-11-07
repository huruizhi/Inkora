# Inkora

面向 macOS 的现代 Markdown 编辑器：所见即所得的实时渲染编辑，Markdown 文件保真优先。

- 状态：1.0 开发中（Foundation、Editor Core、Native Bridge 已完成，macOS MVP 进行中），路线图见 [#1](https://github.com/huruizhi/Inkora/issues/1)
- 平台：macOS 14+，App Sandbox，离线运行
- 分发：Developer ID 签名、公证后直接分发（DMG/ZIP）；不上架 Mac App Store
- 架构：原生 AppKit `NSDocument` 外壳 + WKWebView 承载离线 ProseMirror 编辑内核，两层之间只通过带 revision 的 Bridge 通信（见 [`docs/adr/`](docs/adr/)）
- AI：AI 辅助属于后续规划，必须与编辑器解耦，是唯一允许访问网络的模块

## 架构不变量

- 原生层负责文件、窗口、保存和关闭决策。
- ProseMirror 负责内容模型、selection 和 Undo/Redo。
- Bridge 是唯一的跨层接口，用 revision 保证两层一致。
- 不允许静默丢失用户的 Markdown 内容。

## 开发

环境要求：macOS 14+、Xcode、Homebrew。

```sh
make setup   # 安装 node、xcodegen 与固定版本 pnpm，构建编辑器并生成 Xcode 工程
make lint    # swift-format strict + TypeScript lint
make test    # 按层运行全部测试（编辑器、Bridge、XCTest、XCUITest、CI 脚本）
make run     # 构建并打开 Debug App
```

只跑某一层的测试：`make test-editor`、`make test-bridge`、`make test-native`、`make test-ui`、`make test-document-open-ui`。完整命令、诊断产物目录和 CI 说明见 [docs/testing.md](docs/testing.md)。

> UI 测试会接管桌面，本机的所有 UI 测试通过 `/tmp/inkora-ui-tests.lock` 排队。Agent 在本地只运行非 UI 目标，UI 目标由 CI（本机 self-hosted runner）执行。

## 协作

Agent 与贡献者的协作规范见 [AGENTS.md](AGENTS.md)：每个任务在独立分支 `task/<TASK-ID>-<slug>` 上进行，提交信息使用英文 Conventional Commits，任务说明在 [`docs/tasks/`](docs/tasks/)。

## 文档

**架构决策**
- [ADR-0001 技术栈](docs/adr/0001-tech-stack.md)
- [ADR-0003 工程生成、编辑器资源与 Bridge](docs/adr/0003-project-and-bridge.md)

**Markdown 与数据保真**
- [Markdown 1.0 支持矩阵与数据保真规则](docs/markdown-support.md)
- [文本格式边界：编码、换行符、Unicode 与文件名](docs/text-format.md)
- [未知 Markdown 检测与保存闸门](docs/markdown-safety.md)
- [Markdown Codec 与规范化规则](docs/markdown-codec.md)

**编辑器**
- [编辑器 schema](docs/editor-schema.md)
- [块级编辑](docs/block-editing.md)
- [行内格式](docs/inline-formatting.md)
- [编辑会话、历史与粘贴语义](docs/editor-session.md)

**原生层与 Bridge**
- [Editor Bridge Protocol v1](docs/bridge-protocol.md)
- [WKWebView 离线编辑器宿主](docs/offline-editor-host.md)
- [Revision 同步、Snapshot 与 Save Barrier](docs/save-barrier.md)
- [Markdown 文档保存](docs/document-save.md)

**质量**
- [构建、测试与 CI 入口](docs/testing.md)
