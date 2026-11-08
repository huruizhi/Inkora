# INK-PROT-011 本地资源平台原型（第一部分）

父票：INK-PLAN-005 `typora-parity/issues/14-local-assets-platform-prototype.md`（完整范围仍保留，**本目录只完成第一部分**，14 未关闭）。
基线：`36e636578798510d240b23520122c88578cf3fe5`。原型代码，不含任何生产修改；无新增依赖（仅系统 Swift/Foundation/CryptoKit）；不访问用户真实内容、不联网、不启动 GUI/面板/拖放/剪贴板/IME。

## 范围与交付

回答的问题：本地图片政策（06 票已决）在真实文件系统与真实 App Sandbox 下，**状态模型与故障恢复边界**是否成立。分两层证据，严格区分、分别判定：

| 层 | 进程形态 | 判定 | 证据文件 |
| --- | --- | --- | --- |
| L1 纯模型 + 普通 scratch 文件系统 | 非沙盒 CLI（`.build/local-assets-model`），全部写入唯一 mktemp 临时目录 | 任一场景失败 → 整体 rc=1 | `evidence/model-results.json` |
| L2 真正签名 Sandbox 进程 | ad-hoc 签名 + 仅 `com.apple.security.app-sandbox` entitlement 的 headless .app（bundleID `com.huruizhi.Inkora.AssetPrototype`，部署目标 macOS 14） | 见下“L2 判定规则”；失败 rc=2、未激活 rc=3 | `evidence/probe-results.json` |

非沙盒对照读取（同一 posix-read 语义）记录在 `evidence/contrast-read.json`，其 SHA 必须与控制脚本 fixture 一致，仅用于**区分**沙盒内行为，不作为授权证据。汇总见 `evidence/summary.json`（含基线 git SHA、二进制 SHA256、分层状态与原因）。

### L1 场景矩阵（S1–S10，均含初始/最终字节 SHA 与 journal 记录）

| 场景 | 断言 |
| --- | --- |
| S1 未命名草稿 | 导入图片复制进独立恢复会话；`dirty=true`、未 `markSaved` |
| S2 复制成功但 Markdown 写失败（真实注入：目标路径被目录占用） | 不 `markSaved`；只回滚私有 staging；托管目录从未收到未发布副本；草稿字节与无关文件 SHA 不变 |
| S3 首次保存成功 | `<文档名>.assets/` 与 Markdown 同目录；中文/空格/百分号相对引用可解析且字节 SHA 一致；此后才 `markSaved` |
| S4 Save As | 新 Markdown 与原 Markdown **逐字节相同**（含引用式定义）；托管资源按**原目录名**复制到新位置；原文件不删、SHA 不变 |
| S5 目标冲突 | 同名同字节复用（journal 记 `reused-no-ownership`，失败回滚不删它）；异内容拒绝且不覆盖 |
| S6 回滚所有权边界 | 目标目录含**不可读文档**与**引用式图片**时，回滚仍不删任何预置文件/文档；未发布副本从未进入托管目录 |
| S7 取消保存 | 草稿会话与导入文件不删 |
| S8 解析边界 | 中文/空格/百分号通过；`..`、绝对路径、符号链接逐组件拒绝（最小反例记录于 detail） |
| S9 显式放弃 | 仅显式 abandon 删除会话自有目录 |
| S10 同名导入唯一化 | 两张同名不同字节图片分别获得 `dup.png`/`dup-1.png` 并都保存成功、引用各自字节；含路径的 preferredName 被拒绝 |

### 所有权边界：私有 staging + 发布，而非“扫描证明无引用”

多文件操作（复制 + 写 Markdown + 发布）**不假称原子事务**。saveDraft/saveAs 三步：

1. **staging**：资源先复制到目标目录下私有目录 `.inkora-save(-as)-<op>/`（本操作独占，其余文档不可能引用其中路径），journal 记 `staged`；
2. 写 Markdown（原子写单文件）；
3. **发布**：staging → `<文档名>.assets/`，成功后 `committed` 并 `markSaved`。

失败处理刻意保守：

