# INK-UX-143 技术修改入口与准确返回

第一阶段完成，产品未修改，等待根管理者决定接线归属。基线 `9b3ab4f7b219fe3e52a6b577213c6d8332b4cf7c`；分支 `task/INK-UX-143-technical-navigation`。

## 实跑证据

独立临时 harness 及配置在 `artifacts/INK-UX-143`，可审查副本在 `docs/evidence/INK-UX-143`。从 editor 运行：

```sh
../.tools/node_modules/.bin/pnpm exec vitest run --config ../artifacts/INK-UX-143/vitest.config.ts --disableConsoleIntercept
```

2026-11-11 实跑 1 file / 1 test passed。这是生产 createEditorRuntime 的 JSDOM 公共 DOM 行为证据；scrollIntoView 使用记录调用目标的替身，不证明几何、WK paint、物理键盘或 Sandbox 权限。

- 两处同 label 引用，第二引用→定义→返回，调用目标为 `definition, reference-1`。导航前后 snapshotText、directedSelection、status 全等，回调次数为零。
- 成功和非法 math 均生成对应预览，两者 button/a/input/textarea/tabindex 控件数均零。只有源码修改提示，没有可执行入口。
- 源码初始范围 0/0，selectSourceRange 20/29，cancel，再次进入源码后范围变为 20/29。原文、dirty、撤销重做资格不变；三次模式切换仅 status 通知。不能声称普通取消恢复原有选区。

未修改/复制既有有效测试作为本人实跑。未运行全量测试、lint/build、NativeReleaseCI，未启动 App 或窗口。临时配置有 Vite CommonJS/ESM 未来兼容提示，未影响测试。

## 事实与假设排序

1. `technical-preview.ts:5-12` 的 find 只取 label 首个目标；引用 click 与定义 back 没有真实来处上下文。这是已复现主因。
2. `technical-preview.ts:46-75` 和 `protected-preview.ts` 的只读声明没有修改回调。两个 math 状态均复现入口缺失。
3. `editor-runtime.ts:357-378` 未变草稿先读取 textarea 当前范围并 setSourceSelection；399 的 selectSourceRange 只改 DOM。上述取消反例确认无法直接拼接两个 API 并承诺恢复。
4. `source-token-provenance.ts` 的 bindOpaqueInlineSource 已保存 sourceStart/sourceEnd/raw/kind；`source-document.ts` 的 parse 返回 opaqueSpans 与 canonical ranges；可复用位置依据。`source-authority.ts:616` captureMathContent 已有 PM position + expectedRaw + 同次 token 对应实践，不能以 expectedRaw 首次匹配替代位置。
5. Mermaid `mountMermaidPreview` 在队列、loadRenderer 后及 render 后检查 canceled/isConnected，代码工具已有切换入口。本轮无实际反例，暂不修。

## 最小接口提案（未获实施决定）

runtime 拥有私有 TechnicalTarget/ReturnContext；preview 只接 `onEdit`/`isCurrent` 等回调，不持内容权威。目标绑定 runtime 实例 token、load 生命周期、完整 raw、session.version/epoch、canonical accepted range/kind、expected PM node/getPos，以及原有 PM anchor/head 和有向 raw anchor/head/affinity。

进入前同步校验 connected、composition、raw/revision/epoch、owner 位置和选区；按同次 canonical 的 accepted range 选择源码，禁止文本首次匹配、DOM text 定位。定位失败不可留下半进入状态。技术入口的取消路径独立持有返回上下文，校验 same runtime/load/raw/revision 后恢复原有可信有向 raw/PM 位置；不得修改普通源码取消语义。提交继续走既有完整源码草稿路径，清掉旧返回上下文；dirty draft 不丢失。apply/load/destroy/新 epoch/选区变化关闭或拒绝旧入口，不能转投新文档。

脚注引用保存本次真实 owner/range 和对应 DOM，定义返回只使用本次绑定；DOM detached、跨 load 或内容版本变化拒绝，无 first 回退。单次导航不写内容/revision/history/dirty，composition 中不额外调度。

拟归属 technical-preview.ts / protected-preview.ts / 同域测试和独立 CSS；runtime 仅在根确认后最小接线，与 A142 image callback guard 协调。canonical/schema/main 不动，不放宽 doc.eq，不直接编辑或删除保护节点，不新增局部 TeX/inline math。

## 风险与未完成

尚未实现精确 owner 绑定、技术取消上下文、产品按钮或新导航；上面为接口建议，不能当成通过验收。容器内同文 owner 必须通过同次 canonical 位置与 PM 投影核对，遇到无法证明对应关系应拒绝。工作树/链接/临时产物保持供根管理者两层备份和独立复核，未自行回收、PR、merge 或安装。

