# Editor Bridge Protocol v1

Inkora 只使用这一条 JSON Bridge 连接原生 `NSDocument` 与离线 Web 编辑器。原生层拥有文件、窗口、保存和关闭决策；编辑器拥有文档模型、selection、history 与 composition。Bridge 不访问网络。

## 传输与公共字段

- Swift 通过 `window.inkora.receive(serializedJSON)` 发送命令。
- 编辑器通过 `window.webkit.messageHandlers.inkora.postMessage(serializedJSON)` 发送事件。
- 所有消息均为 UTF-8 JSON 字符串，且必须包含 `protocolVersion: 1` 和 `type`。
- 每个 Native → Editor 命令必须带非空 `requestID`；同一编辑器会话内不得复用。
- 文档相关命令携带非空 `documentID` 和非负、JavaScript safe integer `revision`。
- 正文只出现在 `loadDocument.text` 与 `snapshotReady.text`，必须作为 JSON string 原样传输。

## Revision 不变量

1. `revision` 属于一个 `documentID`，从原生加载值开始，只能单调递增。
2. 每次已经提交的用户编辑或 history transaction 恰好增加一次 revision；IME composition 中间态不增加。
3. 相同文档的旧 `stateChanged` 不得覆盖较新状态；不同 `documentID` 的事件不得改变当前文档。
4. `createSnapshot.revision` 是原生已确认的最低 revision；编辑器原子捕获不低于该值的当前 revision 与文本。文档不一致或请求 revision 超前时返回 `stale_revision`。
5. `snapshotReady` 固定表示编辑器处理请求时捕获的 revision。之后发生的新编辑不会改变该 snapshot，也不得被旧 snapshot 反向覆盖。

## Native → Editor

### `loadDocument`

```json
{
  "protocolVersion": 1,
  "type": "loadDocument",
  "requestID": "load-1",
  "documentID": "document-uuid",
  "revision": 0,
  "text": "# Markdown"
}
```

建立当前文档。相同文档的较低 revision 必须以 `stale_revision` 拒绝。成功后发送带相同 `requestID` 的 `stateChanged`。加载不得产生用户编辑 transaction，未修改 snapshot 必须返回原始正文。

### `createSnapshot`

```json
{
  "protocolVersion": 1,
  "type": "createSnapshot",
  "requestID": "snapshot-1",
  "documentID": "document-uuid",
  "revision": 4
}
```

请求不可变 Markdown snapshot。`revision` 表示调用方已知的最低版本；成功响应可携带相同或更高的当前 revision。文档不一致或请求版本高于编辑器当前版本时返回 `stale_revision`。

### `executeCommand`

```json
{
  "protocolVersion": 1,
  "type": "executeCommand",
  "requestID": "command-1",
  "documentID": "document-uuid",
  "revision": 4,
  "command": "undo"
}
```

v1 冻结 `undo`、`redo` 两个 command 值。命令成功后通过带相同 request ID 的 `stateChanged` 表达新 revision；当前历史中无法执行时返回 `command_rejected`，不得静默忽略。

### `queryState`

```json
{
  "protocolVersion": 1,
  "type": "queryState",
  "requestID": "state-1"
}
```

返回带相同 `requestID` 的 `stateChanged`。尚未加载文档时返回 `editor_not_ready`。

## Editor → Native

### `ready`

```json
{"protocolVersion":1,"type":"ready"}
```

表示编辑器完成初始化，可以接收 v1 命令。版本不匹配时原生层停止发送文档正文和保存请求。

### `stateChanged`

```json
{
  "protocolVersion": 1,
  "type": "stateChanged",
  "requestID": "state-1",
  "state": {
    "documentID": "document-uuid",
    "revision": 4,
    "dirty": true,
    "canUndo": true,
    "canRedo": false
  }
}
```

`requestID` 只在响应 `loadDocument`、`queryState` 或 command 时提供；主动状态变化可省略。原生层按 `(documentID, revision)` 丢弃错误文档或旧状态。

### `snapshotReady`

```json
{
  "protocolVersion": 1,
  "type": "snapshotReady",
  "requestID": "snapshot-1",
  "documentID": "document-uuid",
  "revision": 4,
  "text": "current Markdown"
}
```

原生层只完成相同 `requestID`、`documentID` 且响应 revision 不低于请求门槛的等待请求。未知 request ID 被忽略；字段不匹配导致该请求失败，不得使用返回正文覆盖当前状态。

### `editorError`

```json
{
  "protocolVersion": 1,
  "type": "editorError",
  "requestID": "snapshot-1",
  "documentID": "document-uuid",
  "revision": 4,
  "code": "stale_revision",
  "action": "retry",
  "message": "Revision does not match"
}
```

`requestID` 在错误可关联请求时必填。无法关联时省略，原生层终止所有等待请求。`message` 只用于诊断，不得包含文档正文。

| code | action | 调用方行为 |
| --- | --- | --- |
| `editor_not_ready` | `retry` | 等待 ready 或重新加载后重试 |
| `stale_revision` | `retry` | 以最近确认的 revision 重试，达到次数上限后失败 |
| `request_conflict` | `retry` | 使用新的 request ID 重试 |
| `command_rejected` | `notify` | 保持文档状态并向用户说明命令未执行 |
| `invalid_message` | `stop_saving` | 停止保存，记录协议错误 |
| `unsupported_version` | `stop_saving` | 停止跨层操作并要求版本一致 |
| `internal_error` | `stop_saving` | 停止保存，允许重新加载或用户另存恢复 |

`code` 与 `action` 的组合是固定契约；不匹配的组合本身视为 `invalid_message`。

## 请求、超时与乱序

- 原生层为每个等待响应的请求启动超时；超时只失败该 request ID，不清除 dirty 或覆盖文件。
- 编辑器拒绝会话内重复 request ID，返回 `request_conflict`。
- 原生层忽略未知 request ID 的迟到响应。
- 多个请求可以并发；响应顺序不构成状态顺序，状态只由 revision 决定。
- Web 进程终止时所有等待请求失败，最近确认的 `(documentID, revision)` 仍是原生层唯一可信状态。

## v0 → v1

v1 不兼容 v0。映射如下：

| v0 | v1 |
| --- | --- |
| `load` | `loadDocument` + documentID + revision + requestID |
| `getText` | `createSnapshot` / `snapshotReady` |
| `contentChanged` | `stateChanged`，正文不再随每次编辑传输 |
| `text` | `snapshotReady` |
| `error` | `editorError` + 固定 code/action |

双方必须整体切换到 v1，不允许在一个会话中混用 v0/v1 消息。
