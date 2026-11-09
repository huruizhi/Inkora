# INK-PROT-021 本地资源进程重启恢复原型

父票：INK-PLAN-005 `typora-parity/issues/14-local-assets-platform-prototype.md`（完整范围仍保留，**本目录只完成第一部分**，14 未关闭）。
修正基线：`256c30edbfa9230b93b793e9780bd1923350328a`（延续 INK-PROT-011 第一部分）。原型代码，不含任何生产修改；无新增依赖（仅系统 Swift/Foundation/CryptoKit）；不访问用户真实内容、不联网、不启动 GUI/面板/拖放/剪贴板/IME。

本轮固定起点为 `a60b7b9a513f5949e83aa25ef9b2c99dfa7986e2`。保留 INK-PROT-013 的 14 个普通 scratch 场景与签名 Sandbox 探针，另加独立 `persistent-recovery` CLI 和 `make restart-check`。本轮只回答：真实 worker 进程在明确检查点被 `SIGKILL` 后，全新进程能否仅凭磁盘记录保守重建未保存草稿并审计发布状态。结论与进程 PID、signal、阶段、SHA 见 [`RESTART-RECOVERY-EVIDENCE.md`](RESTART-RECOVERY-EVIDENCE.md) 和 `evidence/restart-recovery-results.json`。

## INK-PROT-021 持久协议

每个会话位于测试根的 `recovery/<session-uuid>/`，只接受规范 UUID 目录：

- `manifest.json`：schema v1；session/operation UUID；操作类型；原始 Markdown **准确字节**（JSON Data/base64）及 SHA256；来源/目标相对路径和基线 SHA；资源草稿/来源/目标关联、实际唯一名、SHA、字节数、所有权与发布状态；dirty/saved/checkpoint。
- `events.jsonl`：schema v1 append-only 事件。相关副作用前追加并 `fsync` intent，副作用后追加并 `fsync` confirmed/blocked；sequence、UUID、phase、相对路径、SHA、所有权均校验。
- manifest 更新写同目录临时文件，文件 `fsync` 后 `rename` 替换，再对父目录 `fsync`。资源/Markdown 也在写入文件并 `fsync` 后 rename，并尝试 `fsync` 父目录。该做法是本机**进程中断**证据，不等同断电、控制器缓存或硬件耐久保证。

恢复命令 `persistent-recovery audit <root>` 是只读入口：拒绝未知 schema、截断/非法事件、非 UUID 会话、`..`/绝对路径、会话目录以及 `manifest.json`/`events.jsonl` 最终组件的符号链接、字段枚举之外的值；从 manifest 的 Markdown 字节和仍存在的草稿资源重建逻辑上的独立未保存草稿。它不自动覆写目标、不重试 commit、不删除 staging、已发布孤儿、同字节复用资源或其它会话资源。记录损坏时只拒绝该会话并保留整个目录。

审计还会把 manifest 与完整事件状态机交叉验证：confirmed/blocked 必须消费对应 intent；事件中的路径和 SHA 必须属于 manifest 计划；每个 checkpoint 只接受协议可能产生的事件前缀；最后一个未确认 intent 是合法中断前缀，不会被误报为损坏。`saved=true` 只有在资源发布、Markdown commit、final-confirm 事件与 checkpoint 全部一致时才可形成“历史已确认”事实，单独篡改布尔位只能得到 `record-inconsistent`。

文件观察通过 POSIX `lstat` + `open(O_NOFOLLOW)` + `read` 区分 `present`、`missing`、`unreadable`、`invalid-path`、`symlink`，不再把拒读/非法路径与不存在都折成 nil。若目标字节等于计划 Markdown、但缺少最终确认，状态只能是 `observed-bytes-match-completion-unknown`（“已观察目标字节符合计划，但最终完成状态未知”）；不会凭 hash 相同补写 saved。来源/目标被外部修改或草稿资源丢失时同样保守保留并提示。