- Markdown 写失败 → 只删除私有 staging（`rolled-back-staging-deleted`）。**不**依赖对目标目录 Markdown 的可读性或语法全覆盖扫描来证明“无引用”——S6 用不可读文档（chmod 000）与引用式图片定义（`[id]: path`，行内正则不覆盖的形态）作为反例证明该保守性。
- 发布中途失败 → 不删任何已落盘文件，journal 记 `kept-orphan-recorded` 并如实输出，与政策“首阶段不自动清理、恢复临时资源只按明确所有权清理”一致。
- 同名同字节复用不取得清理所有权（`reused-no-ownership`），任何回滚都不删它。

append-only journal 全量记录在 `evidence/model-results.json` 的 `journal` 数组。

### L2 Sandbox 探针实测（本机 macOS 27.2，arm64）

- 探针以 ad-hoc 签名（`codesign --verify --strict` 通过）+ App Sandbox entitlement 直接 exec 运行，headless、无 GUI；每轮使用控制脚本生成的唯一 run ID。
- **容器确认后才写**：沙盒激活判定为 `NSHomeDirectory() == getpwuid 真实HOME + /Library/Containers/<bundleID>/Data`（环境 HOME 会被 secinit 同步改写，不能用作判定）；未激活时**不写任何 HOME 位置**，只报告。
- 容器内 fixture：仅在预期容器内向 `probe-fixtures/<runID>/` 写入并读回。
- 未经授权外部临时 fixture（中文/空格/百分号名）：`open()` 返回 **EPERM(1) "Operation not permitted"** —— 真实 OS 层拒绝。

### L2 判定规则（`scripts/verdict.py`，含 8 个伪成功负例自测）

`make check` 先跑判定器自测（任一负例不按预期判定 → rc=4），再对真实证据判定。以下任一不满足即整体不通过：

- probe 与对照命令本身退出码为 0；
- `sandboxActive=true`（未激活 = `incomplete`，rc=3，**不算通过**）；
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
make clean   # 只删本目录 .build/ 与 scratch/
```

- 完整 stdout/stderr 存入仓库级被忽略的 `artifacts/logs/ink-prot-011/`。
- 临时 scratch 仅限本次 mktemp 目录，退出即删；容器清理只删本轮 run ID 的 `probe-fixtures/<runID>/`，不碰其它运行/会话；**不尝试删除**系统管理的容器内容（`.com.apple.containermanagerd.metadata.plist` 受 SIP 保护）。
- 单独自测判定器：`python3 scripts/verdict.py --selftest`。

## 已知限制

- 行内图片引用解析为原型级正则（`![...](path)`，空格以百分号编码），另覆盖引用式定义 `[id]: path` 供 Save As 决策；**回滚安全性不依赖该扫描**（staging 边界保证）。HTML `<img>`、嵌套括号等形态未覆盖。
- 符号链接逐组件检查可防逃逸，但不防硬链接（原型范围外）。
- L2 未在 macOS 14.0 真机执行；部署目标为 14 仅由 `-target arm64-apple-macos14.0` 声明，运行时实测为当前系统 27.2。
- S2/S6 的 Markdown 写失败通过“目标路径被目录占用”注入，属真实文件系统错误而非模拟异常。
- saveDraft 发布（第 3 步）中断时 Markdown 已落盘而资源部分缺失：原型如实记录 `publish-failed-partial` + `kept-orphan-recorded` 并不 markSaved，不隐藏该窗口。

## 父票 14 剩余场景（本轮明确未做，需 UI 锁与 preflight）

1. NSOpenPanel 选 Markdown/图片/目录各自授权语义（文件授权不含邻接资源——研究票已给文档依据，待实测）。
2. 拖放与剪贴板导入的授权与数据形态（`NSFilePromiseReceiver`；粘贴板路径是否携带授权未查证）。
3. security-scoped bookmark 跨启动恢复、stale 与目录移动后的失效反馈。
4. 离线 WKWebView 资源 broker：文档隔离 scheme、`inkora-editor://` 映射、取消契约与并发加载。
5. 整目录迁移、单文件移动、缺失/无权限占位的实际 UI 流程。
6. 生产化规格：NSDocument/NSFileCoordinator 集成（本原型刻意不做）。

执行上述实验须按 `docs/testing.md` 使用 `scripts/ci/with-ui-lock.sh` 与 `ui-preflight.sh`，避免占用桌面。
