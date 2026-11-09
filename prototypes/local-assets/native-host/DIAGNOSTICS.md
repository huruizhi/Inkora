# 诊断事件词典

宿主在自身 container 的 `Library/Application Support/InkoraLocalAssetHost/events.jsonl` 追加 JSONL。每条含 UTC timestamp 与 type；只记录实验 fixture 元数据，不记录 bookmark bytes。

| 类别 | 事件与判读 |
| --- | --- |
| 启动 | `host-start` 含 OS、binarySHA256、fixtureManifestSHA256、runID、sandboxActive；`sandbox-inactive` 必须判未完成。 |
| 面板 | `panel-open/selected/cancel/rejected` 含 kind 与 source；只有 `source=NSOpenPanel` 的 selected 才是用户动作。locator/default directory 不是授权。 |
| 书签 | `bookmark-created/restored/stale/error/revoked`；能解析或 `startAccessing=true` 仍须看后续实际读取。 |
| 作用域 | `scope-start/stop` 含 active/count；异步 broker 的 count 应在读取完成后回到 0。 |
| 原生读取 | `native-read-result` 分 success/missing/denied/symlink/invalid/io-error，附 errno 与成功 SHA。missing 与 denied 不合并。 |
| broker | `authorization-installed/revoked`、`document-epoch`、`resource-token-created/error` 显露逻辑 document/epoch/token。 |
| WK | `wk-request/complete/cancel/callback-suppressed`；cancel 后只能 suppressed，不能再 complete。 |
| 网络/导航 | `navigation-rejected` 记录被拒 scheme/host；任何 http/https/file 主导航均应拒绝。 |

判断目录移动：先看 `bookmark-restored` 的 stale 字段，再看 `manifest-read` 与图片 `native-read-result`；stale、可解析和实际可读是三件不同的事。
