# Spec

## Wrong：旧 proof 在拒绝前已改变资源状态

> “descriptor 注册、授权回填和 `prepareImageSave` 固定到 proof 版本……新编辑与迟到 composition 均在资源变化前拒绝。”（`docs/tasks/INK-M1-083.md:11`）

`EditorViewController.existingImageDescriptor` 先执行 `assetBroker.register/read`（`app/Sources/EditorViewController.swift:773-803`），调用方之后才把 proof 交给 `EditorBridge.setImageDescriptors`（`236-257`、`730-746`）；真正的 revision 拒绝发生在 `EditorBridge.swift:382-386`。可重现：保存捕获 r4，写盘期间编辑到 r5，保存完成用 r4 刷新 descriptor；broker 已新增 capability，Bridge 才报 stale。并且 `setImageDescriptors` 命令只携带 document/revision/epoch，不携带 proof 的 raw/URIs（`BridgeProtocol.swift:326-349`）；composition 可在 revision 不变时改变 `currentRaw`，Web 仍会 `acknowledge` 并应用 descriptor（`editor/src/main.ts:836-850`）。因此 exact-raw proof 没有在资源变化点复验。

## Wrong：080 handoff 可未写草稿即标记 accepted

> “080 handoff 必须在写恢复草稿后……随后才允许 `handedOff/accepted`。”（`docs/tasks/INK-M1-083.md:14`）

`persistRecoveredImageHandoff` 在 proof 含 URI 后调用 `writeRecovery`，随后无条件 `completeRecoveredInsertion`（`app/Sources/InkoraDocument.swift:984-996`）。但 `writeRecovery` 的 revision、closed、store、dirty 等前置失败只是 `return`，不返回写入凭据或错误（`951-970`）。可重现：先把 `bridgeRevision` 推到 6，再传 document/raw/URI 自洽的 r5 proof；草稿不写，manifest 仍进入 `handedOff/accepted`。这破坏失败时保留 pending 状态的契约，现有 recovery 测试只覆盖显式 snapshot failure，未覆盖静默拒写。

未发现 083 之外的 scope creep；084/085/086 合并内容未计为新增，087 已记录的 reference-definition 缺口未重复报告。
