# INK-PROT-011 本地资源平台原型（第一部分）

父票：INK-PLAN-005 `typora-parity/issues/14-local-assets-platform-prototype.md`（完整范围仍保留，**本目录只完成第一部分**，14 未关闭）。
基线：`36e636578798510d240b23520122c88578cf3fe5`。原型代码，不含任何生产修改；无新增依赖（仅系统 Swift/Foundation/CryptoKit）；不访问用户真实内容、不联网、不启动 GUI/面板/拖放/剪贴板/IME。

## 范围与交付

回答的问题：本地图片政策（06 票已决）在真实文件系统与真实 App Sandbox 下，**状态模型与故障恢复边界**是否成立。分两层证据，明确区分：

| 层 | 进程形态 | 证据文件 |
| --- | --- | --- |
| L1 纯模型 + 普通 scratch 文件系统 | 非沙盒 CLI（`.build/local-assets-model`），全部写入唯一 mktemp 临时目录 | `evidence/model-results.json` |
| L2 真正签名 Sandbox 进程 | ad-hoc 签名 + 仅 `com.apple.security.app-sandbox` entitlement 的 headless .app（bundleID `com.huruizhi.Inkora.AssetPrototype`，部署目标 macOS 14） | `evidence/probe-results.json` |

非沙盒对照读取（同一 posix-read 语义）记录在 `evidence/contrast-read.json`，只用于**区分**沙盒内行为，不作为授权证据。汇总见 `evidence/summary.json`（含基线 git SHA、二进制 SHA256、判定）。

### L1 场景矩阵（S1–S9，均含初始/最终字节 SHA 与 journal 记录）

| 场景 | 断言 |
| --- | --- |
| S1 未命名草稿 | 导入图片复制进独立恢复会话；`dirty=true`、未 `markSaved` |
| S2 复制成功但 Markdown 写失败（真实注入：目标路径被目录占用） | 不 `markSaved`；回滚仅删本次创建且未被引用的副本；草稿字节与无关文件 SHA 不变 |
| S3 首次保存成功 | `<文档名>.assets/` 与 Markdown 同目录；中文/空格/百分号相对引用可解析且字节 SHA 一致；此后才 `markSaved` |
| S4 Save As | 新 Markdown 与原 Markdown **逐字节相同**；托管资源按**原目录名**复制到新位置；原文件不删、SHA 不变 |
| S5 目标冲突 | 同名同字节复用（journal 记 `reused-no-ownership`，失败回滚不删它）；异内容拒绝且不覆盖 |
| S6 回滚所有权边界 | 被目标目录其它 Markdown 引用的本次创建文件保留；未引用删除；外来文件与其他 Markdown 不动 |
| S7 取消保存 | 草稿会话与导入文件不删 |
| S8 解析边界 | 中文/空格/百分号通过；`..`、绝对路径、符号链接逐组件拒绝（最小反例记录于 detail） |
| S9 显式放弃 | 仅显式 abandon 删除会话自有目录 |

多文件操作（复制 + 写 Markdown）**不假称原子事务**：以 append-only 所有权 journal（`evidence/model-results.json` 的 `journal` 数组）跟踪 `created/committed/reused-no-ownership/rolled-back-*` 边界。

### L2 Sandbox 探针实测（本机 macOS 27.2，arm64）

- 探针以 ad-hoc 签名（`codesign --verify --strict` 通过）+ App Sandbox entitlement 直接 exec 运行，headless、无 GUI。
- `sandboxActive=true`：`NSHomeDirectory()` 与环境 `HOME` 均被 secinit 重定向到 `~/Library/Containers/com.huruizhi.Inkora.AssetPrototype/Data`。
- 容器内 fixture：写入 + 读回成功（34 字节，SHA 记录在案）。
- 未经授权外部临时 fixture（控制脚本 mktemp 目录，含中文/空格/百分号名）：`open()` 返回 **EPERM(1) "Operation not permitted"** —— 真实 OS 层拒绝，非模型断言。
- 对照：同一读取代码在非沙盒 CLI 下读取同一文件成功且 SHA 相同。
- 结论判定 `sandbox-active-blocked-external`：ad-hoc 签名 + sandbox entitlement 直接 exec 即可激活 App Sandbox（本机实测；未在 macOS 14 真机上重复，见缺口）。

## 复现

```sh
cd prototypes/local-assets
make build   # swiftc -target arm64-apple-macos14.0；codesign 失败真实非零
make check   # L1 场景 + L2 探针 + 对照 + evidence/ 写入；模型失败 rc=1，探针自相矛盾 rc=1
make clean   # 只删本目录 .build/ 与 scratch/
```

`make check` 会把完整 stdout/stderr 存入仓库级被忽略的 `artifacts/logs/ink-prot-011/`；临时目录仅限本次 mktemp 创建的目录并在退出时删除；探针容器内 `probe-fixtures/` 运行后即清理（容器骨架由系统管理，`.com.apple.containermanagerd.metadata.plist` 受 SIP 保护不可删，保留无害）。

## 已知限制

- 图片引用解析为原型级正则（`![...](path)`，空格以百分号编码），不处理嵌套括号/HTML img/引用式语法；Save As 逐字节复制不依赖解析，解析仅用于托管目录复制决策与未托管引用检测。
- 符号链接逐组件检查可防逃逸，但不防硬链接（原型范围外）。
- L2 未在 macOS 14.0 真机执行；部署目标为 14 仅由 `-target arm64-apple-macos14.0` 声明，运行时实测为当前系统 27.2。
- S2/S6 的 Markdown 写失败通过“目标路径被目录占用”注入，属真实文件系统错误而非模拟异常。

## 父票 14 剩余场景（本轮明确未做，需 UI 锁与 preflight）

1. NSOpenPanel 选 Markdown/图片/目录各自授权语义（文件授权不含邻接资源——研究票已给文档依据，待实测）。
2. 拖放与剪贴板导入的授权与数据形态（`NSFilePromiseReceiver`；粘贴板路径是否携带授权未查证）。
3. security-scoped bookmark 跨启动恢复、stale 与目录移动后的失效反馈。
4. 离线 WKWebView 资源 broker：文档隔离 scheme、`inkora-editor://` 映射、取消契约与并发加载。
5. 整目录迁移、单文件移动、缺失/无权限占位的实际 UI 流程。
6. 生产化规格：NSDocument/NSFileCoordinator 集成（本原型刻意不做）。

执行上述实验须按 `docs/testing.md` 使用 `scripts/ci/with-ui-lock.sh` 与 `ui-preflight.sh`，避免占用桌面。
