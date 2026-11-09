# INK-PROT-040：现有图片宿主剩余真实实现接缝修复

- 任务分支：`task/INK-PROT-040-asset-handler-validation`
- 基线：`56b5d318653cf5666db63a6d372c67848849ab7d`（037 后）
- 范围：仅 `prototypes/local-assets/native-host`；不新建原型，不改 `Host/main.swift`、`BookmarkStore.swift`、037 冻结 runtime 证据、entitlements、资源 HTML、依赖或其他原型。

## 完成内容

### A. 中间组件 symlink ENOTDIR 误分类（035 [高] 项）

**排序假设与实际证据**：假设为 macOS 上 `openat(O_DIRECTORY|O_NOFOLLOW)` 对 symlink 中间组件返回 ENOTDIR 而非 ELOOP。用真实 `Support.swift` + 临时文件的红例 CLI（`.build/red-a`，未提交）先行复现：

```text
PASS regular-read: read-ok
FAIL component-symlink: status=io-error errno=20   ← 红
PASS plain-file-component: status=io-error errno=20
PASS final-symlink: errno=62
```

关键观察：普通非目录中间组件与 symlink 中间组件 errno 完全相同（ENOTDIR 20），errno 本身不可能区分，必须用元数据证据。

**修复**（`Sources/Host/Support.swift`）：`openat` 中间组件失败且 errno==ENOTDIR 时，以 `fstatat(dirFD, component, AT_SYMLINK_NOFOLLOW)` 只读目录项元数据；`S_IFLNK` 才分类 `.symlink`，errnoValue 保留原 ENOTDIR(20)，detail 前缀 `open-component:symlink`。fstatat 失败按非 symlink 回退原 `readFailure` 分类。不跟随链接、不扩大权限（AT_SYMLINK_NOFOLLOW 只读目录项）。修复后红例 4/4 PASS（普通非目录组件仍 io-error，未误标）。

### B. 真实 AssetSchemeHandler/ResourceBroker 非 UI 接缝（035 [中] 项）

**先证结构事实**：`grep -rn CallbackGate` 仅 `ModelCheck/main.swift` 与 `Shared/BrokerPolicy.swift` 命中——16 项模型断言的取消语义与真实 handler 零关联（035 判断成立）。

**接缝提取**（`Sources/Host/SchemeHandlers.swift` 重写）：
- `AssetSchemeTaskCore`：真实 start/stop 状态机（active/canceled + 串行状态队列）唯一实现；WK 适配器 `AssetSchemeHandler.webView(start/stop:)` 与 handler-check 的 fake outlet 调用同一路径。
- `AssetTaskOutlet` 协议：仅抽象系统 `WKURLSchemeTask` 出口；生产 `WKSchemeTaskOutlet` 直接转发，identity 绑定底层系统 task 对象。
- `TaskDeliverySeam`：默认 `MainTaskDelivery` 保持原主队列交付（main.async / 非 main 线程 main.sync），测试注入 `HeldDelivery` 受控串行交付。
- `ResourceBroker`：`ReadScheduling` 调度接缝（默认即真实并发工作队列），测试注入 `GatedScheduling` 驻停/放行真实读取；`EventLog(recording:)` 内存记录接缝 + `synchronize()`；`currentScopeCount` 对称性观测。
- broker 状态机、generation 轮换、逐组件 descriptor 读取、SHA/MIME 校验全部真实；不实例化 WKWebView/App/NSApplication，无长 sleep。

**红例B（先红后修）**：对提取后的真实状态机跑 handler-check，43/44 通过，唯一失败：

```text
FAIL s4-late-stop-leaves-no-identity-residue []
```

即真实缺陷：任务完成后晚到的 `stop` 无条件 `canceled.insert(identifier)`，已完成 identity 残留；系统 task 对象地址复用后，同 identity 新任务被 `canceled.contains` 永久误抑制。修复（`SchemeHandlers.swift` stop）：仅当 `active.remove(identifier) != nil`（任务仍 active）才插入 canceled。修复后 46/46 通过。

**035 担心的“回调在 broker state.sync 内重入死锁”**：在途 epoch/revoke 场景（S5/S6）实际执行 `deliver → state.sync { completion(output) }` 完整嵌套路径，未死锁——completion 只异步入队交付队列，从不同步重入 broker 状态队列。未复现，保留原实现未改。

