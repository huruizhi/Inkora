# ADR-0001：技术栈——原生 AppKit 外壳 + WKWebView 编辑内核

- 状态：已接受（2026-11-02）
- 决策人：用户 / 主 Agent

## 背景
需要 Typora 风格所见即所得 Markdown 编辑，同时保证文件保真、中文输入法、撤销重做可靠，并上架 Mac App Store。

## 候选
A. 纯 SwiftUI/AppKit + TextKit 2：原生最佳，但 WYSIWYG（标记隐藏、表格、代码块）需从零实现，风险最高。
B. AppKit 外壳 + WKWebView 编辑内核：原生菜单/NSDocument/沙盒文件访问 + 成熟 Web 编辑器。
C. Electron：体积大、原生感差、上架受限。
D. Tauri：同样基于 WKWebView，额外引入 Rust，相比 B 无明显收益。

## 决策
采用 B。最低 macOS 14，启用 App Sandbox，文件通过 NSDocument + 安全作用域书签访问。
编辑内核在 B1（CodeMirror 6 实时预览，源码为唯一事实来源）与 B2（ProseMirror/Milkdown 文档模型）间
通过 Phase 0 原型对比后确定，结果记录为 ADR-0002。

## 后果
需维护 Swift↔JS 桥接协议；编辑内核以 Vite 构建为静态资源打包进 App Bundle，运行时不依赖网络。
