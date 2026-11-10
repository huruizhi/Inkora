# INK-UX-137 正文阅读节奏

基线：`240b8bcde78347328ff049743cb8baeee1c3103a`。分支：`task/INK-UX-137-reading-rhythm`。

仅修改 `editor/src/writing-surface.css` 的正文规则：h1 紧接段落时 margin-bottom 从 .75em 收紧到 .5em；h2/h3 相邻时后者 margin-top 从 1.6em 收紧到 1em。实际 WK 的 h1→p gap 从 25.5px 到 17px，h2→h3 从 34px 到 21.25px。保留标题字号和层级、17px/1.8 正文及其他块间距；工具规则未改。

真实测量覆盖 1200/480 viewport × 900/760 配置 × 浅/深色。基线和候选使用同一真实生产 ProseMirror DOM，仅候选阶段加局部 CSS；最终生产样式落地、重新 editor build 后，新建 WK 复测，harness 已删除候选注入代码。全部 NSWindow 始终 isVisible=false，未启动 App、系统面板或读取桌面。证据详见 [说明](../evidence/INK-UX-137/README.md)。

实跑 `make editor-build`（前后与最终生产资源；包含 tsc --noEmit、Vite production build）通过；临时 Swift harness 编译并跑过 16 组基线/候选和 8 组新 WK 生产复测，状态/原文字节一致。几何校验脚本通过。额外单独 tsc 曾因误用不存在的 `.tools/node/bin/node` 返回127；生产构建内真实 tsc 已通过。不增加永久镜像测试，未运行全量 Native/Release/CI/bench、物理 IME 或 macOS14。

限制：这是实际 WK 布局几何证据，未做 paint/离屏图像或用户观感验收；不宣称与字体主题未知的 Typora 截图像素一致。隐藏窗口保持默认侧栏关闭。压力代码与表格明确追加在自有 fixture 中，未修改原样稿。图片未授权状态不属于本切片。

临时 harness、编译日志和资源 bundle 保留在本 worktree 的 `build/artifacts/INK-UX-137`，待管理者备份回收。借用依赖 symlink 在交付前 unlink，真实依赖目录不变。