**46 项断言覆盖矩阵**（`Sources/HandlerCheck/main.swift`，S1–S11）：

| 场景 | 断言要点 |
| --- | --- |
| S1 成功路径 | 单次 response/data/finish 序列、真实数据、lease 读中持有（count=1）读后释放（count=0、scope-stop 在读后） |
| S2 stop 先于读取完成 | 零任务回调、wk-callback-suppressed、cancel 后无 wk-complete、lease 仍对称释放 |
| S3 竞争一：completion 已入队未执行时 stop | 抑制回调；抑制路径 identity 清理（复用地址新任务正常完成） |
| S4 竞争二：完成先交付后晚到 stop | 无二次终态；无 identity 残留（红例→修复） |
| S5 在途 epoch 轮换 | generation 拒绝、单次 409、无数据、native-read-stale/wk-stale-document-rejected、lease 释放 |
| S6 在途 revoke | 单次 409、lease 对称释放 |
| S7 revoke 后新请求 | 同步失败路径单次 409 |
| S8 未知 token | 单次终态 |
| S9 SHA 不匹配 | 真实读取后内容拒绝、单次 403、无数据 |
| S10 非法 URL/token | 立即 400、不入 active、不触发 broker 读取 |
| S11 两并发任务 | 各自恰好一次终态、互不串扰 |

稳定性：handler-check 连续 5 次运行全绿（无随机时序依赖；scope-stop 用有界 drain 等待必然事件）。

## 修改文件

- `prototypes/local-assets/native-host/Sources/Host/Support.swift`：symlink 元数据分类 + `isSymlinkEntry` + `EventLog` 内存记录接缝/`synchronize()`
- `prototypes/local-assets/native-host/Sources/Host/SchemeHandlers.swift`：提取 `AssetSchemeTaskCore`/`AssetTaskOutlet`/`WKSchemeTaskOutlet`/`TaskDeliverySeam`/`MainTaskDelivery`；stop 条件插入修复
- `prototypes/local-assets/native-host/Sources/Host/ResourceBroker.swift`：`ReadScheduling` 接缝（默认真实队列）、`currentScopeCount`
- `prototypes/local-assets/native-host/Sources/HandlerCheck/main.swift`：新增 46 项真实接缝 CLI
- `prototypes/local-assets/native-host/Makefile`：`handler-check` 构建目标与入口，`build`/`check` 纳入
- `prototypes/local-assets/native-host/README.md`、`DIAGNOSTICS.md`：分层说明、errno 语义、计数统一（model 16 + handler 46）
- `docs/tasks/INK-PROT-040.md`：本报告

`ModelCheck/main.swift` 与 `Shared/BrokerPolicy.swift` 未改（16 项纯模型断言保留有效旧测试；CallbackGate 仍仅服务模型层，README 已明确分层，不删除）。

## 命令与结果

```sh
make -C prototypes/local-assets/native-host build   # rc=0，四个目标全部编译，签名严格验证通过
make -C prototypes/local-assets/native-host check    # rc=0：MODEL CHECK PASSED: 16 assertions
                                                     #        HANDLER CHECK PASSED: 46 assertions
                                                     #        verify ok（签名/entitlements/14.0/资源SHA/CSP/离线规则）
make -C prototypes/local-assets/native-host verify   # rc=0
make -C prototypes/local-assets/native-host handler-check  # rc=0（×5 稳定）
```

按任务要求未运行 `run`/`fixture prepare`（避免并行会话覆盖 locator）。红例 scratch（`.build/red-a*`、`.build/s11*`）与 `/tmp/ink-prot-040-*` 已清理；`.build/` 在 gitignore 内，worktree 干净。

## 未完成事项与风险

- handler-check 为纯 CLI 非沙盒执行：`scope-start active=true` 是进程外 no-op，只作 lease 对称断言，不是 OS 授权证据；WKWebView/面板/书签真实运行仍以 037 冻结证据与管理者 UI 验收为准。
- identity 键仍为 ObjectIdentifier：“旧回调在途 + 地址复用 + 新任务同址启动”三者同时发生时的语义歧义未消除（需 token 键控重设计，超出本任务边界）；本次仅修复已完成任务的残留路径，已在 README 声明。
- 铁律级声明：父票 14 / M0 / M1 / 首阶段不因本任务完成；本任务仅为候选，等管理者独立复核。