历史完成与当前完整性分开报告：`historicallyConfirmed=true` 只表示磁盘事件曾完整确认；若当前目标随后被修改、删除或拒读，分别报告 `external-target-change`、`target-missing-after-confirm`、`target-observation-unknown`，当前恢复资格仍为 `saved=false`、`dirty=true`，且不会自动覆盖。

资源发布与 Markdown rename 仍不是多文件原子事务；中断可留下已发布孤儿，但可由磁盘记录逐项审计。只有最终确认 manifest 持久化后才 `saved=true` / `dirty=false`。

## 范围与交付

回答的问题：本地图片政策（06 票已决）在真实文件系统与真实 App Sandbox 下，**状态模型与故障恢复边界**是否成立。分两层证据，严格区分、分别判定：

| 层 | 进程形态 | 判定 | 证据文件 |
| --- | --- | --- | --- |
| L1 纯模型 + 普通 scratch 文件系统 | 非沙盒 CLI（`.build/local-assets-model`），全部写入唯一 mktemp 临时目录 | 任一场景失败 → 整体 rc=1 | `evidence/model-results.json` |
| L2 真正签名 Sandbox 进程 | ad-hoc 签名 + 仅 `com.apple.security.app-sandbox` entitlement 的 headless .app（bundleID `com.huruizhi.Inkora.AssetPrototype`，部署目标 macOS 14） | 见下“L2 判定规则”；失败 rc=2、未激活 rc=3 | `evidence/probe-results.json`、`invalid-runid-*.json` |

非沙盒对照读取（同一 posix-read 语义）记录在 `evidence/contrast-read.json`，其 SHA 必须与控制脚本 fixture 一致，仅用于**区分**沙盒内行为，不作为授权证据。汇总见 `evidence/summary.json`（含基线 git SHA、二进制 SHA256、分层状态与原因）。

### L1 场景矩阵（S1–S14，关键失败场景含初始/最终字节 SHA 与 journal 记录）

| 场景 | 断言 |
| --- | --- |
| S1 未命名草稿 | 导入图片复制进独立恢复会话；`dirty=true`、未 `markSaved` |
| S2 全部发布后 Markdown 提交失败（真实注入：目标路径被目录占用） | 不 `markSaved`；旧目标不被替换；已发布资源按孤儿保留并记录；只删独占 staging；草稿与无关文件 SHA 不变 |
| S3 首次保存成功 | `<文档名>.assets/` 与 Markdown 同目录；中文/空格/百分号相对引用可解析且字节 SHA 一致；此后才 `markSaved` |
| S4 Save As | 新 Markdown 与原 Markdown **逐字节相同**（含引用式定义）；托管资源按**原目录名**复制到新位置；原文件不删、SHA 不变 |
| S5 目标冲突 | 同名同字节复用（journal 记 `reused-no-ownership`，失败回滚不删它）；异内容拒绝且不覆盖 |
| S6 校验中止所有权边界 | 目标目录含**不可读文档**与**引用式图片**时，冲突校验中止仍不删任何预置文件/文档；资源尚未 staging/publish |
| S7 取消保存 | 草稿会话与导入文件不删 |
| S8 解析边界 | 中文/空格/百分号通过；`..`、绝对路径、符号链接逐组件拒绝（最小反例记录于 detail） |
| S9 显式放弃 | 仅显式 abandon 删除会话自有目录 |
| S10 同名导入唯一化 | 两张同名不同字节图片分别获得 `dup.png`/`dup-1.png` 并都保存成功、引用各自字节；含路径的 preferredName 被拒绝 |
| S11 第 2 张发布失败 | 悬空 symlink 占据最终路径（真实 FS 条件）；第 1 张按孤儿保留并记录；旧 Markdown、草稿、其它会话/文档资源 SHA 不变；只删未发布独占 staging |
| S12 资源全发布后 Markdown 失败 | 旧 Markdown 设 `uchg`（真实 EPERM 条件）；saveDraft/Save As 均保持旧 Markdown、来源、草稿、其它会话/文档资源逐字节不变；已发布孤儿保留并记录 |
| S13 并发发布边界 | `beforePublish` 是明确标注的模拟并发缝：同字节并发出现可无所有权复用；异字节并发出现不覆盖，失败且保留已发布孤儿 |
| S14 Save As 未托管相对图片 | 源有/目标缺失则阻止；目标异字节则不覆盖且阻止；目标同字节则无所有权复用并保持 Markdown 引用字节；仅图片使用的引用定义参与，普通链接/外链不混同 |

