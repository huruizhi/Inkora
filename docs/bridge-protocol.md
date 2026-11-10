# Editor Bridge Protocol v1

Inkora 只使用这一条 JSON Bridge 连接原生 `NSDocument` 与离线 Web 编辑器。原生层拥有文件、窗口、保存和关闭决策；编辑器拥有文档模型、selection、history 与 composition。Bridge 不访问网络。

## 传输与公共字段

- Swift 通过 `window.inkora.receive(serializedJSON)` 发送命令。
- 编辑器通过 `window.webkit.messageHandlers.inkora.postMessage(serializedJSON)` 发送事件。
- 所有消息均为 UTF-8 JSON 字符串，且必须包含 `protocolVersion: 1` 和 `type`。
- 每个 Native → Editor 命令必须带非空 `requestID`；同一编辑器会话内不得复用。
- 文档相关命令携带非空 `documentID` 和非负、JavaScript safe integer `revision`。
- 正文只出现在 `loadDocument.text`、`snapshotReady.text` 与 `markSaved.text`，必须作为 JSON string 原样传输。

## Revision 不变量

1. `revision` 属于一个 `documentID`，从原生加载值开始，只能单调递增。
2. 每次已经提交的用户编辑或 history transaction 恰好增加一次 revision；IME composition 中间态及 DOM end 后尚未稳定的 PM final 不增加，稳定边界只增加一次。
3. 相同文档的旧 `stateChanged` 不得覆盖较新状态；不同 `documentID` 的事件不得改变当前文档。
4. `createSnapshot.revision` 是原生已确认的最低 revision；编辑器原子捕获不低于该值的当前 revision 与文本。文档不一致或请求 revision 超前时返回 `stale_revision`。
5. `snapshotReady` 固定表示编辑器处理请求时捕获的 revision。之后发生的新编辑不会改变该 snapshot，也不得被旧 snapshot 反向覆盖。可选 `imageOwnership` 把同一次捕获的 `documentID`、revision、逐字 `raw` 与语义投影中的图片 URI 顺序绑定；四者任一不一致即为非法 proof。
6. 磁盘提交成功后，原生以 `markSaved` 确认实际落盘的 snapshot。该命令不增加 revision；若期间已有更高 revision，编辑器仍保持 dirty。

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

请求不可变 Markdown snapshot。`revision` 表示调用方已知的最低版本；成功响应可携带相同或更高的当前 revision。文档不一致或请求版本高于编辑器当前版本时返回 `stale_revision`。composition 尚未到稳定发布边界时不得返回候选中间态；编辑器在有界 drain 后捕获最终值，超时或跨 load/destroy 返回可重试 `editor_not_ready`。

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

基础历史命令仍为`undo`、`redo`，成功恰好增加一次revision。INK-UX-123以可选`state.availableCommands`协商扩展动作：`sourceMode`、`visualMode`、`applySource`、`cancelSource`、`insertTable`、`find`、`toggleOutline`、`readingWidth760`、`readingWidth900`。缺能力字段的旧Web发送方不得被Native强行调用新动作；旧Native接收方可忽略新状态字段。

每条命令校验当前document/revision/requestID，成功用相同requestID的`stateChanged`确认。`insertTable`还必须携带同次queryState取得的`selectionAnchor/selectionHead`；Web逐项比较当前有向raw选区，同版本caret移动也拒绝，不能改投新光标。模式、导航、布局以及no-op源码提交不增加revision，不写history/dirty；插表、有效源码提交等已接受内容变化恰好增加一次。拒绝返回`command_rejected`，不静默忽略。所有扩展动作在Web执行时重新检查composition、模式、草稿及相关文本控件焦点；能力列表是即时资格提示，不是绕过守卫的许可。

`insertImage`仅在能力列表中表示可打开Native文件选择器；Native重新queryState验证同一加载代际后复用既有图片流程，不向Web发送`executeCommand(insertImage)`。实际图片插入仍走`applyImageImport`，不另造DOM点击入口。

新动作固定请求时document/revision，不使用历史命令的过期重试重放策略。Native重新加载文档时取消旧排队/在途命令；Web仍校验版本与实时资格。菜单快捷键通过当前窗口响应者链调用，未提交源码草稿不会被可视模式命令无提示丢弃。

### `markSaved`

```json
{
  "protocolVersion": 1,
  "type": "markSaved",
  "requestID": "saved-1",
  "documentID": "document-uuid",
  "revision": 4,
  "text": "persisted Markdown"
}
```

只在原子磁盘提交成功后发送，正文必须与刚刚写入的 snapshot 完全一致。相同文档中低于或等于当前版本的 revision 均可接受，以支持“保存中继续编辑”；高于当前版本或文档不一致时返回 `stale_revision`。成功响应 `stateChanged`，但不增加当前 revision，也不清除该 snapshot 之后产生的 dirty 状态。

