# ADR-0003：工程生成、编辑器资源与 Bridge

- 状态：已接受（2026-11-06）

## 背景

Inkora 需要可审查的 macOS 工程定义、离线 Web 编辑器资源，以及不会破坏 Markdown 文本的跨层接口。

## 决策

1. 使用 XcodeGen，以 `project.yml` 作为 Xcode 工程的唯一来源。`make setup` 安装工具并生成
   `Inkora.xcodeproj`，生成物不提交。
2. Vite 将编辑器构建到 `build/editor`。Xcode 以 `editor` folder reference 将完整目录复制进
   App Bundle。原生侧以只读 `inkora-editor://app/` scheme handler 从该目录提供静态资源，
   不通过 HTTP/HTTPS 加载资源，也不暴露 Bundle 外的文件路径。
3. Swift 与 TypeScript 通过单一 `WKScriptMessageHandler` 交换 UTF-8 JSON 字符串。
   初始骨架使用协议 v0；INK-004 已将唯一跨层接口升级为带 revision 的 v1，定义在
   `docs/bridge-protocol.md`。
4. 运行时不加载远端脚本或资源；Content Security Policy 禁止网络连接和外部对象。
5. `NSDocument` 读写用户选择的文件时显式进入安全作用域。跨启动持久化书签属于最近文件恢复流程，
   在对应任务中实现。
6. macOS 27.2 的沙盒 WKWebView 需要 `com.apple.security.network.client` 才能连接系统
   WebContent 进程。该 entitlement 仅满足 WebKit 进程启动要求；运行时仍由自定义本地 scheme、
   CSP `connect-src 'none'` 和导航白名单共同禁止 HTTP/HTTPS 访问。

## 后果

- 开发机和 CI 需要完整 Xcode、Homebrew、Node、pnpm 与 XcodeGen。
- 修改 `project.yml` 后必须重新生成 Xcode 工程。
- 保存依赖 `createSnapshot` 请求成功；Bridge 失败或 revision 不匹配时保存失败，不允许使用
  陈旧正文覆盖文件。完整 Save barrier 留给 Issue #13。
