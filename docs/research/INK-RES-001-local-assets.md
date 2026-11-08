# INK-RES-001：本地图片技术依据

2026-11-08；基线 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`。仅供本地资源策略票决策，不选择最终政策，不实施功能。

## 已核实的边界

选中 Markdown **文件本身不足以授权邻接图片或父目录**；Apple 明示选中视频不包含旁边字幕。`NSOpenPanel.canChooseDirectories` 可让用户选择目录，授权递归覆盖子项，但仍可能受 POSIX、ACL 等限制。[目录与书签][1]、[文件授权反例][2]、[目录选择 API][3]

持久访问须保存 security-scoped bookmark；重启后以 `.withSecurityScope` 解析，检查 stale 并更新，使用期间配对 start/stop。书签不扩大原有权限；不能把拼出的父目录 URL 当作目录授权。document-relative bookmark 是另一机制，需要存储书签数据，普通 Markdown 相对路径不等于书签。[1]

related-item 需声明 `NSIsRelatedItemType`、配置 presenter/coordinator；Apple 限定 sidecar 除扩展名外路径组件相同，不能推广到 `assets/任意.png`。[sidecar 规则][4]

## 当前代码事实与缺口

- [handler](../../app/Sources/EditorResourceSchemeHandler.swift) 仅 GET、`inkora-editor://app`，限定 bundle/editor 下普通文件，标准化并解析符号链接后检查边界；同步读取，取消回调为空。没有文档资源映射。
- [CSP](../../editor/index.html) 的图片仅允许上述 origin 与 `data:`，`connect-src 'none'`；[host](../../app/Sources/EditorViewController.swift) 使用非持久 WKWebView。相对图片不会自动以 Markdown 所在目录为根。[语法检查](../../editor/src/markdown-safety.ts) 仍将图片标为不支持。
- [entitlements](../../app/Resources/Inkora.entitlements) 已有 Sandbox、用户选择读写、app-scope bookmark，也有 network.client；不能把此网络权限误报为编辑器允许联网。
- [打开历史](../../app/Sources/DocumentOpenHistory.swift) 与 [恢复草稿](../../app/Sources/RecoveryStore.swift) 存文档书签；[NSDocument 写入](../../app/Sources/InkoraDocument.swift) 保存 Markdown 字节。未见图片导入、目录书签或资源迁移事务。

## 生命周期场景：可行条件与代价

下表是技术推导，均非已接受的产品行为。

| 场景 | 引用原路径 | 复制到文档旁资源目录 |
| --- | --- | --- |
| 1. 打开 `![图](assets/a.png)` | 另获图片或目录权限，保留源码路径 | 已有引用不应擅自改写；复制亦须源读、目标写权限 |
| 2. 拖入文件、粘贴图片 | 文件 URL 须验证授权；纯图片字节没有可引用的原路径 | 可落盘再插入引用；文件 promise 可由 `NSFilePromiseReceiver` 接收[5]，须处理失败、重名与撤销 |
| 3. 未命名文档首次保存 | 尚无相对路径基准，首次保存须处理路径 | 可先存容器持久草稿区；选定目标后迁移，不能假定 Save panel 授权旁置建目录 |
| 4. Save As 到另一目录 | 原相对路径可能改指别处；保持字面或重算路径待定 | 须目标目录写授权、冲突规则及失败回滚；保存 Markdown 不自动复制图片 |
| 5. 仅移动 Markdown | 相对链接可能断裂，书签追踪文件不等于修复源码 | 资源目录不会随单文件自动移动；是否协助搬迁待定 |
| 6. 整目录移动/迁往另一 Mac | 层级保留时相对关系可保留，外部引用仍脆弱 | 一起迁移更便携；新位置/新设备仍须验证或重新取得授权 |
| 7. 缺失、拒绝权限、重启 | 区分不存在与无权读取；书签失效可重新选择 | 草稿还须恢复图片及映射；均应保留原文、显示占位并提供重新定位 |

两路都可基于显式授权实现：引用减少复制但依赖外部生命周期；旁置复制增加存储、重名、清理与多文件一致性成本。命名、默认路径、Save As 是否搬迁及撤销后的资源清理均待用户决定。

## 安全实现约束与待证明项

可行方向是原生层持权读取，以文档隔离的资源标识交给自定义 scheme；不得暴露任意磁盘路径。`WKURLSchemeHandler` 不能接管 WebKit 已处理的 scheme（如 `file:`、`https:`）；`loadFileURL` 的 read-access 参数是另一接口，不替代 Sandbox 授权。[注册限制][6]、[文件加载][7]。异步化后，任务 stop 后不得再回调，否则抛异常。[取消契约][8]

`NSDocument` 自动协调其文档读写；旁置图片操作须另考虑 `NSFileCoordinator`，并使用协调块提供的 URL。协调不是 Markdown 与资源目录的跨文件原子提交。[文档协调][9]、[协调 API][10]

仍需独立原型证明：macOS 14 签名 Sandbox 下单文件/目录/拖放/粘贴各自权限；重启、stale 与目录移动；取消和并发加载；中文/空格/百分号路径、`..`、符号链接及检查后替换；MIME/大小限制、SVG 外部引用、跨文档越权；图片复制成功而 Markdown 保存失败时恢复。普通粘贴板文本中的路径是否携带授权未查证，不得按拖放推定。

本轮只做源码和一手文档核验；未运行 UI、产品测试或构建，无运行时通过结论。

[1]: https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox
[2]: https://developer.apple.com/documentation/foundation/nsfilepresenter/primarypresenteditemurl
[3]: https://developer.apple.com/documentation/appkit/nsopenpanel/canchoosedirectories
[4]: https://developer.apple.com/videos/play/wwdc2019/701/?time=1007
[5]: https://developer.apple.com/documentation/appkit/nsfilepromisereceiver
[6]: https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/seturlschemehandler(_:forurlscheme:)
[7]: https://developer.apple.com/documentation/webkit/wkwebview/loadfileurl(_:allowingreadaccessto:)
[8]: https://developer.apple.com/documentation/webkit/wkurlschemehandler/webview(_:stop:)
[9]: https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/DocBasedAppProgrammingGuideForOSX/StandardBehaviors/StandardBehaviors.html
[10]: https://developer.apple.com/documentation/foundation/nsfilecoordinator/coordinate(readingitemat:options:writingitemat:options:error:byaccessor:)
