# V4 Owner proof双轴独立审查

固定 `2fa3a9e88e7462e3d6929625911cd39f68ce89ad...d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14`，两名新上下文评审分别完成。下文原文保留，不合并或跨轴重评。

# Standards

受检范围：`git diff 2fa3a9e88e7462e3d6929625911cd39f68ce89ad...d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14` 的全部 27 个文件与全部 hunk。已实际读取 `AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/markdown-support.md`、`docs/bridge-protocol.md`、`docs/editor-session.md`、`docs/save-barrier.md`、`docs/local-images.md`、`docs/recovery.md`、`docs/testing.md`、`docs/tasks/INK-M1-083.md`；库内未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`。

## Hard

无。`git diff --check` 无输出；提交 subject 均为英文 Conventional Commits 且不超过 72 字符。Native scanner 删除不是有效覆盖的无声删除：原 8 个 scanner 测试在 `editor/src/source-authority-runtime.test.ts:61-137` 的 canonical parser 覆盖中迁移，另有 `editor/src/main.test.ts:694-765` 的 snapshot/access proof 覆盖。未见绕过 composition、保存闸门或 source-authoritative 约束的标准违规。

## Judgement

- 可能的 `Duplicated Code`：`editor/src/source-authority.ts:555-562` 与 `editor/src/editor-runtime.ts:945-953` 都逐节点筛选 `image` 并收集非空 `href`。可考虑提取接受已解析 doc 的共享 collector；但 bare-CR runtime 需要先做 LF 语义副本，生产 session 使用已接受 doc，当前差异有明确边界，故不算 hard finding。

其余 Fowler baseline（Mysterious Name、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest）在本 diff 未形成可可靠报告的 finding；Bridge 兼容字段与对称 proof 校验按仓库标准保留。

# Spec

## Wrong：旧 proof 在拒绝前已改变资源状态

> “descriptor 注册、授权回填和 `prepareImageSave` 固定到 proof 版本……新编辑与迟到 composition 均在资源变化前拒绝。”（`docs/tasks/INK-M1-083.md:11`）

`EditorViewController.existingImageDescriptor` 先执行 `assetBroker.register/read`（`app/Sources/EditorViewController.swift:773-803`），调用方之后才把 proof 交给 `EditorBridge.setImageDescriptors`（`236-257`、`730-746`）；真正的 revision 拒绝发生在 `EditorBridge.swift:382-386`。可重现：保存捕获 r4，写盘期间编辑到 r5，保存完成用 r4 刷新 descriptor；broker 已新增 capability，Bridge 才报 stale。并且 `setImageDescriptors` 命令只携带 document/revision/epoch，不携带 proof 的 raw/URIs（`BridgeProtocol.swift:326-349`）；composition 可在 revision 不变时改变 `currentRaw`，Web 仍会 `acknowledge` 并应用 descriptor（`editor/src/main.ts:836-850`）。因此 exact-raw proof 没有在资源变化点复验。

## Wrong：080 handoff 可未写草稿即标记 accepted

> “080 handoff 必须在写恢复草稿后……随后才允许 `handedOff/accepted`。”（`docs/tasks/INK-M1-083.md:14`）

`persistRecoveredImageHandoff` 在 proof 含 URI 后调用 `writeRecovery`，随后无条件 `completeRecoveredInsertion`（`app/Sources/InkoraDocument.swift:984-996`）。但 `writeRecovery` 的 revision、closed、store、dirty 等前置失败只是 `return`，不返回写入凭据或错误（`951-970`）。可重现：先把 `bridgeRevision` 推到 6，再传 document/raw/URI 自洽的 r5 proof；草稿不写，manifest 仍进入 `handedOff/accepted`。这破坏失败时保留 pending 状态的契约，现有 recovery 测试只覆盖显式 snapshot failure，未覆盖静默拒写。

未发现 083 之外的 scope creep；084/085/086 合并内容未计为新增，087 已记录的 reference-definition 缺口未重复报告。

## 管理者处理

Standards hard0/judgement1；Spec wrong2，均交090实际红绿修复。root独立editor615及Native169通过只作为候选回归，不抵消Spec发现。083/088/089完成备份及Agent/workspace两层回收；物理验收按用户稍后保留。
