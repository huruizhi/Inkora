# 诊断事件词典

宿主在自身 container 的 `Library/Application Support/InkoraLocalAssetHost/events.jsonl` 追加 JSONL。每条含 UTC timestamp 与 type；只记录实验 fixture 元数据，不记录 bookmark bytes。

| 类别 | 事件与判读 |
| --- | --- |
| 启动 | `host-start` 含 OS、binarySHA256、fixtureManifestSHA256、runID、sandboxActive；`sandbox-inactive` 必须判未完成。 |
| 面板 | `panel-open/selected/cancel/rejected` 含 kind 与 source；只有 `source=NSOpenPanel` 的 selected 才是用户动作。locator/default directory 不是授权。 |
| 书签 | `bookmark-created/restored/stale/error/revoked`；能解析或 `startAccessing=true` 仍须看后续实际读取。 |
| 作用域 | `scope-start/stop` 含 active/count；异步 broker 的 count 应在读取完成后回到 0。 |
| 原生读取 | `native-read-result` 分 success/missing/denied/symlink/invalid/io-error，附 errno 与成功 SHA。missing 与 denied 不合并。symlink 的 errno 语义：最终组件为 ELOOP(62)；中间组件在 macOS 为 ENOTDIR(20)，分类依据是 `fstatat(AT_SYMLINK_NOFOLLOW)` 目录项元数据而非 errno 本身。普通非目录中间组件同样 ENOTDIR(20) 但保持 io-error，两者只能靠元数据区分。 |
| broker | `authorization-installed/revoked`、`document-epoch`、`resource-token-created/error` 显露逻辑 document/epoch/token；`native-read-start` 表示读取已取得 lease，`native-read-stale` 表示完成后 generation 已轮换、结果被丢弃并改为单次 409。 |
| 网络/导航 | `navigation-rejected` 记录被拒 scheme/host；任何 http/https/file 主导航均应拒绝。 |

判断目录移动：先看 `bookmark-restored` 的 stale 字段，再看 `manifest-read` 与图片 `native-read-result`；stale、可解析和实际可读是三件不同的事。

040管理者复核：openat errno在查询元数据前捕获；model16/handler49/path9为非GUI接缝证据。WK适配器强持有task到取消回调收口，由3个生命周期断言覆盖；不把替身可伪造的identity碰撞视为系统可达事件。详见evidence/INK-PROT-040-review/。
