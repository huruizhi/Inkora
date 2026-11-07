# WKWebView 离线编辑器宿主

Inkora 仅从应用包内的 `Contents/Resources/editor` 加载 Vite 产物。`EditorResourceSchemeHandler` 将只读资源映射到固定源 `inkora-editor://app`，不允许其他主机、用户信息、端口、查询参数、fragment、目录、符号链接逃逸或非 GET 请求。

## 生命周期

`EditorBridge` 使用三个明确状态：

- `loading`：文档加载命令保存在原生内存中，snapshot 请求立即返回 `editorNotReady`；
- `ready`：收到受信 `inkora-editor://app` 主 frame 的 v1 ready 消息后，为当前页面生成新的 request ID 并发送文档；
- `unavailable`：导航失败或 Web Content process 终止，所有等待请求失败并显示错误视图。

每次主页面 reload 都回到 `loading`，随后在新的 ready 握手后重放当前文档。重复 ready 不复用 request ID。

## 内容与导航安全

- Navigation delegate 只允许 `inkora-editor://app`；HTTP(S)、其他自定义源和 `about:` 均取消；
- 新窗口请求始终返回 `nil`；
- CSP 的 `script-src` 和 `img-src` 固定到 `inkora-editor://app`，`connect-src`、frame、worker、object、form 均关闭；
- WKWebsiteDataStore 使用 non-persistent 模式；
- 当前应用不声明网络客户端 entitlement。将来的 AI 模块必须与编辑器进程/接口解耦，并单独说明权限。

## 验证

- XCTest：初次离线加载、ready 前明确失败、reload 重放、资源缺失、源与路径限制、CSP；
- Debug：`make test-ui` 启动 smoke；
- Release：`make test-ui-release` 验证包内 HTML/脚本/CSP 后启动 smoke。