## 实施结果（根管理者批准后）

阶段一结论及原始坏行为 probe 原样保留；以下为后续产品实现，取代“等待实施”的当前状态。

- `editor-runtime.ts` 私有技术 NodeView 回调捕获目标。先要求完整 canonical doc.eq，再逐一核对 protected node 与同次 opaqueSpans 的数量、顺序、raw/kind，最后以当前 getPos 对应精确 accepted sourceStart/sourceEnd；缺项/失配拒绝，不用 captureProtectedRanges 合并范围，不用文本首次匹配。没有新增 source-authority/parser/ledger 接口。
- 公式两态与脚注定义提供可 Tab 到达的“在源码中修改”按钮；沿用 enterSourceMode/onChange status，提交和取消仍在既有 source 路径。技术取消独立恢复入口前完整 PM Selection 和有向 raw/affinity；dirty cancel 同样恢复。成功 apply（含 no-op）、Undo/Redo/destroy 清理上下文，过期取消保留当前草稿，普通源码取消语义保持。
- 脚注真实来处保存在 runtime 私有上下文，返回滚动并聚焦本次引用按钮；无来处/失配不回退首个引用。selection transaction 或 content change 清理旧返回。
- 对根管理者提出的活性风险补了实际 RED：公共 PM view.dispatch 普通 insertText 后，技术按钮仍连接却因创建时 raw/version 旧绑定失效。现在当前连接控件每次操作从当前 canonical 捕获资格；已打开的返回上下文仍绑定当时 raw/version/epoch。detached/destroy 不放宽。
- 技术 inline NodeView 保留原有 protected-inline 的只读、dataset、title 和非脚注文本 DOM。dataset 仅延续序列化/剪贴板展示契约，完全不用于 owner 定位。

新测试 `technical-navigation-runtime.test.ts` 5 个：实际第二引用返回与焦点、成功/失败公式按钮、BOM/CRLF 重复公式及 quote 范围、反向/dirty取消、范围外字节与 UndoRedo、composition、旧按钮与同raw新runtime、无修改apply清理上下文、普通正文输入后仍可用。普通输入及 PM selection 核实使用测试适配器获取真实 PM view，调用公开 view.dispatch；不是 DOM 物理键盘事件。

NodeSelection 有限核实：生产 view.dispatch(NodeSelection.create(...)) 在进入技术入口前已被现有 session 规范化成 TextSelection。因此新增测试只证明实际被接受 PM selection 的 dirty 取消保真，不声称真实 NodeSelection 入口已验。实现保存完整 Selection 对象，消除了本切片自己以 TextSelection.create 压缩类型的风险；不改变普通 session 语义。

### 实际 RED / GREEN 与构建

`docs/evidence/INK-UX-143/red.txt` 是产品修改前期望返回第二引用的真实失败；`live-control-red.txt` 是根指出活性问题后的真实失败，其中 NodeSelection 请求类型断言也展示了现有规范化事实，未冒充产品取消缺陷。

从 editor 实跑：

```sh
../.tools/node_modules/.bin/pnpm exec vitest run src/technical-navigation-runtime.test.ts src/technical-preview-runtime.test.ts src/protected-source-runtime.test.ts src/source-authority-runtime.test.ts src/protected-oracles.test.ts --reporter=verbose --disableConsoleIntercept
../.tools/node_modules/.bin/pnpm run build
```

定向 GREEN：5 files / 120 tests passed，分别为新 technical-navigation 5、既有 technical-preview 9、protected-source 22、source-authority-runtime 66、protected-oracles 18。构建包含 prepare-renderers、tsc --noEmit 与 vite，成功；仅打包 chunk 大于500KB 提示。日志独立保存，不把原作者报告作为此次实跑。全量 lint/test、Native/Bridge、WK/paint、物理IME与macOS14未跑，留根组合结算。

修改文件：editor-runtime.ts、technical-preview.ts、protected-preview.ts、technical-preview.css、新 technical-navigation-runtime.test.ts，以及本任务/evidence。未改main/schema/context-tools/source-authority/依赖。独立 CSS 仅复用既有 Mermaid 修改按钮层级与 focus outline；未验证屏幕几何。

根管理者已接收 NodeSelection 规范化证据，撤回“本切片 NodeSelection 取消缺陷已证实”的假设，不增加私有注入或 session 改动。最终审查产物与工作树保留；本人创建的两个临时工具 symlink 在验证后 unlink，不删除共享依赖目录。
