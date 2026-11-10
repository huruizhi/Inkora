# INK-PERF-151：当前生产路径分层测量

起点 clean `f09143d`，产品与 `main@aef514c` 相同。先阅读 AGENTS、GLOSSARY、全部 ADR、当前写作预算契约及 078/079/085。本任务不优化产品。

## 已运行基线

- `make bench-production-model` exit 0，五向量，各 1 预热 + 5 采样。
- `make bench-production-webview` exit 0，xcresult 1 passed / 0 failed / 0 skipped，四尺寸，各 1 预热 + 3 工作流，每工作流 5 snapshots。

| 普通输入中位数 ms | medium 150510 bytes | large 1000064 bytes | large-crlf 1024664 bytes |
| --- | ---: | ---: | ---: |
| Node select+input | 62.075 | 684.651 | 665.720 |
| WK input→精确快照 | 109.93 | 834.37 | 832.60 |

这些本机中位数在方向性 200ms/1s 对照内；不冻结正式预算。Node 与 WK 计时边界不同；N=5/3 的 p95 为小样本最大顺序值，不是尾延迟保证。首次 open 与暖输入分开记录，非 paint/物理 IME。

## 新增保存探针与真实红例

仅修改允许的测试支持与 WK 文件，并新增 opt-in 脚本。mixed 使用与 Node 相同的 530-byte fixture，不替换旧四尺寸。临时目录内每轮使用独立文件 URL 从原始字节建立文档，真实 attachSidebarEditor snapshot provider、图片准备、冲突保护、NSDocument 保存与默认 AtomicDocumentDataWriter 均不绕过。

拟记录 snapshot 既有层、save 调用至 NSDocument completion 层、completion 后快照/dirty/精确磁盘字节验证层。不能单独分解原子 writer 内耗时，当前没有可在已加载文档上注入 writer observer 的现成接口，不能把总体保存时间标成纯原子写盘。

` scripts/perf/run-safe-save-151.sh ` 首次 exit 65；xcresult 0 passed / 1 failed，错误 `InvalidTransition idle→failed(deinit)`。原日志与 summary 见证据目录，原 xcresult 留在 ignored artifacts。首次尚无完整安全保存结果。没有删除失败或断言；已向根代理发送实际红例及以下可证伪假设，获准阶段 probe 与定向 small：

1. attachSidebarEditor 在握手前配置 provider 影响 Bridge 生命周期。
2. completion 后 controller/WebView 生命周期早于 markSaved 回执。
3. 首次 save 的 file state/图片准备拒绝被 deinit 错误覆盖。
4. close 时存在尚未完成的回调。

## 证据与边界

[原始证据](../evidence/INK-PERF-151/) 保留源码 SHA、bundle SHA、输入 SHA、环境、原始分布与构建/探针日志。环境 M6 / 32GB / arm64 / macOS27.2 / Xcode27.2 / Node26.13.0。未安装依赖，仅临时借用主仓工具与 node_modules。未启动 App、窗口、面板、CUA、XCUITest、bench-full、物理 IME/macOS14，不访问用户文档或正式 App。

## 红例定位

复用同一路径的 small 阶段 probe 重现 exit65；前两轮 completion=nil，第三轮 completion 为 NSCocoaErrorDomain 3072（操作已取消），阶段日志保留。单变量改成每 iteration 独立 scratch URL 后 small exit0，四轮 completion 均 nil，原 dirty/字节断言全部保留通过。这支持 harness 自己重置仍受前轮文件协调影响的路径产生竞争；不宣称修复产品 bug，无法从此确定首个 deinit 错误的 WebKit 内部来源。阶段 probe 已从最终测试移除，保留在证据源码副本。

## 最终独立补测结果

`scripts/perf/run-safe-save-151.sh` 五输入完整执行 exit0；xcresult 1 passed / 0 failed。每输入 1 预热 + 3 工作流，snapshot 每工作流 5 次；所有原文、revision、dirty 和精确 UTF-8 磁盘字节断言通过。下列均为本机中位数 ms：

| 输入 | WK输入→snapshot | snapshot roundtrip | save→completion | save→精确验证 |
| --- | ---: | ---: | ---: | ---: |
| small | 13.282 | 1.994 | 112.800 | 118.752 |
| medium | 108.205 | 18.940 | 199.125 | 240.868 |
| large | 851.784 | 152.637 | 672.340 | 912.260 |
| large-crlf | 836.150 | 156.096 | 680.338 | 930.467 |
| mixed | 5.917 | 0.353 | 113.773 | 114.868 |

保存 completion 的计时起点在 `document.save` 调用前，包含真实 provider 请求、prepare/冲突校验、NSDocument 与默认 atomic writer；结束在 completion 回调恢复后。verified 计时继续包含随后 Bridge snapshot（在 markSaved 命令之后）、native dirty=false、revision 不变与磁盘 Data 精确相等。没有将独立 snapshot 时间从 save 时间相减冒充 Native 或写盘净耗时。mixed 补测只是 530 bytes 的功能混排，不是 150KB 混排容量证明。

此次没有单独冻结保存预算；150KB <200ms / 1MB <1s 的方向性对照指普通输入，不自动套到 save→verified。保存路径的 completion 分布仍有 NSDocument/文件协调波动，原始全样本、p95/CV 均保留。未做性能优化，不复跑全量/lint/release/CI。

实际定向检查：`xcrun swift-format lint --strict tests/InkoraTests/PerformanceWebViewTests.swift tests/InkoraTests/PerfTestSupport.swift`、`git diff --check` 均 exit0。Native 必要构建随两个 WK 命令实际完成；未运行全 Native、全 editor、全 lint。未完成：纯 atomic writer 内部分层、正式最低系统/paint/IME/授权场景、正式体验预算；它们不被本次 hostless 结果替代。

## runner 结果隔离补正

根复核发现 PerfRecorder merge 配合固定输出名会把前次 full 的未覆盖尺寸混入后续 subset。新增 `scripts/perf/test-safe-save-151-runner.sh`：在隔离临时目录复制真实 runner 与 mixed fixture，以 PATH stub xcodebuild 检查启动前 canonical 不存在、prior 精确保留、sizes/TEST_RUNNER 环境一致。没有启动 Xcode 或 GUI。

- 修复前真实 probe exit91：`RED: stale canonical output`，日志 `runner-isolation-red.log`。
- 修复后 probe exit0：成功 subset 与模拟 xcodebuild exit23 的失败分支均通过；失败分支 canonical 不存在，prior 保留。
- runner 在准备输入/启动 Xcode 前，将已有 canonical 移到独立 `build/production-perf/prior-safe-save-151.XXXXXX/safe-save-151.json`。不删除旧分布或 xcresult。
- 原有效 full 五输入数据保持不变，无需重测。完整 1723658-byte ignored inventory 原件复制到 `artifacts/perf-151/ignored-artifact-inventory-full.json`，tracked inventory 改为目录/xcresult 级数量与字节摘要，包含原件 SHA 与路径；旧提交也保留原件。

本补正只涉及自身 runner、同域 shell probe、证据与此记录，无产品或测试指标变更。
