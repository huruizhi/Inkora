# INK-FIX-164：恢复标题栏拖动窗口

## 目标与范围

用户报告按住标题栏无法移动 Inkora。基线 `755dc6cf60b6d1b1b69c46df0873e9b36bfe3822`。
仅修复原生标题行鼠标路由，保留右侧统计/侧栏按钮、系统窗口按钮及正文编辑。
不修改 Markdown、编辑内核、输入法、保存策略、依赖或发行信任配置。

## 原因与实现

fullSizeContentView 使 WK 覆盖系统标题栏；原设置禁止整窗背景拖动，WK 命中没有原生拖动入口。
初始真实隐藏窗口测试以标题中央命中原生拖动面为断言，8 项中 1 项失败（red.txt）。

新增透明原生 WindowTitlebarDragSurface；Native 安装的 WKUserScript 通过原 inkora JSON
通道发送标题文字/空白与工具容器之间的有限布局矩形。只在顶部 28 点、系统按钮安全区
右侧命中，左键交给 AppKit performDrag，不把整个正文设成可拖动背景。
标题/工具 ResizeObserver 与侧栏阶段监听更新布局；初始挂载观察器完成后断开，
普通正文 mutation 不触发布局消息。导航/resize 清旧授权，非法尺寸拒绝。

诊断中隐藏 WK 的 requestAnimationFrame 不发布布局，改为有界合并 setTimeout；
仅依赖尺寸监听还漏掉侧栏关闭后纯位置变化，增加侧栏阶段与过渡完成监听。
没有通过开启窗口背景拖动或吞掉工具点击绕过问题。

## 验证

最终命令与结果见同域 evidence（完成时补充）。
隐藏窗口测试证明真实 DOM 几何、Native hitTest 与 performDrag 的事件交接；
不将它称为屏幕实际移动、物理鼠标拖动或 macOS 14 实机验收。
未启动用户 Inkora、未替换安装、未发布新版本。

## 最终实跑结果

- `tests/InkoraTests/SidebarNavigationHostless.sh`：10/10 通过。实际编译生产 Native 源码（不含 AppDelegate），
  真实隐藏 WK 中覆盖 1280/600/480 及 resize、侧栏正反向/reduced-motion；新增原生事件交接与非法区域测试。
- `make lint`：通过；最终修改 Swift 另经 `swift-format lint --strict` 通过。
- `make editor-build`：通过（含 TypeScript）；没有改动 Web 业务源码与依赖。
- `git diff --check`：通过。
- 既有 InkoraDocument actor/Any? 编译 warning 未修改；未运行完整 Xcode App 构建、全量 CI/Release 或可见 UI。

隐藏 WK 暂停通知的边界：侧栏终态测试沿用既有 Web Animations.finish；
Native 路由轮询时读取真实 DOM rect 促使隐藏 WK 刷新布局通知，不伪造布局消息。
早期位置检查的等待失败属于该隐藏窗口通知边界；生产监听覆盖尺寸、侧栏阶段和过渡终点。
最终测试明确保留实际屏幕拖动、物理鼠标与 macOS 14 验收未完成的限制。

## 文件与交付

- `app/Sources/WindowTitlebarDragSurface.swift`：UI 几何校验、透明命中面与原生拖动交接、离线布局脚本。
- `app/Sources/EditorViewController.swift`：WK 子类接入拖动面、resize 失效处理和命中路由。
- `app/Sources/EditorBridge.swift`：同 origin/同 JSON 通道接收几何事件，导航时清旧区域。
- `tests/InkoraTests/SidebarNavigationTests.swift` / `SidebarNavigationHostless.sh`：回归及测试数量更新。
- `docs/bridge-protocol.md`：明确纯 UI 通知边界。
- 本任务记录及 `docs/evidence/INK-FIX-164/`：实际红绿、lint 和构建日志。构建日志仅去行尾空格；原件保留在 `artifacts/INK-FIX-164/editor-build.raw.txt`。

分支：`task/INK-FIX-164-titlebar-drag`。提交 SHA 以最终回报为准。
本任务未合并、未打包发布、未安装；当前 GitHub Beta2/build5 不会因本地提交自动包含修复。