### `queryState`

```json
{
  "protocolVersion": 1,
  "type": "queryState",
  "requestID": "state-1"
}
```

返回带相同 `requestID` 的 `stateChanged`。尚未加载文档时返回 `editor_not_ready`。

可选`observeCommands: true`由已安装新菜单的Native显式订阅。Web收到后才收起旧顶栏入口，并在资格变化时发送`commandsChanged`；未订阅的旧Native/Web组合继续保留原按钮，不广播新事件。Native ready后立即订阅，菜单展开及动作前仍重新采样。

### 图片命令

`applyImageImport` 携带 document/revision、`documentEpoch`、asset UUID、已确定 URI、alt、可空 title、导入意图采样的 `selectionAnchor/selectionHead` 与单个 `inkora-asset://resource/<uuid>` capability。selection 使用当前原文的 directed offsets；执行时 selection、document、revision 或 epoch 任一不匹配都拒绝，不迁移到当前光标。成功是一次正文/history/revision 事务；composition、源码 dirty draft、过期 revision 或无法证明 owner 时拒绝。

`setImageDescriptors` 携带同一 document epoch 的 descriptor 数组和完整 `imageOwnership` proof。状态限定为 `ready/missing/denied/unsupported/error/pending`；只有 ready 必须且只能带 capability URL。Native 在读取或注册前重新捕获当前 proof，且只生成 proof owner 中的 descriptor；命令固定到 proof 的 document/revision/raw/有序 URI。Web 在 ack 前再次核对当前 accepted raw、完整 owner 数组和 composition 状态，缺 proof 或任一不一致均拒绝。ready capability 先以不可读取的 provisional 状态注册，Web ack 入队后才提交为 live；拒绝、超时、跨 load/epoch 或迟到 ack 全部回滚。descriptor ack 先于 NodeView 副作用；命令不改变正文、dirty、revision、selection 或 history。

