# 性能基线（INK-023）

本文记录 Inkora 的可重复性能基准：指标定义、样本、命令、阈值策略、当前基线数据与热点分析。基线数值存放在 [`docs/perf/baseline.json`](perf/baseline.json)，硬件与样本规模随基线一并记录。

## 命令

| 命令 | 内容 |
| --- | --- |
| `make perf-samples` | 生成确定性 Markdown 样本到被忽略的 `build/perf-samples/`（固定种子，字节级可复现） |
| `make bench` | 轻量基准：编辑器层 Vitest 测量 + 原生层 hostless XCTest 测量 + 基线比较。**不启动 App UI，可在 CI 与 agent 本地运行** |
| `make bench-full` | 完整基准：`make bench` 之上叠加 full profile 编辑器测量、WKWebView 载入/桥接往返基准（仍 hostless），以及 App 冷启动 XCUITest 基准。**会启动 App UI，只能在 macOS runner / 人工触发** |
| `INKORA_PERF_STRICT=1 make bench` | 严格模式：任何指标超过阈值即失败（默认仅警告） |

CI 默认在 `make test-all` 后运行 `make bench`（仅警告，避免环境噪声导致红灯）。手动 `workflow_dispatch` 触发时可勾选 `full-bench` 输入运行 `make bench-full`。比较报告写入 `artifacts/perf/comparison.md`，原始结果、环境和样本 manifest 同时复制到 `artifacts/perf/` 随 CI 归档。每次运行先清理旧结果，避免混入上次 full 数据。轻量步骤上限 4 分钟；完整步骤上限 8 分钟（已含 light，不重复执行），保留原有测试和产物上传步骤，job 总超时仍为 30 分钟。

## 样本

`scripts/perf/generate-samples.mjs` 用固定种子（mulberry32，seed 0x1C0DE）确定性生成三类样本，内容混合中文段落、英文长段落、ATX/Setext 标题、围栏代码块（``` 与 ~~~）、有序/无序列表、引用块与行内格式；规模见 `baseline.json` 的 `samples`（含 sha256，用于确认内容未漂移）：

| 样本 | 字节 | 行数 | 说明 |
| --- | --- | --- | --- |
| small | ~12 KB | ~320 行 | 常规文档 |
| medium | ~150 KB | ~3.8k 行 | 大型笔记 |
| large | ~1 MB | ~24.6k 行 | 压力文档 |
| large-crlf | ~1 MB | 同上 | large 的 CRLF 版，强制源码模式，用于桥接往返基准 |

样本不入库，按需生成；生成脚本版本变化时必须重新采集基线。

## 指标

编辑器层（`editor/test/perf/editor.perf.ts`，node 环境、单 worker、无 DOM；确定性采样：预热后取 N 个样本的中位数，附变异系数 cv）：

| 指标 | 含义 | light 采样数 |
| --- | --- | --- |
| `editor.parse/{size}` | `parseMarkdown` 全量（markdown-it 令牌化 + fence 闭合注记 + doc.check） | 1 预热 + 5 样本（small 批量 ×5） |
| `editor.serialize/{size}` | `serializeMarkdown` 全量 | 同上 |
| `editor.state-create/{size}` | `createInkoraEditorState`（插件装配，预解析文档） | 1 + 5 |
| `editor.input-typing/{size}` | 每笔输入事务（insertText + dispatch + 脏检查 doc.eq + 状态发布），200 笔/样本 | 1 + 9 |
| `editor.snapshot-serialize/{size}` | 脏文档快照序列化（保存路径的 JS 侧全量成本） | 1 + 5 |

原生层（`tests/InkoraTests/PerformanceBaselineTests.swift`，hostless，`INKORA_PERF=1` 才启用，平时 `make test-native` 自动跳过）：`native.document-open/{size}`（`InkoraDocument(contentsOf:)` 文件读 + UTF-8 解码 + BOM 策略）、`native.document-save/{size}`（编码 + 原子写盘）、`native.document-memory/large`（加载后 resident 增量，mach_task_basic_info）。`testXCTClockAndMemoryMetricsForLargeDocumentOpen` / `testXCTClockMetricForLargeDocumentSave` 额外用 `XCTClockMetric`/`XCTMemoryMetric` 把 XCTMetric 结果写进 xcresult（`artifacts/test-results/native-perf.xcresult`）。

WKWebView 层（full profile，`tests/InkoraTests/PerformanceWebViewTests.swift`，hostless 离屏 webview）：`webview-load/{medium,large}`（资源 scheme handler + bridge 握手 + markdown 解析 + ProseMirror 挂载，到 `#editor` 出现；1 次预热吸收 WebContent 进程启动 + 3 样本）、`webview.bridge-snapshot-roundtrip/large`（源码模式 1MB 快照经 WKScriptMessage 往返；2 预热 + 9 样本）。

启动层（`tests/InkoraUITests/PerformanceBaselineUITests.swift`，仅 bench-full）：`launch/first`（首次启动墙钟）、`launch/warm`（后续启动中位数）、`launch/peak-physical-memory`（Inkora XCTest App physical memory peak 中位数，单位为十进制 MB；不含由系统托管的 WebKit 服务）；`XCTApplicationLaunchMetric` 与 `XCTMemoryMetric(application:)` 结果进 xcresult。启动 JSON 通过 XCTest attachment 保存，再由外层脚本导出；不要求测试沙盒执行 ps 或写仓库目录。