### 所有权边界：私有 staging + 发布，而非“扫描证明无引用”

多文件操作（复制 + 发布 + 写 Markdown）**不假称跨文件原子事务**。saveDraft/saveAs 顺序固定：

1. **prepare/validate（只读）**：校验来源、已有目标、Save As 引用分类；任何失败均不写目标；
2. **private staging**：以完整 UUID + POSIX 排他 `mkdir` 创建 `.inkora-save-<uuid>/` 或 `.inkora-saveas-<uuid>/`，复制后读回校验；只有排他创建成功才拥有清理权；
3. **publish all assets**：逐个 `copyItem` 到最终相对路径；exists 预检不当作排他。发布期同字节碰撞可复用但不取得所有权，异字节/不可读目标明确失败且不覆盖；
4. **atomic Markdown commit LAST**：全部资源发布成功后才原子写 Markdown；仅该步骤也成功才 `markSaved`。

失败处理刻意保守：

- 发布中途失败 → 旧 Markdown 未触碰；已发布最终资源不回删，journal 记 `kept-orphan-recorded`；仅删除本操作排他拥有的未发布 staging。
- Markdown 最后提交失败 → 旧 Markdown 逐字节不变；全部已发布资源作为孤儿保留并记录；草稿/来源/其它会话资源不删。
- **不**扫描其它 Markdown，也不依赖正则猜测“无引用”后删除任何最终资源；S6 的不可读文档与引用式图片是该保守边界的反例。
- 同名同字节复用不取得清理所有权（`reused-no-ownership`），任何回滚都不删它。

append-only journal 全量记录在 `evidence/model-results.json` 的 `journal` 数组，但它只存在于本进程内存。publish 与 Markdown commit 之间仍有 crash 窗口：重启后没有持久 journal 可恢复，本原型只明确该限制，不冒称跨重启恢复。

### L2 Sandbox 探针实测（本机 macOS 27.2，arm64）

- 探针以 ad-hoc 签名（`codesign --verify --strict` 通过）+ App Sandbox entitlement 直接 exec 运行，headless、无 GUI；每轮使用控制脚本生成的唯一 run ID。
- **容器确认后才写**：沙盒激活判定为 `NSHomeDirectory() == getpwuid 真实HOME + /Library/Containers/<bundleID>/Data`（环境 HOME 会被 secinit 同步改写，不能用作判定）；未激活时**不写任何 HOME 位置**，只报告。
- 容器内 fixture：run ID 先按 `8-4-4-4-12` 十六进制 UUID 严格校验，仅在预期容器内向 `probe-fixtures/<runID>/` 写入并读回；非法 run ID 只报告、不拼接写路径。另跑唯一非法值负例，断言未创建子目录。
- 未经授权外部临时 fixture（中文/空格/百分号名）：`open()` 返回 **EPERM(1) "Operation not permitted"** —— 真实 OS 层拒绝。

### L2 判定规则（`scripts/verdict.py`，含 9 个伪成功/未完成负例自测）

`make check` 先跑判定器自测（任一负例不按预期判定 → rc=4），再对真实证据判定。以下任一不满足即整体不通过：

- probe 与对照命令本身退出码为 0；
- `sandboxActive=true`（未激活 = `incomplete`，rc=3，**不算通过**）；
- 正例 `runIDValid=true`；非法 run ID 负例必须 `runIDValid=false`、`containerWrite.attempted=false` 且容器路径不存在；
- 容器写、容器读实际成功；
- 外部拒绝 errno ∈ {EPERM=1, EACCES=13}——**文件不存在（ENOENT 等）与无权限不得混淆**；
- 对照读取成功且 SHA256 == 控制脚本 fixture 的 SHA（证明外部文件确实存在且可读，拒绝不是“碰巧读不到”）；
- 沙盒自称激活但外部读取成功 = `sandbox-contradiction`，rc=2。

