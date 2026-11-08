# INK-RES-002：保存与历史的平台事实

研究日期：2026-11-08。目标为 macOS 14+ App Sandbox；本文是方案研究，不是实现或真机验收。

## 固定基线与代码现状

研究起点/读取生产代码固定基线：`36e636578798510d240b23520122c88578cf3fe5`（`fix(editor): merge scroll and extension preview fixes (#69)`）。当前交付 HEAD 是研究提交，不是该生产基线。以下只是源码读取证据，未运行应用。

- `InkoraDocument.autosavesInPlace` 明确返回 `false`，类中无 `preservesVersions` override：[InkoraDocument.swift](../../app/Sources/InkoraDocument.swift#L167)。
- override `save(to:ofType:for:completionHandler:)` 在 #ENC-002 状态下直接以错误完成；正常情况排队等待快照：[InkoraDocument.swift](../../app/Sources/InkoraDocument.swift#L302)。快照完成后调用 `super.save`，只有 error 为 nil 才更新磁盘版本、保存基线并确认快照：[InkoraDocument.swift](../../app/Sources/InkoraDocument.swift#L426)。
- `write(to:ofType:for:originalContentsURL:)` 对目标 URL 开启安全作用域，并在写前验证原件状态后写数据：[InkoraDocument.swift](../../app/Sources/InkoraDocument.swift#L271)。外部变更处理见 [InkoraDocument.swift](../../app/Sources/InkoraDocument.swift#L461)（`refreshFileState`）及其后处理；恢复快照路径位于 641 行起。恢复仓库实际写入 Application Support 下 `Inkora/Recovery`：[RecoveryStore.swift](../../app/Sources/RecoveryStore.swift#L206)。
- ADR 规定 AppKit/NSDocument、安全作用域文件访问和 App Sandbox，最低 macOS 14：[ADR-0001](../adr/0001-tech-stack.md#L16)、[ADR-0003](../adr/0003-project-and-bridge.md#L20)。

产品政策输入为路线票 09：M1 显式原件保存并独立恢复；后续原件自动保存默认关闭，首次提供自动写原件时必须同时有浏览、比较、恢复历史。未命名稿保留资源；默认资源目录为文档名 `.assets`；已有引用保持原样，不自动清孤儿。系统文件版本不能据此宣称会冻结旁置图片。

## Apple 文档核实

### 系统管理版本

`NSDocument.autosavesInPlace` 是子类能力声明，默认 `false`；AppKit 会在多处查询（包括决定自动保存操作类型和未保存提示），不应用它判断某一次是否正在自动保存，应检查传入的 `SaveOperationType`。[Apple：autosavesInPlace](https://developer.apple.com/documentation/appkit/nsdocument/autosavesinplace)。`autosavesDrafts` 是另一机制，默认 `true`，要求子类处理 `NSAutosaveAsOperation`；该操作写到新文件/包并改变文档位置，不能与原件原位自动保存混为一谈。[Apple：autosavesDrafts](https://developer.apple.com/documentation/appkit/nsdocument/autosavesdrafts)。

`NSDocument.save(to:ofType:for:completionHandler:)` 完成处理器必须在主线程调用，成功传 nil、失败传 NSError；默认实现调用 `canAsynchronouslyWrite` 后调用 `writeSafely`，在安全写成功后更新 URL、文件类型、修改日期、改动计数等状态并完成回调。[Apple：save(to:ofType:for:completionHandler:)](https://developer.apple.com/documentation/appkit/nsdocument/save%28to%3Aoftype%3Afor%3Acompletionhandler%3A)。`writeSafely(to:ofType:for:)` 默认转调 `write(to:ofType:for:originalContentsURL:)` 并写文件属性；其职责是尽量降低应用/系统崩溃、硬件故障或断电导致磁盘状态不一致的危险，覆盖此方法时 Apple 要求调用 super。对于 NSSaveOperation，是否保留旧磁盘修订由 `keepBackupFile` 决定。[Apple：writeSafely(to:ofType:for:)](https://developer.apple.com/documentation/appkit/nsdocument/writesafely%28to%3Aoftype%3Afor%3A%29)。这是主文档写入契约，不保证旁置 `.assets` 与 Markdown 构成单一原子事务，也不等价于版本历史保证。生产代码 override save 并调用 `super.save`，override write，而未 override `writeSafely`；从源码可确认适用的父类路径，但具体 Sandbox 卷仍需实测。

`NSDocument.browseVersions(_:)` 的官方 DocC JSON abstract 表示它会在文档主窗口打开 Versions 浏览器；discussion 说明它是文档式应用 Browse Saved Versions 菜单项的 action。[Apple：browseVersions(_:)](https://developer.apple.com/tutorials/data/documentation/appkit/nsdocument/browseversions(_:).json)。因此不能说系统没有版本浏览器。系统已有浏览入口并不证明 Inkora 已接入、运行或其当前配置下可用。

`preservesVersions` 默认实现返回 `autosavesInPlace` 的值；返回 false 会禁用版本浏览和 `revertToSaved(_:)`，当 `autosavesInPlace` 为 false 而 `preservesVersions` 为 true 时 Apple 明确标为 undefined behavior。[Apple：preservesVersions](https://developer.apple.com/tutorials/data/documentation/appkit/nsdocument/preservesversions.json)。生产代码当前 `autosavesInPlace == false` 且未 override `preservesVersions`，所以继承默认对齐；要启用系统版本功能需共同设计这两项，不能单独翻转其中之一。

`NSFileVersion.otherVersionsOfItem(at:)` 可枚举指定文件除当前版本外的版本；本地文件通常包含显式保存或编辑期间适当时点产生的版本，但文档没有承诺每次保存必生成、固定数量或固定保留期。[Apple：otherVersionsOfItem](https://developer.apple.com/documentation/foundation/nsfileversion/otherversionsofitem%28at%3A%29)。`removeOtherVersionsOfItem(at:)` 可删除除当前版外所有版本，Apple 要求在协调写操作中调用；这说明应用可执行删除操作，不代表应用控制系统版本库的总容量/全局回收策略。[Apple：removeOtherVersionsOfItem](https://developer.apple.com/documentation/foundation/nsfileversion/removeotherversionsofitem%28at%3A%29)。

Apple 提供系统 Versions 浏览器入口；可用于系统提供的历史浏览体验。Inkora 仍需适配其异步编辑快照、原始 Markdown 保真、旁置资源关联、外部冲突状态，以及用户选择历史版本后是否恢复副本还是覆盖原件的产品语义。Apple 页面证明有浏览器 action，不证明该 UI 当前已接入验证，也不证明系统 UI 满足 Inkora 自定义文本差异/资源保真/恢复副本要求。Apple 文档没有保证任意位置均支持历史版本，也没有给出应用可配置的系统总容量/保留期。主文件版本不代表旁置 `.assets` 同步版本化。

### 协调、安全作用域与自建检查点

Apple 建议用 `NSFileCoordinator` 和 `NSFilePresenter` 协调跨线程/进程安全文件访问。[Apple：Improving performance and stability when accessing the file system](https://developer.apple.com/documentation/foundation/improving-performance-and-stability-when-accessing-the-file-system)。具体的 NSDocument safe-write 对所有自定义异步快照、旁置资源事务和外部提供者的保证边界仍须在原型验证；当前 `write` 注释称其由 NSDocument 协调 safe-save 调用，是代码设计说明，不构成本研究对任意路径运行行为的验证。

沙盒持久访问依赖用户授权和 security-scoped bookmark；解析后仍须对 security-scoped URL 调用 `startAccessingSecurityScopedResource()`。[Apple：CFURL security-scoped bookmarks](https://developer.apple.com/documentation/CoreFoundation/CFURL)、[Apple：withSecurityScope](https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/withsecurityscope)。因此自建历史可放在应用容器，但若历史外置、与文档同目录或要访问原件/资源，权限范围和书签生命周期须分别设计。首次保存需用户选择位置；Save As、移动、撤销授权后资源归属与引用更新都不是 NSFileVersion 文档替应用决定的策略。

自建检查点可明确保存原始 Markdown 字节、时间/原因、资源引用及保留规则，离线枚举和比较不依赖系统版本列表；代价是自行实现原子写、索引损坏恢复、容量上限、清理、迁移/卸载语义、冲突处理和访问控制。系统版本和自建记录各有生命周期；没有证据表明系统版本 API 会把应用自己的旁置资源纳入同一事务。

## 路线对照

| 场景 | 系统管理（NSDocument / NSFileVersion） | 应用自建检查点 |
|---|---|---|
| 保存失败 | NSDocument 保存完成回调可报告错误；只在成功后确认文档保存点。版本是否产生及回收不等同保存成功契约。 | 应在检查点文件和索引持久成功后确认；需自行处理部分写入/磁盘满。 |
| 首次保存、未命名 | 由保存面板/用户确定路径；自动保存不可替用户选择文件名和位置。未验证首次自动保存的具体 UI 时序。 | 可先留在容器内的未命名草稿库；显式保存成功后绑定目标身份。 |
| Save As / 移动 | 版本按指定 URL 查询；新位置是否带历史、旧位置历史如何表现，Apple API页未作本产品所需保证。需真机测。 | 可选择随文档导出/复制或继续存容器；需要定义身份迁移规则，不能默默把历史丢失。 |
| 外部修改 | NSDocument 保存机制含外部修改检查描述；协调访问用于减少并发访问风险。具体提供者、冲突与安全提示需测。 | 保存基线指纹并在提交前比较；历史保留与冲突UI由应用负责。 |
| 不支持版本的位置 | API 文档没有为所有卷/提供者承诺版本可用；列表为空/错误的区分要测，不能假装存在历史。 | 容器内仍可用，但只要应用容器可写；外部资源读取仍受授权制约。 |
| 离线浏览、比较、恢复 | NSDocument 有 `browseVersions(_:)` 系统 Versions 浏览器入口；Inkora 需验证接入与可用性，并适配快照、资源及恢复副本语义。自定义文本差异仍由应用实现。离线可读性未获普遍保证。 | 本地检查点可离线；差异和恢复副本由应用完全实现。 |
| 旁置图片 | 主文件版本不证明 `.assets` 自动冻结；不要宣称自动保存图片版本。 | 可将自有托管资源纳入检查点引用/快照；须按09规则保留被历史引用资源，不改已有外部引用。 |
| 容量与清理 | API允许移除旧版本，但未发现应用可设系统全局容量配额/保留期的保证。 | 应用可设本地预算、保留期和引用计数清理；责任与实现复杂度都归应用。 |
| 卸载、迁移 | Apple 文档未承诺版本库跨卸载/迁移的应用级可移植性。 | 容器历史可能随应用数据删除；随文档迁移需显式导出格式/策略。不得假定可恢复。 |

## 推荐与待验证边界

建议保持路线票09：先完成显式保存与独立恢复；后续自动写原件默认关闭，并仅在历史浏览/比较/恢复可用时提供开关。评估系统路线时，应将 NSDocument 的 Versions 浏览器作为真实候选：配套验证 `autosavesInPlace` 与 `preservesVersions` 正确配置，确认系统浏览、恢复入口是否满足所需工作流；不足处由 Inkora 适配或补自定义比较/副本恢复。平台事实不足以现在锁定全系统版本或全自建架构。可评估混合方案：系统版本作为原件历史来源，自建检查点满足可预测的离线浏览/比较/恢复；需在实验后权衡重复存储、用户可理解性和清理责任。此为建议，不是架构决策，不代表 M0/M1 完成。

自建历史的资源规则应遵守09政策：历史引用仍存在时不清理应用托管资源；默认目录名 `.assets`；未命名稿保留待移交资源；不改写已有资源引用、不清孤儿。系统版本不得被描述为自动冻结外部 `.assets` 图片。

## 后续签名 Sandbox 原型的最小实验

本次未运行 macOS 14 真机 Sandbox 实验，也未创建原型。后续用签名并启用 App Sandbox 的最小 NSDocument 工程，分别在应用容器、用户选取的本机目录、外接卷/不支持版本的位置（若可得）执行，记录 OS build、卷类型、entitlements、签名身份及完整错误：

1. 在签名 Sandbox NSDocument 子类中成组验证 `(autosavesInPlace, preservesVersions)`：`(false, 默认继承 false)`、`(true, 默认继承 true)`；不要运行 Apple 文档指出 undefined behavior 的 `(false, true)`。另核验 false/false 下浏览与 revert 的禁用表现。观察系统 Browse Saved Versions 菜单 action、主窗口 Versions 浏览器是否出现及结果。对照显式保存、自动保存操作类型、异步快照延迟、保存失败与回调；观察 dirty 状态、原件字节、版本列表和恢复副本。
2. 未命名文档首次保存取消/成功，Save As 到另一目录，文件移动/重命名；逐步记录 URL、书签可解析性、原旧位置版本列表与资源目录位置。
3. 另一个进程在保存前、快照等待期间和 coordinated write 期间修改/替换/删除原件；观察冲突检测、回调错误、最终字节及本地缓冲是否仍 dirty。
4. 枚举 `NSFileVersion` 并离线断网后读取/比较/恢复为副本；比较应用重启前后、重启后、恢复操作前后的版本列表。对旁置 `.assets` 图片分别修改，检查系统版本是否只覆盖主文件（预期作为待测，不预设结果）。
5. 通过协调写调用移除旧版本，测量实际目录/卷占用变化及 UI 可见结果；测试删除权限、磁盘满、权限撤销及卸载/重装后的系统历史和应用容器检查点可见性。
6. 自建路线另测索引/快照写入中断、图片被历史引用时清理保护、容量预算及迁移导入导出。

可观察结果至少包含：每次操作前后文件 hash、URL/资源路径、bookmark stale 与访问成功、NSDocument completion error、dirty/save point、NSFileVersion 元数据和可读字节、图片 hash、磁盘占用、重启/离线后结果。只有这些结果可支持目标环境结论；部署目标 macOS 14 本身不能证明通过。

## 资料缺口

初次研究读取的 Apple Developer 页面涵盖前述 API 摘要/讨论。未找到 Apple 对所有文件系统的版本支持矩阵、版本保留容量上限、NSDocument 自动版本生成频率、应用卸载迁移、主文件版本包含旁置资源、离线恢复可用性的普遍保证；这些均明确保留为未知/实验项，不外推。修订时额外读取 `browseVersions` 和 `preservesVersions` 的 DocC JSON，证据见下节。

### 本次限定修订证据（2026-11-08）

- 直接 `curl` 获取并解析 Apple DocC JSON：[`browseVersions(_:)`](https://developer.apple.com/tutorials/data/documentation/appkit/nsdocument/browseversions(_:).json) 的 abstract 与 discussion；[`preservesVersions`](https://developer.apple.com/tutorials/data/documentation/appkit/nsdocument/preservesversions.json) 的 default、禁用行为及 undefined behavior 字段。保存为 `/tmp/ink-browse.json`、`/tmp/ink-preserve.json` 后用 Python 读取 JSON 正文。
- 直接 `curl` 获取 Apple 文档 Markdown 并阅读全文：[`save(to:ofType:for:completionHandler:)`](https://developer.apple.com/tutorials/data/documentation/appkit/nsdocument/save(to:oftype:for:completionhandler:).md)、[`writeSafely(to:ofType:for:)`](https://developer.apple.com/tutorials/data/documentation/appkit/nsdocument/writesafely(to:oftype:for:).md)，分别保存为 `/tmp/ink-save.md`、`/tmp/ink-safe.md`。web 页面 HTML 是 JS 壳；本次通过官方 Markdown 正文核实。早前“未读取 DocC JSON”的记录仅描述初次研究；本段记录本次修订补读事实。
- 重新读取生产代码精确行号：`autosavesInPlace` L167–169；`save` override L302–327；`write` override L271–294；父类保存与成功确认 L426–458；恢复仓库路径 L206–219。当前来源 commit 固定为 `36e6365…`；当前 checkout 的研究 HEAD 是 `28d5ab0…`。
- 本次资料仍未确立全位置版本支持、系统容量控制、旁置资源版本事务、离线可恢复性和卸载/迁移保证；明确作为未知保留。无 macOS 14 真机或 Sandbox 原型结果。