## 阈值与回归策略

- 默认阈值 `+20%`（相对基线），存于 `baseline.json` 的 `threshold.relative`，可调。
- `make bench` / CI 默认**仅警告**：报告中标 `REGRESSION`，不失败。
- `INKORA_PERF_STRICT=1 make bench`（或 `scripts/perf/compare-baseline.mjs --fail`）时，任何超过阈值的指标让命令以非零退出。
- 比较脚本对 cv > 0.25 的指标输出噪声警告；短耗时指标（`parse/small`、`input-typing/*`、`document-memory`）天然噪声大，判断回归时应结合多次运行。
- 基线中每个指标标注了所属 profile（light/full）；未测量的 profile 对应指标自动跳过比较；已测 profile 缺失指标、非法数值或单位不匹配在严格模式下失败。样本 SHA 不匹配会警告，严格模式下失败。环境差异单独警告，不能直接归因为代码回归。
- 更新基线：在安静机器上运行 `make bench`（及需要的 `make bench-full`），把 `build/perf-results/*.json` 中对应指标的 `value`（保留 cv）回填进 `baseline.json`，并在 commit message 中注明机器与环境。

## 当前基线数据（2026-11-08，Apple M6 / Mac18,5，macOS 27.2，Xcode 27.2）

| 指标 | 基线 | cv | 指标 | 基线 | cv |
| --- | --- | --- | --- | --- | --- |
| editor.parse/small | 0.24 ms | 0.34 | editor.input-typing/medium | 0.004 ms | 0.45 |
| editor.parse/medium | 2.48 ms | 0.18 | editor.input-typing/large | 0.016 ms | 0.27 |
| editor.parse/large | 13.5 ms | 0.16 | editor.snapshot-serialize/medium | 16.3 ms | 0.04 |
| editor.serialize/small | 0.12 ms | 0.53 | editor.snapshot-serialize/large | 794 ms | 0.34 |
| editor.serialize/medium | 14.9 ms | 0.04 | native.document-open/small | 0.21 ms | 0.11 |
| editor.serialize/large | 674 ms | 0.09 | native.document-open/medium | 0.27 ms | 0.11 |
| editor.state-create/medium | 0.14 ms | 0.30 | native.document-open/large | 0.63 ms | 0.08 |
| editor.state-create/large | 0.81 ms | 0.06 | native.document-save/medium | 0.20 ms | 0.25 |
| webview.webview-load/medium | 110 ms | 0.02 | native.document-save/large | 0.33 ms | 0.32 |
| webview.webview-load/large | 386 ms | 0.01 | native.document-memory/large | 1.0 MB | 0.77 |
| webview.bridge-snapshot-roundtrip/large | 4.5 ms | 0.02 | launch/first | 1533.94 ms | — |