任一层失败/未完成都不会打印“CHECK PASSED”。

## 复现

```sh
cd prototypes/local-assets
make build   # swiftc -target arm64-apple-macos14.0；codesign 失败真实非零
make check   # 判定器自测 + L1 + L2 + 对照 + evidence/ 写入
             # rc: 0 通过 / 1 L1 失败 / 2 L2 证据失败 / 3 沙盒未激活 / 4 自测失败
make restart-check # 8 个真实 SIGKILL 窗口 + 17 个负例 + 1 个完整成功对照；非零即失败
make clean   # 只删本目录 .build/ 与 scratch/
```

- 完整 stdout/stderr 存入仓库级被忽略的 `artifacts/logs/ink-prot-011/`。
- 临时 scratch 仅限本次 mktemp 目录，退出即删；容器清理只删本轮 run ID 的 `probe-fixtures/<runID>/`，不碰其它运行/会话；**不尝试删除**系统管理的容器内容（`.com.apple.containermanagerd.metadata.plist` 受 SIP 保护）。
- 单独自测判定器：`python3 scripts/verdict.py --selftest`。

## 已知限制

- 行内图片引用解析为原型级正则（`![...](path)`，空格以百分号编码），另覆盖“被 `![...][id]` 实际用作图片”的引用定义 `[id]: path` 供 Save As 决策；普通链接与未用作图片的链接定义不参与。简写/折叠引用、HTML `<img>`、嵌套括号等形态未覆盖，不能宣称通用 Markdown parser 已完成。**回滚安全性不依赖该扫描**（排他 staging + 最终资源保守保留）。
- 符号链接逐组件检查可防逃逸，但不防硬链接（原型范围外）。
- L2 未在 macOS 14.0 真机执行；部署目标为 14 仅由 `-target arm64-apple-macos14.0` 声明，运行时实测为当前系统 27.2。
- S2 的 Markdown 提交失败用目录占位；S11 用悬空 symlink；S12 用 `uchg` immutable，均为真实文件系统条件。S13 的 `beforePublish` 仅是模拟并发时序缝，证据中明确标注，不能冒称 OS 主动制造并发。
- INK-PROT-013 的 `OwnershipJournal` 仍是进程内结构；本轮用独立原型验证了持久 per-session/per-operation 协议，没有把它接入生产模型或改写原 14 场景。

## 父票 14 剩余场景（本轮明确未做，需 UI 锁与 preflight）

1. NSOpenPanel 选 Markdown/图片/目录各自授权语义（文件授权不含邻接资源——研究票已给文档依据，待实测）。
2. 拖放与剪贴板导入的授权与数据形态（`NSFilePromiseReceiver`；粘贴板路径是否携带授权未查证）。
3. security-scoped bookmark 跨启动恢复、stale 与目录移动后的失效反馈。
4. 离线 WKWebView 资源 broker：文档隔离 scheme、`inkora-editor://` 映射、取消契约与并发加载。
5. 整目录迁移、单文件移动、缺失/无权限占位的实际 UI 流程。
6. 生产化规格：NSDocument/NSFileCoordinator 集成（本原型刻意不做）。

## INK-PROT-032 原生授权/WK 宿主入口

后续隔离宿主位于 [`native-host/`](native-host/README.md)：它补充真实签名 App 的 `NSOpenPanel`、security-scoped bookmark 跨启动与离线 WK 资源 broker 验证链。`make -C prototypes/local-assets/native-host check` 仅验证构建/签名和纯模型；实际 GUI 授权证据必须由管理者在解锁桌面后按该目录 README 持 UI 锁执行。本入口不表示父票 14、M0、M1 或正式图片功能已完成。

执行上述实验须按 `docs/testing.md` 使用 `scripts/ci/with-ui-lock.sh` 与 `ui-preflight.sh`，避免占用桌面。
