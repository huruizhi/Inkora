# Spec

- **[P1][c] 首存失败后的 Undo 可把 draft URI 写入最终 Markdown。** V4 要求重写绑定 snapshot，失败后草稿仍可恢复，且 draft URI 不得落盘（`docs/design/local-images-production-v4.md:28-32,46-51,64-65,75`；`docs/save-barrier.md:45-47`）。但发布后 manifest 立即把 `markdownURI` 改为目标 URI（`app/Sources/LocalImageStore.swift:286-317`）；Markdown 写失败后 Undo 可恢复旧 draft URI，同目标重试却因 manifest 已是目标 URI而生成空 rewrite（`:247-283`）。保存只发布 plan 后直接写 snapshot，未重验 snapshot 是否仍含 plan 的目标 owner（`app/Sources/InkoraDocument.swift:536-640`）。scratch 真实输出：`draft=inkora-draft://…`、`manifest=Note.assets/source.png`、`retryRewrites=0`；成功后还会确认并退役草稿。

- **[P1][c] Save As 会漏迁移合法引用式图片并静默断链。** V4 要求保留引用字节且保证目标资源（`docs/design/local-images-production-v4.md:10,53,59,66-67,78`），SYN-S010 要完整 CommonMark 引用式图片（`docs/markdown-support.md:79,117,174`）。扫描器仅对 label `lowercased()`，未做 CommonMark 空白折叠（`app/Sources/LocalImageMigration.swift:169-197`）。scratch 使用 `![x][A   B]` 与 `[a b]: Old.assets/a.png` 得到 `planned=0 copied=false`，随后 Markdown 仍可保存到新目录。

- **[P1][c] pending 导入恢复会丢失原 revision/选区并迁移到当前光标。** 导入意图必须绑定 document/session/asset 与版本，过期或 dirty 时保留但不得换选区重试（`docs/design/local-images-production-v4.md:20,28,32,71,74`；`docs/local-images.md:17,25`）。manifest 只存资源状态、不存 epoch/revision/selection（`app/Sources/LocalImageStore.swift:31-46`）；恢复又以 `document.text.contains(uri)` 冒充 owner，否则直接 `presentImportedImage`（`app/Sources/EditorViewController.swift:539-577`），用当前 revision/selection 重新入队。URI 出现在代码/普通文本时还会被误记 accepted。

- **[P2][a] Save As journal 是只写记录，重启后无人恢复或裁决。** V4 要求按持久记录与实际字节保守恢复 SIGKILL 窗口（`docs/design/local-images-production-v4.md:47-51,76,78`）。实现仅写 `prepared/published-awaiting-markdown/failed-conservative` 并按已知 plan ID 删除（`app/Sources/LocalImageMigration.swift:26-32,101-161`）；生产代码没有枚举、解码或重启恢复入口。

- **[P2][c] 书签恢复失败仍会签发 `ready` capability。** 打开 Markdown 不能冒充父目录授权，拒权必须与缺失分层（`docs/design/local-images-production-v4.md:36-38,53`）。书签错误被 `try?` 吞掉（`app/Sources/InkoraDocument.swift:181-194`），session asset 随后回退到未授权的文档父目录（`app/Sources/EditorViewController.swift:509-536`）并被标成 `ready`（`:539-549`）；真正 scheme 读取失败前 UI 已收到假成功描述。

**[b]** 未发现达到报告门槛的未要求范围扩张。

实跑：Vitest `source-authority-runtime.test.ts` + `bridge.test.ts`，59/59；两次一次性 Swift scratch 反例见上。未重跑作者/根 Agent 的全套结果；未验 GUI、真实 Sandbox/bookmark/WK、系统拖放/剪贴板、IME、macOS 14、正式关闭重开，保留 V4 deferred 门槛。
