# Standards

基线 7d20ed4da76acc65d3e02d356fa1ea886cf4f308，HEAD 056f74faf51788a05b67051ade8623be9f7ffbbf，单一 commit `feat: ship local image production workflow`，36 文件 +4666/-71。已核实两 ref 存在、worktree clean、diff 非空。书面标准全文已读：AGENTS.md、GLOSSARY.md、docs/adr/0004、markdown-support.md、bridge-protocol.md、editor-session.md、save-barrier.md、testing.md、local-images.md、design/local-images-production-v4.md；仓库不存在 CODING_STANDARDS.md / CONTRIBUTING.md（`find` 全仓确认，缺失记录）。仅静态审查，未运行任何测试或构建；根目录作者候选证据（Native 141/0/7、BridgeNative 12、editor 407+Web 13 等）为作者执行结果，本报告不转称己方执行。

## (a) 书面标准硬违规

0 条。逐项核对要点：Bridge 图片命令与 bridge-protocol.md「图片命令」节字段、capability URL 形状（TS `requireCapabilityURL` 与 Swift `isCapabilityURL` 双侧校验）、ready↔displayURL 一致性、TS/Swift 同步类型与双侧 golden 均符合；CSP 仅增 `img-src inkora-asset://resource`、`connect-src 'none'` 不变（editor/index.html:10），符合 V4「Sandbox、授权与加载」；`prepareImageSave` 先于 snapshot、资源发布复验后才 `super.save`、成功后才 `markSaved`/确认清单（InkoraDocument.swift:517-631），符合 save-barrier.md「图片资源前置屏障」与 V4 提交协议；epoch/token 失效、descriptor-relative open、拒 symlink/越界、stop 后零回调（DocumentAssetBroker/DocumentAssetTaskCore）符合 V4；未新增依赖、未删测试（tests diff 仅 `-image_ref` 字符串与一条 import）；协议文档随实现同步更新。

## (b) Fowler smell（全部 judgement，非硬违规）

- Duplicated Code：`capabilityPattern` 正则两份（editor/src/bridge.ts:494、image-view.ts:25）；`percentEncode` 两份（EditorViewController.swift:716、LocalImageStore.swift:493）；`sha256` 三份（LocalImageStore.swift:489、DocumentAssetBroker.swift:290、LocalImageMigration.swift:403）；`readRegularFile` 三变体（LocalImageStore.swift:366、LocalImageMigration.swift:378、DocumentAssetBroker.swift 内联 read）。
- Mysterious Name：`LocalImageError.corruptManifest` 被用于非清单场景（DocumentAssetBroker.swift:158/167 epoch 不匹配、EditorViewController.swift:527/670 owner 缺失），名称不揭示职责。
- 脆弱子串判定：`document.text.contains(asset.markdownURI)`（EditorViewController.swift:573）可能命中代码块/转义示例中的同串；V4 已由扫描排除机制覆盖迁移路径，此处 judgement 提示。
- Data Clumps：`documentID/revision/documentEpoch/assetID` 参数组贯穿 BridgeProtocol/EditorBridge，属协议边界固有，建议领域 type 但可抑制。