`prepareImageSave` 携带非空 rewrite 数组、完整 `imageOwnership` proof，每项以 asset ID 绑定唯一 `from` owner 和确定 `to` URI。命令必须固定到产生 plan 的 document/revision/raw/有序 owner；Native 在授权返回后、建立 plan 前重新捕获并逐项比较 proof，Web 在执行前再比较当前 accepted raw/owners 并拒绝 composition。授权等待期间若版本或 owner 前进，旧 plan 在资源或正文变化前以 `stale_revision` 拒绝。编辑器整体校验并作为一个内容事务接受或拒绝；该命令不能由 `markSaved` 替代，也不得改写已有非托管引用。

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
    "canRedo": false,
    "selectionAnchor": 12,
    "selectionHead": 8
  }
}
```

`requestID` 只在响应 `loadDocument`、`queryState` 或 command 时提供；主动状态变化可省略。`queryState` 同 turn 采样当前原文 directed selection，但不增加 revision、dirty 或 history。旧 v1 发送方可省略 selection；图片导入意图必须取得一对完整 selection 后才可持久化。原生层按 `(documentID, revision)` 丢弃错误文档或旧状态。

INK-UX-123可选字段`availableCommands`为当前模式/组合态/焦点派生的动作值数组；`readingWidth`为760或900。二者不属于文档内容、保存点或历史。原生菜单展开时queryState刷新资格，执行动作前再次查询并绑定同一Native加载代际，Web执行时再守卫；本轮不为纯焦点/显示变化广播新的正文revision。

### `commandsChanged`（显式订阅后）

携带`documentID`、`revision`、`availableCommands`与`readingWidth`，不携带正文/dirty/history。Web在状态、焦点或composition处理后比较当前资格，仅变化时发布。Native只接受当前document/revision，更新菜单缓存，不调用NSDocument的正文变更/恢复逻辑。源码草稿变为可提交、点击取消回可视等状态因而可立即启用快捷键，无需先打开菜单。旧Native不订阅，不会接收这个事件。

### `snapshotReady`

```json
{
  "protocolVersion": 1,
  "type": "snapshotReady",
  "requestID": "snapshot-1",
  "documentID": "document-uuid",
  "revision": 4,
  "text": "current Markdown",
  "imageOwnership": {
    "documentID": "document-uuid",
    "revision": 4,
    "raw": "current Markdown",
    "imageURIs": ["Note.assets/a.png"]
  }
}
```

`imageOwnership` 是 v1 的可选兼容扩展；旧 golden 可省略，但所有图片资源流程必须显式要求它。编辑器在同一稳定 runtime、同一个 JavaScript turn 捕获 `text/raw` 与语义投影 owner；`raw` 必须逐字等于 `text`，owner 数组保留文档顺序和重复使用。同一 URI 被两个图片节点使用时保留两项；代码、数学、普通链接与保护块中的伪图片不进入数组。

原生层只完成相同 `requestID`、`documentID` 且响应 revision 不低于请求门槛的等待请求。若 proof 存在，还必须严格验证内外 document/revision/raw 与非空 URI。未知 request ID 被忽略；字段不匹配导致该请求失败，不得使用返回正文覆盖当前状态。缺少 proof 表示“未知”，不等价于 `imageURIs: []`；后者才是已证明无图片。

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

### `imageAccessRequested`

图片占位的「授权/定位」动作发送 document ID、revision、原 `href` 和同一当前版本的 `imageOwnership`。proof 必须包含该 href；原生只接受当前 document/revision，经过用户选择签发新 capability，再用固定到同一 proof 的 `setImageDescriptors` 回填。缺失、跨文档、跨 revision 或不再拥有 href 的事件被忽略；该事件本身不改正文或焦点。

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

## 标题元数据与范围定位（additive v1）

`setDocumentTitle` 与 `revealRange` 均通过既有 `window.inkora.receive` 入口，
包含 `protocolVersion: 1`、唯一非空 `requestID`、当前 `documentID/revision`，以及
`loadRequestID`：Web 最近一次**接受**的 `loadDocument.requestID`。同一文档以相同
revision 重载后，旧 load 身份仍失效。Native 仅在该 load 的 `stateChanged` 确认后发起。

- `setDocumentTitle` 仅附带 `title` 文件名；它是窗口标题 UI 元数据，不是正文 H1。
- `revealRange` 仅附带非负安全整数 `selectionAnchor/selectionHead`，要求 head ≥ anchor，
  坐标为当前已接受原文的 UTF-16；Native 对文件搜索的原始 BOM 坐标扣除文件前导 BOM。
  不传全文、重复 raw、保存点、catalog 原文或 Markdown 片段。Native 先通过原始文件
  exact-version capability 重验；已有目标的搜索命中还要用实时 snapshot 验证当前内容。

Web 先消费 requestID，校验 doc/revision/load/range/composition/草稿/未解决意图，
再执行呈现。成功返回 `presentationApplied`，携带相同 requestID/docID/revision/loadRequestID，
`outcome: "applied"`。受保护或语法范围无法严格映射时，只创建显式源码定位选择，回执
`outcome: "sourceChoice"`；作者选择前不改变模式或选区。该选择自身再次验证加载代际、
原文版本与输入状态。没有可用选择的拒绝返回可关联 `editorError`，不产生正文事务。
重复 requestID 返回 `request_conflict`；旧身份返回 `stale_revision`。成功、选择和拒绝都不
增加 revision、不更改 dirty/history/保存点。Native 精确匹配回执；跨 load 取消在途请求，
迟到回执丢弃，超时向调用者返回 `requestTimedOut`，不重放导航或改写正文。

## 文件夹 UI 通道的限定例外

`inkoraSidebar` 是目录 capability 与索引展示的专用 UI 通道，唯一允许的动作为
ready/chooseFolder/refresh/search/open/cancelSearch，及其 ready/catalog/search/invalidated/error/cancelled 回复。
它不承载**当前文档全文、正文事务或保存真值**，不得用于替代 Editor Bridge。
目录摘要和搜索命中片段来自显式授权目录，不能当作当前已接受原文或保存依据。

Native 验证本地 editor scheme/host 的 main frame、请求大小、requestID、当前 document、
context、catalog 与不透明 file/hit 身份；Web 按当前 document/context/request 接收结果。
目录扫描/搜索与正文 revision 解耦，但跨文档/目录代际结果失效；open 需精确绑定 revision
并签发受限导航票据。在关闭审查、snapshot 等异步等待后必须重新验证票据及安全文件描述符
的 root/file 身份和 exact bytes/version，转交前再验证；失败发 error/invalidated 并保留源会话。
标题与选区呈现不属于此例外，必须使用上述正式 v1 请求与回执。

`cancelSearch` 也跨进程：携带原绑定、requestID/contextID/catalogID，以及至少一个
`targetSearchRequestID` / `targetOpenRequestID`。Native 只撤销匹配的搜索意图、命中 capability
或在途 open/navigation 票据；迟到取消不能撤销新请求，不清空正常 catalog/watch。
回复 `cancelled` 包含同次 requestID/doc/context/catalog 与 `cancelledSearch/cancelledOpen`，
仅作回执，不覆盖当前列表/搜索 UI。Web 返回列表、清空或换视图时不能仅删除本地回包 ID。
