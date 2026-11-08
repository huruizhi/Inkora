# 技术写作基线与既有路线图核实

核实日期：2026-11-08。此文提供下一轮范围决策的事实输入，不选择首个里程碑。

## 快照与结论

- 远端 `main` 经 `git ls-remote origin refs/heads/main` 核实为 `3bc978e68ba63f48d4e743481be0fe5316ae17eb`。研究起点 `45dae925c6ac6ab9c862192e6657583549bb69d7` 含规划文档；`git diff --stat 3bc978e -- app editor docs Makefile` 无输出，以下产品代码判断对应当前 main。
- [路线图 #1](https://github.com/huruizhi/Inkora/issues/1) 为 **open**，Foundation 至 1.x Enhancements 全部勾选；#26～31 六张实际 issue 均 **open**、验收条件均未勾选。勾选不能作为功能落地或发布门槛通过的证据。
- 冻结规范也存在实现差距：[Markdown 支持矩阵](https://github.com/huruizhi/Inkora/blob/3bc978e68ba63f48d4e743481be0fe5316ae17eb/docs/markdown-support.md#L59) 将任务列表、图片、GFM 表格列为 S 支持；当前 schema 无相应节点，安全检测仍把它们判为 unsupported，整篇转源码。应先对账规范与实现，不能直接把支持矩阵当能力清单。
- 当前有原生文件生命周期、结构化基础 Markdown、源码回退、撤销和恢复草稿的接入代码；没有足够证据宣称已达到 Typora 常用技术写作闭环。本轮编辑器测试被缺失工具阻塞，未重新确认运行质量。

## 官方写作流程对照

以下十条是可供选择的端到端验收候选，覆盖“找到文件→输入修改→组织材料→排版交付→继续写作”；不表示每条都必须进入同一期。Typora 能力来自本轮浏览的官方文档，Inkora 能力来自固定提交源码。官方未承诺的中文 IME、保真或性能指标不作推定。

| 流程与候选验收动作 | Typora 官方能力 | Inkora main 接入与差距 |
| --- | --- | --- |
| 1. 打开项目说明，修改并保存，再关闭重开 | [Quick Start](https://support.typora.io/Quick-Start/#files) 提供文件打开、目录侧栏与快速打开 | `AppDelegate.swift:134` 接入 New/Open/Open Recent/Save/Save As/Close，`InkoraDocument.swift` 管理写盘；尚无目录侧栏/项目快速打开入口。文件存在与内容写对需运行验证。 |
| 2. 连续写中文标题、列表、引用和代码，撤销/重做后保存 | [Quick Start](https://support.typora.io/Quick-Start/#live-preview) 描述输入时预览；[Markdown Reference](https://support.typora.io/Markdown-Reference/) 描述标题、列表和围栏代码 | `schema.ts:109` 有基础节点，`editor-session.ts:63` 装入 history、块/行内 input rules 和键盘命令；`editor-runtime.ts:51` 接 composition。未实现 Typora 式光标进入时显露标记的完整交互，未确认真实 IME/选区体验；代码语言属性不等于代码高亮。 |
| 3. 从网页/文档粘贴材料，调整链接与强调，保存重开 | [Quick Start](https://support.typora.io/Quick-Start/#smart-paste) 支持富文本粘贴及纯文本粘贴；[Markdown Reference](https://support.typora.io/Markdown-Reference/#links) 描述链接 | `editor-session.ts:213` 和 `:239` 接入 Markdown/HTML/plain text 粘贴、HTML 按 schema 清洗；`schema.ts:217` 有强调和链接 mark。不支持的粘贴内容如何保留及链接创建入口的可达性仍需验收，不能从 parser 支持推定完整 UI。 |
| 4. 编写参数对照表与任务清单，改行列/状态后撤销保存 | [Markdown Reference](https://support.typora.io/Markdown-Reference/#tables) 有表格行列工具与任务复选框 | #26 目标存在，schema 尚无表格/任务节点；`markdown-safety.ts:196` 起检测后由 runtime 转源码。源码保留不等于表格交互可用。 |
| 5. 插入本地截图，用相对路径保存，关闭后重开并处理缺图 | [Images](https://support.typora.io/Images/) 支持拖放、粘贴、复制到指定目录和相对路径 | #27 未实现结构化图片节点；`EditorResourceSchemeHandler.swift:46` 仅服务 App bundle/editor 内资源，`editor/index.html:8` 的 CSP 也有限制，不能视为文档图片授权方案。路径、沙盒授权、资源复制和缺图反馈均需设计。 |
| 6. 在长文中定位章节、查看字数，查找术语并替换后撤销 | [Quick Start](https://support.typora.io/Quick-Start/#outline) 有大纲与字数；[Search](https://support.typora.io/Search/) 有当前文件查找替换与跨文件搜索 | `AppDelegate.swift:115` 起菜单和 `main.ts`/runtime 当前接入中未发现大纲、字数或查找替换 UI；#28 仅规定当前文件范围，明确排除跨文件。基础 selection/history 不能代表搜索已接入。 |
| 7. 写公式、Mermaid、脚注，修改源文并检查渲染/导出 | [Markdown Reference](https://support.typora.io/Markdown-Reference/#math-blocks) 有 MathJax 与脚注；[Draw Diagrams](https://support.typora.io/Draw-Diagrams-With-Markdown/) 接入 Mermaid，说明图表属于 Markdown 扩展并受导出格式约束 | 公式/脚注触发源码回退；Mermaid fenced code 作为普通代码文本保留，没有 renderer。当前 `editor/package.json` 无公式/图表渲染依赖，schema 无相关节点。保留源码与渲染支持须分别验收。 |
| 8. 在深浅模式与合适字体/行宽下继续写作，重启保留设置 | [About Themes](https://support.typora.io/About-Themes/) 有 CSS 主题与系统模式切换；[Custom CSS](https://support.typora.io/Add-Custom-CSS/) 可调字体、行宽等 | `style.css:1` 有系统 light/dark 颜色，`:20`/`:26` 固定行宽、字号、行距；未见主题/排版偏好持久化与拼写开关。源码 textarea 明确 `spellcheck=false`（`editor-runtime.ts:133`）。不等于 #29 已完成。 |
| 9. 输出可交付文档，修改后再次导出并核对内容 | [Export](https://support.typora.io/Export/) 内置 PDF/HTML/图片；Word 等依赖另装 Pandoc，并提供再次导出与错误反馈 | 当前原生菜单无导出入口，保存 Markdown 不等于导出。#1 原文把 PDF/Word 延后至 2.0 后评估；本地图已纳入跨阶段导出讨论，应重新决定格式/阶段，不能默认为 1.x 承诺或机械继承排除。 |
| 10. 意外退出后找回正文，需要时浏览/恢复旧版本 | [Version Control and Recovery](https://support.typora.io/Version-Control/) 明确 macOS 使用系统版本浏览/恢复 | `RecoveryStore.swift`、`RecoveryCoordinator.swift`、`InkoraDocument.swift:108` 接入恢复草稿；`:167` 明确 `autosavesInPlace=false`。有草稿恢复，不等于 #30 自动保存与历史版本浏览；外部冲突处理也不能替代历史版本。 |

源码定位均相对于仓库根目录；固定提交入口：[app/Sources](https://github.com/huruizhi/Inkora/tree/3bc978e68ba63f48d4e743481be0fe5316ae17eb/app/Sources)、[editor/src](https://github.com/huruizhi/Inkora/tree/3bc978e68ba63f48d4e743481be0fe5316ae17eb/editor/src)。缺失判断以这些目录、实际菜单与 `editor/package.json` 的静态检索为边界，不宣称已遍历全部未合并分支。

## #26～31 对账

GitHub connector 本轮直接读取 #1、#26～31；六张 issue 的 comments 均为 0。下表所有条目的 #1 框均为 `[x]`，实际 issue 均为 **open** 且验收框均为 `[ ]`。

| 实际 issue | 当前 main 代码事实 | 不能推定的完成内容 |
| --- | --- | --- |
| [#26 GFM 表格与任务列表](https://github.com/huruizhi/Inkora/issues/26) | 安全检测后整文源码模式，无对应 schema 节点 | 行列编辑、任务切换、行为/截图及往返验收 |
| [#27 图片与本地资源](https://github.com/huruizhi/Inkora/issues/27) | 图片风险识别；已有 App 资源 handler，不是文档资源代理 | 相对路径显示、拖粘策略、缺图、安全授权 |
| [#28 查找替换](https://github.com/huruizhi/Inkora/issues/28) | selection/history 基础已接入，未见查找 UI/桥接命令 | 匹配导航、中文替换、替换 Undo |
| [#29 主题排版与拼写](https://github.com/huruizhi/Inkora/issues/29) | 固定 CSS 与系统配色 | 用户设置持久化、拼写集成、主题截图 |
| [#30 自动保存与版本恢复](https://github.com/huruizhi/Inkora/issues/30) | 有草稿恢复；原地自动保存关闭，无版本浏览菜单 | 定时原文件保存、快照历史、旧版恢复的冲突边界 |
| [#31 自动更新与 Stable/Beta](https://github.com/huruizhi/Inkora/issues/31) | 有 `scripts/release` 打包签名流水线；当前 app 源码未见 updater，菜单无更新入口 | 可信更新签名验证、下载安装、通道切换和回滚；发布脚本不等于更新系统 |

另一个发布证据边界：[INK-025 交付记录](https://github.com/huruizhi/Inkora/blob/3bc978e68ba63f48d4e743481be0fe5316ae17eb/docs/tasks/INK-025.md) 明确真实 Developer ID、公证、Gatekeeper、干净用户安装启动和 Beta 发布未执行，不能由路线图 #25 勾选推出发布 gate 已过。本轮没有读取 #2～25 全部实际 issue，不能将它们的状态概括为已核实。

## 测试与人工验收证据分层

1. **规范目标**：支持矩阵的 S/D/U 与 issue 验收条件描述应有行为，不是运行记录；目前与 schema/回退策略有已知差距。
2. **代码及测试存在**：`editor-runtime.test.ts` 有源码回退、composition/selection、CRLF、尾部换行断言；`editor-session.test.ts` 有粘贴及撤销断言。[acceptance.md](https://github.com/huruizhi/Inkora/blob/3bc978e68ba63f48d4e743481be0fe5316ae17eb/docs/acceptance.md) 列出文件生命周期的自动化覆盖，同时明确“覆盖”不代表执行或人工体验通过。
3. **本轮实际执行**：在隔离 worktree 运行 `make test-editor`，退出码 **2**，在 editor-build 前置步骤即报 `.tools/node_modules/.bin/pnpm: No such file or directory`；`editor/node_modules` 亦不存在。因此本轮 **没有 Vitest 用例执行结果，也没有成功构建结果**。未安装依赖；未运行 `make setup`、`make lint`、`make test`、原生/UI 测试或 App，避免超出授权研究边界。`git diff --check` 用于本研究文件排版校验，不能代替产品测试。
4. **历史记录**：[INK-001 validation](https://github.com/huruizhi/Inkora/blob/3bc978e68ba63f48d4e743481be0fe5316ae17eb/docs/evidence/INK-001/validation.md) 在 2026-11-06 的 macOS 27.2 记录 setup/build/test/lint 和中文/CRLF 手工保存通过；这是旧提交的仓库记录，本轮未复跑，不能覆盖当前 main 全流程。`acceptance.md` 的 VoiceOver、真实拼音/双拼、Finder、macOS 14、深色和放大字体清单仍未勾。未拉取本轮 CI/xcresult，不能宣称当前主干自动化全绿。

## 留给后续决策的问题

- 首个阶段采用哪份“真实中文技术文章＋项目 README”作为验收样稿？上述哪些流程必须连贯完成，哪些允许暂用源码回退？
- 表格、图片、任务列表的规范承诺如何与当前代码对齐？每项完成应同时需要哪些实现、测试与人工证据，何时才能更新旧路线图？
- 首个长文导航闭环需要当前文件搜索、大纲、字数中的哪些组合？是否确实需要目录树/跨文件搜索，而非沿用 Typora 的全部组织方式？
- 公式/Mermaid/脚注、主题与导出之间，哪些需要同阶段保证阅读与输出一致，哪些可先保留源码？允许何种离线资源和外部工具依赖？
- 崩溃草稿、自动保存、历史版本分别承担什么职责？最低 macOS、真实 IME 和干净用户环境的验收由何种证据关闭？

研究范围止于这十条基线与已确认的不一致；未改变远端 issue、地图或票据，未替用户作范围、排期或技术选型决定。
