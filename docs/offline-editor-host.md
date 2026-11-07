# WKWebView 离线编辑器宿主

Inkora 仅从应用包内的 `Contents/Resources/editor` 加载 Vite 产物。`EditorResourceSchemeHandler` 将只读资源映射到固定源 `inkora-editor://app`，不允许其他主机、用户信息、端口、查询参数、fragment、目录、符号链接逃逸或非 GET 请求。

## 生命周期

`EditorBridge` 使用三个明确状态：

- `loading`：文档加载命令保存在原生内存中，snapshot 请求立即返回 `editorNotReady`；
- `ready`：收到受信 `inkora-editor://app` 主 frame 的 v1 ready 消息，并成功重放最近确认文档后，才允许 snapshot；
- `unavailable`：初始化、导航、协议或 Web Content process 失败，所有等待请求失败，保存保持禁用并显示可重新加载的错误视图。

每次主页面 reload 都回到 `loading`，随后在新的 ready 握手后重放当前文档。重复 ready 不复用 request ID。Web Content process 终止时自动尝试一次 reload；失败后保留手动 `Reload Editor` 操作。

## 最近确认状态与恢复

原生层只在 `snapshotReady` 通过 request ID、document ID 和 revision 校验后更新最近确认状态。进程终止后的恢复重放该 snapshot；如果尚无成功 snapshot，则重放磁盘载入的初始正文。终止前未确认的 Web 编辑不会被写入文件，也不会冒充恢复成功。未确认草稿持久化属于后续崩溃恢复范围。

Bridge 错误动作固定映射如下：

- `retry`：以新 request ID 有限重试，snapshot 最多三次；
- `notify`：失败对应操作并向用户提示，不破坏已确认状态；
- `stop_saving`：立即进入 `unavailable`，拒绝后续 snapshot，直到页面成功重新加载。

## 诊断日志

`EditorBridge` 通过统一日志 `com.huruizhi.Inkora/EditorBridge` 输出固定结构：`event`、`request_id`、`revision` 和 `category`。诊断 API 不接受正文参数，也不记录 Bridge `message`、Markdown、selection 或剪贴板内容。错误 message 只用于本地用户提示。

## 内容与导航安全

- Navigation delegate 只允许 `inkora-editor://app`；HTTP(S)、其他自定义源和 `about:` 均取消；
- 新窗口请求始终返回 `nil`；
- CSP 的 `script-src` 和 `img-src` 固定到 `inkora-editor://app`，`connect-src`、frame、worker、object、form 均关闭；
- WKWebsiteDataStore 使用 non-persistent 模式；
- 当前应用不声明网络客户端 entitlement。将来的 AI 模块必须与编辑器进程/接口解耦，并单独说明权限。

## 验证

- XCTest：初次离线加载、ready 前明确失败、最近确认 snapshot 恢复、超时、非法消息、进程终止、恢复失败、错误动作映射、日志脱敏、资源缺失、源与路径限制、CSP；
- Debug：`make test-ui` 启动 smoke；
- Release：`make test-ui-release` 验证包内 HTML/脚本/CSP 后启动 smoke。
