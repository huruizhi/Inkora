# 本地图片生产候选：双轴审查原文

固定范围 `7d20ed4da76acc65d3e02d356fa1ea886cf4f308...056f74faf51788a05b67051ade8623be9f7ffbbf`。以下两轴独立保留；Standards 的 0 hard 不代表 Spec 功能正确。五项 Spec 发现交 067 实际红绿补正，修复前不合图片候选。

## Standards / INK-REV-064

来源提交 `e5e903f723ce06f53ac6651811c2d53c4c38d6ba`；下文原样保留。

# Standards

基线 7d20ed4da76acc65d3e02d356fa1ea886cf4f308，HEAD 056f74faf51788a05b67051ade8623be9f7ffbbf，单一 commit `feat: ship local image production workflow`，36 文件 +4666/-71。已核实两 ref 存在、worktree clean、diff 非空。书面标准全文已读：AGENTS.md、GLOSSARY.md、docs/adr/0004、markdown-support.md、bridge-protocol.md、editor-session.md、save-barrier.md、testing.md、local-images.md、design/local-images-production-v4.md；仓库不存在 CODING_STANDARDS.md / CONTRIBUTING.md（`find` 全仓确认，缺失记录）。仅静态审查，未运行任何测试或构建；根目录作者候选证据（Native 141/0/7、BridgeNative 12、editor 407+Web 13 等）为作者执行结果，本报告不转称己方执行。

## (a) 书面标准硬违规

0 条。逐项核对要点：Bridge 图片命令与 bridge-protocol.md「图片命令」节字段、capability URL 形状（TS `requireCapabilityURL` 与 Swift `isCapabilityURL` 双侧校验）、ready↔displayURL 一致性、TS/Swift 同步类型与双侧 golden 均符合；CSP 仅增 `img-src inkora-asset://resource`、`connect-src 'none'` 不变（editor/index.html:10），符合 V4「Sandbox、授权与加载」；`prepareImageSave` 先于 snapshot、资源发布复验后才 `super.save`、成功后才 `markSaved`/确认清单（InkoraDocument.swift:517-631），符合 save-barrier.md「图片资源前置屏障」与 V4 提交协议；epoch/token 失效、descriptor-relative open、拒 symlink/越界、stop 后零回调（DocumentAssetBroker/DocumentAssetTaskCore）符合 V4；未新增依赖、未删测试（tests diff 仅 `-image_ref` 字符串与一条 import）；协议文档随实现同步更新。

## (b) Fowler smell（全部 judgement，非硬违规）

- Duplicated Code：`capabilityPattern` 正则两份（editor/src/bridge.ts:494、image-view.ts:25）；`percentEncode` 两份（EditorViewController.swift:716、LocalImageStore.swift:493）；`sha256` 三份（LocalImageStore.swift:489、DocumentAssetBroker.swift:290、LocalImageMigration.swift:403）；`readRegularFile` 三变体（LocalImageStore.swift:366、LocalImageMigration.swift:378、DocumentAssetBroker.swift 内联 read）。
- Mysterious Name：`LocalImageError.corruptManifest` 被用于非清单场景（DocumentAssetBroker.swift:158/167 epoch 不匹配、EditorViewController.swift:527/670 owner 缺失），名称不揭示职责。
- 脆弱子串判定：`document.text.contains(asset.markdownURI)`（EditorViewController.swift:573）可能命中代码块/转义示例中的同串；V4 已由扫描排除机制覆盖迁移路径，此处 judgement 提示。
- Data Clumps：`documentID/revision/documentEpoch/assetID` 参数组贯穿 BridgeProtocol/EditorBridge，属协议边界固有，建议领域 type 但可抑制。

## Spec / INK-REV-065

来源提交 `5a8e9931c9f01c7074ee7307ad45eb5cb68a888b`；下文原样保留。

# Spec

- **[P1][c] 首存失败后的 Undo 可把 draft URI 写入最终 Markdown。** V4 要求重写绑定 snapshot，失败后草稿仍可恢复，且 draft URI 不得落盘（`docs/design/local-images-production-v4.md:28-32,46-51,64-65,75`；`docs/save-barrier.md:45-47`）。但发布后 manifest 立即把 `markdownURI` 改为目标 URI（`app/Sources/LocalImageStore.swift:286-317`）；Markdown 写失败后 Undo 可恢复旧 draft URI，同目标重试却因 manifest 已是目标 URI而生成空 rewrite（`:247-283`）。保存只发布 plan 后直接写 snapshot，未重验 snapshot 是否仍含 plan 的目标 owner（`app/Sources/InkoraDocument.swift:536-640`）。scratch 真实输出：`draft=inkora-draft://…`、`manifest=Note.assets/source.png`、`retryRewrites=0`；成功后还会确认并退役草稿。

- **[P1][c] Save As 会漏迁移合法引用式图片并静默断链。** V4 要求保留引用字节且保证目标资源（`docs/design/local-images-production-v4.md:10,53,59,66-67,78`），SYN-S010 要完整 CommonMark 引用式图片（`docs/markdown-support.md:79,117,174`）。扫描器仅对 label `lowercased()`，未做 CommonMark 空白折叠（`app/Sources/LocalImageMigration.swift:169-197`）。scratch 使用 `![x][A   B]` 与 `[a b]: Old.assets/a.png` 得到 `planned=0 copied=false`，随后 Markdown 仍可保存到新目录。

- **[P1][c] pending 导入恢复会丢失原 revision/选区并迁移到当前光标。** 导入意图必须绑定 document/session/asset 与版本，过期或 dirty 时保留但不得换选区重试（`docs/design/local-images-production-v4.md:20,28,32,71,74`；`docs/local-images.md:17,25`）。manifest 只存资源状态、不存 epoch/revision/selection（`app/Sources/LocalImageStore.swift:31-46`）；恢复又以 `document.text.contains(uri)` 冒充 owner，否则直接 `presentImportedImage`（`app/Sources/EditorViewController.swift:539-577`），用当前 revision/selection 重新入队。URI 出现在代码/普通文本时还会被误记 accepted。

- **[P2][a] Save As journal 是只写记录，重启后无人恢复或裁决。** V4 要求按持久记录与实际字节保守恢复 SIGKILL 窗口（`docs/design/local-images-production-v4.md:47-51,76,78`）。实现仅写 `prepared/published-awaiting-markdown/failed-conservative` 并按已知 plan ID 删除（`app/Sources/LocalImageMigration.swift:26-32,101-161`）；生产代码没有枚举、解码或重启恢复入口。

- **[P2][c] 书签恢复失败仍会签发 `ready` capability。** 打开 Markdown 不能冒充父目录授权，拒权必须与缺失分层（`docs/design/local-images-production-v4.md:36-38,53`）。书签错误被 `try?` 吞掉（`app/Sources/InkoraDocument.swift:181-194`），session asset 随后回退到未授权的文档父目录（`app/Sources/EditorViewController.swift:509-536`）并被标成 `ready`（`:539-549`）；真正 scheme 读取失败前 UI 已收到假成功描述。

**[b]** 未发现达到报告门槛的未要求范围扩张。

实跑：Vitest `source-authority-runtime.test.ts` + `bridge.test.ts`，59/59；两次一次性 Swift scratch 反例见上。未重跑作者/根 Agent 的全套结果；未验 GUI、真实 Sandbox/bookmark/WK、系统拖放/剪贴板、IME、macOS 14、正式关闭重开，保留 V4 deferred 门槛。

