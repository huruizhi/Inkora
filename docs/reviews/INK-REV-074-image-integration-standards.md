# Standards

任务 INK-REV-074（Standards 轴，branch `task/INK-REV-074-image-integration-standards`）。
受检 HEAD `a58b8ba1edddb7863856214b9c36f0893030bf11`，对比起点 `c9e247defa790db399f6286f8e83086b736bfd4d`；唯一 diff 命令 `git diff c9e247d...HEAD`，实际 40 文件 +5706/−88，工作树 clean。纯静态审查，未运行任何测试；root 已运行并回报的 Web570/Native159/lint/Release/test-ci 属 root 证据，本报告不从绿测试数推定契约正确。

## 标准来源确认

- 全仓检索 `CODING_STANDARDS.md`、`CONTRIBUTING.md`（含子目录 glob）：**均不存在**。书面规则基线为 `AGENTS.md` + `GLOSSARY.md` + `docs/`（bridge-protocol、save-barrier、local-images、recovery、editor-session、testing、adr/0004、design/local-images-production-v4、markdown-support），均已全文/按域读取并逐条对照。
- 不重复报告 V6 原有 epoch/嵌套 marks 两项（已交 075）。

## (a) 书面规则违反

逐条对照未发现硬违反，关键契约均有对应实现证据：

- **Bridge 双侧 selection 契约**（bridge-protocol.md:133）：`BridgeEditorState` selection 双字段同缺同现校验（BridgeProtocol.swift `state.selection` 分支）；`applyImageImport` 携带完整 directed selection 并以 capability URL 正则校验（BridgeProtocol.swift `isCapabilityURL` / bridge.ts `capabilityPattern`，两侧均限定 `inkora-asset://resource/<uuid>` 单段路径）。严格绑定 payload（imageImport/imageSave）在 `stale_revision` 时**不再重试**（EditorBridge.swift `action == .retry, binding == nil`），符合"过期后拒绝且不迁移到当前光标"。
- **source-authority 边界**（adr/0004）：`insertImage`/`rewriteManagedImages` 是显式原文事务（snapshot→patch→parse→history/revision 推进，失败 `restore(before)`）；composition、源码 dirty draft、未解决输入时拒绝并保留意图，不偷改原文；`prepareImageSave` 成功即 revision+1，未被 `markSaved` 替代。
- **保存屏障**（save-barrier.md:45）：`InkoraDocument` 先 `imageSavePreparer`（内含 `prepareImageSave` 内容事务）→ snapshot → `validateMarkdownSnapshot`（draft URI 消失、目标 URI 存在于真实 owner 集合）→ `publish` → 才 `super.save`；失败走 `finishCurrentSave(error)`，不触 Markdown writer。
- **授权/离线**：CSP 仅增 `img-src inkora-asset://resource`，`connect-src 'none'` 不变（editor/index.html）；bookmark 只读/读写选项区分（AssetBookmarkStore）；无新依赖/lock/entitlement（diff stat 证实）。
- **测试保留**（testing.md：默认 CI 非 UI 路径）：新增测试均在 `tests/InkoraTests` 与 `editor/src/*.test.ts` 非 UI 路径内。

观察（非违反）：`decodeCharacterReferences` 用 `NSAttributedString(html:)` 解码实体，仅在无网进程内做字符串转换，未引入网络，但属于较重的实现选择，与 markdown-support 的 CommonMark 归一化目标一致性建议在实现轴复核。

## (b) Fowler smell（均为 judgement，非 hard 违规）

按文件/hunk：

1. **Duplicated Code（最显著）**：安全读文件循环实现 4 份 — `DocumentAssetBroker.read(entry:)`、`LocalImageMigration.readRegularFile`、`LocalImageMigration.readRegularMarkdown`、`LocalImageSession.readRegularFile`；且 EOF 语义已漂移（broker 版短读返回已读 offset，其余返回 −1 判 invalidSource），是未来字节校验分歧的真实风险点。`sha256` hex 帮助函数 3 份、`percentEncode` 2 份（EditorViewController + LocalImageStore）逐字相同。Web 侧 `markdownImage`（source-authority.ts）与 `imageSource`（source-transaction.ts）的 URI 安全校验 + alt/title 转义逻辑近乎重复（含同一 `/%(?![0-9A-Fa-f]{2})/` 正则）；`capabilityPattern` 在 bridge.ts 与 image-view.ts 各一份。建议抽 `SecureFileReader`/`SHA256.hex`/共享 image-source 模块，属安全语义一致性收益而非纯美观。
2. **Data Clumps**：`selectionAnchor/selectionHead` 成对散布于 `BridgeEditorState`、`BridgeNativeCommand`、`MutationPayload.imageImport`、`LocalImageAsset.ImportIntent`、TS `EditableState`/`directedSelection`；runtime 已有 `DirectedSelection` 类型，双侧未复用，字段增删时需同步 6 处。
3. **Primitive Obsession**：bookmark role 字符串（`"document-directory"`/`"document-read-directory"`/`"save-as-source"`）作为裸字面量散布 EditorViewController/InkoraDocument 的 if 链；`documentEpoch.uuidString.lowercased()` 转换在每个 EditorBridge 调用点重复。可收敛为 enum + 单一转换点。
4. **Divergent Change**：EditorViewController 单文件吸收约 500 行新职责（导入面板、授权流、descriptor 刷新、保存前准备、拖放/剪贴板路由），视图控制器同时因面板 UX、协议、保存流程三类原因变更。
5. **Mysterious Name**：`refreshImageDescriptors` 的 completion 内执行 `markInsertionAccepted`/`presentImportedImage` 重投，名称只暗示刷新；`presentImportedImage` 实际派发正文内容事务，远超"present"。
6. **Shotgun Surgery（轻度）**：`ImageMigrationJournal` 根路径与 `LocalImages/…` 路径字面量在 InkoraDocument 3 处现场拼接，改布局需多点同步。
7. **Repeated Switches（轻度）**：`LocalImageError → BridgeImageStatus` 映射 switch 在 `existingImageDescriptor` 与 `refreshImageDescriptors` 两处出现。
8. **Feature Envy（弱）**：`EditorViewController.register(_:)` 大量读取 asset/document/broker 三方数据拼 root/basePath，逻辑上更贴 broker 或 document 层。

未发现值得报告的 Speculative Generality（注入 codec/scheduler 均被测试真实使用）、Message Chains、Middle Man、Refused Bequest。

## 已声明未验（不另计为缺陷）

真实 WK 图片渲染、拖放/系统剪贴板、跨启动 bookmark、Sandbox 面板、IME、正式关闭重开、macOS 14 实机——均属 root 已声明的物理验收门槛，本静态审查未验证也不伪称通过。
