# Editor Bridge Protocol v0

Inkora 使用单一 JSON Bridge 连接原生 `NSDocument` 与离线 Web 编辑器。原生层拥有文件、窗口、
保存和关闭决策；编辑器拥有文本输入、selection 与 composition。Bridge 不访问网络。

## 传输

- Swift 通过 `window.inkora.receive(serializedJSON)` 向编辑器发送命令。
- 编辑器通过 `window.webkit.messageHandlers.inkora.postMessage(serializedJSON)` 向 Swift 发送事件。
- 所有消息均为 UTF-8 JSON 字符串；正文作为 JSON string 原样传输。

## Native → Editor

### `load`

```json
{"type":"load","text":"# Markdown"}
```

替换编辑器全文。加载不会产生 `contentChanged`。即使 `<textarea>` 在显示时规范化换行符，
用户未编辑时 `getText` 仍必须返回最初加载的原文，包括换行符和尾部换行。

### `getText`

```json
{"type":"getText","requestID":"UUID"}
```

请求当前完整文本。编辑器必须使用相同 `requestID` 返回 `text`。

## Editor → Native

### `ready`

```json
{"type":"ready"}
```

编辑器完成初始化，可以接收 `load`。

### `contentChanged`

```json
{"type":"contentChanged","text":"current text"}
```

仅在用户完成一次文本变化后发送。IME composition 期间不得重载或重写编辑器内容。

### `text`

```json
{"type":"text","requestID":"UUID","text":"current text"}
```

响应 `getText`。原生层保存时写入这里返回的 UTF-8 字节。

### `error`

```json
{"type":"error","requestID":"UUID","code":"invalid_message","message":"details"}
```

表示命令无法解析或执行。`requestID` 在错误与具体请求相关时提供；无法关联时可以省略，
此时原生层必须终止所有等待中的请求。保存请求失败时，原生层不得清除 dirty 状态或覆盖原文件。