启动暖启中位数 `launch/warm` 为 **1461.59 ms**（cv=0.0078）；App `launch/peak-physical-memory` 为 **17.84 MB**（cv=0，十进制 MB）。三项来自 [CI 42415763301](https://github.com/huruizhi/Inkora/actions/runs/42415763301) 的成功 XCTest 和附件；该 run 的后处理因 identifier 匹配错误失败，修正后已从下载的 xcresult 完整提取。

## WKWebView 与序列化热点初步分析（只测量与记录，不做优化）

按上述基线数据，各路径成本排序与初步归因：

1. **序列化是编辑器层最重热点**：`serialize/large`（~670 ms）约为 `parse/large`（~13 ms）的 50 倍。`prosemirror-markdown` 的 `MarkdownSerializer` 对整棵文档树递归渲染，逐节点拼接字符串；`markdown-codec.ts` 中 `safeFence` 对每个代码块再做一次 `matchAll` 正则扫描，`renderHeading`（setext）需要 `node.textContent.length`。保存/快照路径（`snapshot-serialize/large` ≈ `serialize/large`）每次都全量序列化，说明 Node 测量中该工作量约需 0.7 s；真实 WebKit 主线程延迟仍需单独测量。后续优化候选：脏子树增量序列化、按块缓存序列化结果、`safeFence` 仅在代码块内容变化时重扫。
2. **输入事务本身便宜**：`input-typing/large` ≈ 0.02 ms/笔（含 dispatch、`previousDocument.eq` 脏检查、状态发布）。ProseMirror 结构共享让 `doc.eq` 在未变化子树上走引用相等短路，输入路径不构成瓶颈；瓶颈在输入触发后的快照/保存序列化。
3. **WKWebView 载入主导文档打开的可见延迟**：`webview-load/large` ≈ 386 ms，其中编辑器层解析仅 ~13 ms、状态装配 ~1 ms，剩余为 WebKit 资源加载、bridge 握手与 ProseMirror DOM 挂载。载入大文档时载入路径中解析以外的成本约为 Node 解析成本的 25 倍以上（不同运行环境，仅作定位线索），是「打开大文档慢」的主要来源。
4. **桥接通道可控**：1 MB 文本快照经 JSON 编解码 + WKScriptMessage 往返仅 ~4.5 ms，说明 Bridge 协议本身不是大文档瓶颈；保存慢来自 JS 侧序列化而非消息通道。
5. **原生文件层不是瓶颈**：打开（读 + UTF-8 解码 + BOM 策略）与保存（编码 + 原子写）都在 1 ms 以内（页面缓存暖）。注意：基线测量的是暖缓存路径，冷盘首次读未覆盖。
6. **内存**：1 MB 文档在原生侧 resident 增量约 1 MB（基本等于文本存储）；编辑器 JS/WebContent 进程的文档内存未单独测量，`launch/peak-physical-memory` 也仅覆盖 App 主进程，后续需补充能正确归属 WebKit 服务的内存测量。

## 已知局限

- 基线来自单台机器（Apple M6）；跨机器比较无意义，换机器必须重采基线。
- CI 与本地共机时，并发任务会放大短指标噪声；判断回归优先看长耗时指标与多次运行中位数。
- 编辑器层基准在 node（非真实 WKWebView JIT 环境）中测量 parse/serialize，绝对值偏保守，用于回归趋势而非用户可感延迟。
- `document-open` 未覆盖冷页缓存；`launch/first` 也不是严格意义的冷启动（系统缓存仍在），仅首次启动近似。
- 内存指标（`document-memory`、`launch/peak-physical-memory`）受分配器与系统状态影响，cv 高，仅作量级参考。

## 原文权威生产路径补测（INK-M1-078，2026-11-09）

上述2026-11-08的 `editor.input-typing` 仍调用旧 `InkoraEditorSession`、语义 dirty 与 serializer。保留其有效历史控制，但其“每笔约0.02ms、瓶颈仅在保存序列化”的结论**不能外推当前生产内核**。当前 runtime 每次保存资格/定位会建立原文账本；应分别测量当前路径。

额外入口不改变默认 CI 或旧基线：

- `make bench-production-model`：Node中的公共SourceAuthoritySession，旧small/medium/large/large-crlf加新`production-mixed.md`。每输入独立子进程、60秒整组采集上限（不是编辑响应预算），1次预热+5次样本；原始值、median/p95/CV、输入/生产源码hash写入`build/production-perf/summary.json`及各输入JSON/log。超时终止本进程组、继续其余输入，最终非零；不删除慢样本或继承旧结果。`INKORA_PRODUCTION_PERF_SIZES=small,mixed`仅是显式子集冒烟。
- `make bench-production-webview PRODUCTION_WK_SIZES=small,medium`：hostless离屏WK，实际生产DOM/源码按钮/Bridge。每输入1次预热+3次工作流；每工作流另测5个快照。结果含原始样本、输入与实际离线bundle各文件SHA，位于`build/production-perf/webview.json`和`artifacts/test-results/production-perf.xcresult`。不打开App/窗口/XCUITest，不是可见paint或物理IME；少量样本的p95只是顺序统计值，不是尾延迟保证。

固定产品起点`a58b8ba`（含图片组合、未含后到的075），M6/32GB/macOS27.2/Node26.13.0/Xcode27.2。完整原始资料见[078证据目录](evidence/INK-M1-078/)。该候选的结果不能冒充后来main、最低macOS或完整功能验收。

| 测量边界 | small中位数 | medium中位数 |
| --- | --- | --- |
| Node可审计打开（parse+PM+账本资格） | 4.76ms | 153.38ms |
| Node选区定位+单字事务+保存资格 | 21.76ms | 626.51ms |
| Node保存资格+原文读取 | 3.51ms | 135.89ms |
| 离屏WK打开到精确快照回执 | 125.83ms | 719.94ms |
| 离屏WK普通单字输入到精确快照回执 | 50.71ms | 974.75ms |
| 离屏WK快照往返 | 6.37ms | 123.70ms |
| 离屏WK源码no-op往返+快照 | 71.90ms | 1771.77ms |

Node的large及large-crlf均未在60秒整组采集上限内完成，完整命令因此非零；不是通过或被取消支持。旧WK大文档专项的“CRLF自动源码模式”假设已修正为实际源码按钮/input/apply；保留全原文相等断言，修正后1/1通过，但该候选1MB源码快照中位数约4234.69ms（旧输出仅median/CV，不据此声称p95）。正式预算尚未冻结，不能称体验达标。

实际V8 CPU profile的主要self样本在`buildSourceLedger`的owner组装及每owner全表扫描，另有重复token/range扫描；保存资格重复建账本放大此成本。此为定位线索，不是已优化或最坏复杂度证明。后续必须在接回075/图片最终候选后，以同字节、同工作流复测；缓存/索引不得绕过source/doc/anchor/owner证明、跨文档身份或安全拒绝。

Native写盘、真实屏幕绘制、系统composition/候选响应、最低系统与支持范围仍按性能票15补齐；hostless输入是JS execCommand普通输入，不当作实体键盘中文证据。源码保存点的Node时间也不等于NSDocument安全写盘时间。未运行`bench-full`或App启动测量。
