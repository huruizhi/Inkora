# INK-PROT-007：隔离 WKWebView 宿主（M0 真实环境验证用）

仅为后续人工验证者提供的**真实 WKWebView 单窗口宿主**。不是产品代码：无 NSDocument、
无保存流程、无生产 Bridge、无新增依赖；不改 `project.yml`、生产 app/src/ 测试。

## 组成

- `Sources/main.swift`：AppKit 单窗口 + `WKWebView`，底部诊断栏显示构建基线、
  入口文件名、源文件/副本 SHA256、CSP 状态与页面状态；每秒以
  `evaluateJavaScript("JSON.stringify(window.fidelityPrototype ?? null)")`
  做最小状态读取（可选诊断，不驱动自动化验收）。
  导航白名单：仅允许本 bundle `Resources/` 内 `file:` URL 与 `about:`；其余一律取消。
- `Resources/Info.plist`：模板（占位符由构建脚本写入实际值）。
- `Entitlements.plist`：App Sandbox + `com.apple.security.network.client`
  （仅满足沙盒 WebKit 连接 WebContent 进程，见 `docs/adr/0003-project-and-bridge.md`；
  实际网络访问仍被导航白名单与副本内 CSP `connect-src 'none'` 禁止）。
- `scripts/prepare_entry.py`：复制入口 HTML 为 bundle 内 `entry.html` 副本，可选注入
  离线 CSP meta（仅在 `<meta charset>` 后插入标签，不改动任何现有字节），并输出
  原文件/副本 SHA256 及 `<script>` 字节级一致性证据。
- `Makefile`：`build` / `verify` / `run` / `clean`。
- `artifacts/`：产物（不提交）：`FidelityHost.app`、`build-manifest.json`、
  `entry-report.json`、`swiftc.log`。

## 命令

```sh
# 构建（编译、打包副本、ad-hoc 签名 + Hardened Runtime、codesign 校验）
make -C editor/prototypes/fidelity/native-host build

# 非_UI 复查：签名、entitlements、资源、manifest
make -C editor/prototypes/fidelity/native-host verify

# 指定其它已验收 HTML 入口（例如以后集成 005/006 产物）。
# ENTRY_HTML 相对 native-host/ 目录解析（make -C 会先进入该目录）；
# 跨目录推荐绝对路径：
make -C editor/prototypes/fidelity/native-host build ENTRY_HTML=/abs/path/to/ACCEPTED.html
# 相对路径示例（等价于默认值 ../PROTOTYPE.html，相对 native-host/）：
make -C editor/prototypes/fidelity/native-host build ENTRY_HTML=../PROTOTYPE.html

# 仅在持有项目 UI 锁且 preflight 通过后由人工验证者执行：
make -C editor/prototypes/fidelity/native-host run
```

## 防陈旧 bundle 机制

构建基线 commit、源 HTML SHA256、bundle 副本 SHA256 同时写入 Info.plist
（窗口标题与诊断栏可见）与 `artifacts/build-manifest.json`。build 为确定性顺序：
每次重新生成二进制/副本/Info.plist 版本键/manifest 并最后统一签名，
因此 ENTRY_HTML/CSP_INJECT/HEAD/Entitlements 变化不会残留旧值，且对
`make -j` 安全。CSP 注入仅发生在副本，原 HTML 不被修改；
`entry-report.json` 记录注入前后 `<script>` 字节串 SHA256 一致（JS 字节未变）。

注入的 CSP：`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; connect-src 'none'`。
`csp_requested` 与 `csp_inserted` 区分：源文件已含 CSP 时不重复插入
（`csp_source=already-present`）。`CSP_INJECT=0` 时不注入副本，此时离线
保障仅剩宿主导航白名单（file:/about:），页面自身的 fetch/外链不受 CSP
约束——只在入口已自带等价 CSP 时使用。

## 本轮实际构建记录（2026-11-08）

- 基线：`692493508d4b5ac78f0b212045aae32a8b59b90e`（分支 `task/INK-PROT-007-wkwebview-host`）
- 工具链：Xcode 27.2 (27B52)，`swiftc -O -target arm64-apple-macos14.0`
  （最低部署目标 14.0；实际编译于 macOS 27.2 / arm64）
- 入口：`editor/prototypes/fidelity/PROTOTYPE.html`
  - 源 SHA256 `61281bd14ad8432e508a2cfeeabeb100cf1fcdfd386e824c41caa86b30f082e1`
  - 副本 SHA256 `0d31a2dfe422f7ec45ff2152317ab41ebc9aec10ac0dd84afbe6bad3466cb4a4`
  - script 字节 SHA256 前后一致：`a47f9afa…23bec`（identical=true）
- 产物：`artifacts/FidelityHost.app`
- `codesign -dv`：`Identifier=com.huruizhi.Inkora.FidelityPrototype`，
  `flags=0x10002(adhoc,runtime)`；`codesign --verify --strict` 通过；
  entitlements = app-sandbox + network.client。
- **未执行**：`run`、任何 App 启动、桌面操作、WKWebView 运行时行为、系统 IME。
  本任务不做且不宣称以上通过。

## 后续人工验证步骤（持 UI 锁 + preflight 后）

1. `make ... run` 启动；确认窗口标题含入口名与副本 SHA 前 12 位，诊断栏
   baseline/SHA 与 `build-manifest.json` 一致，page 状态非 blocked/error。
2. 真实拼音输入法：在正文连续键入拼音，观察候选窗、composition 下划线；
   截图 composition 前后状态（无组合 / 组合中 / 上屏后）。
3. 上屏后检查光标位置、方向键移动、Shift+方向与鼠标拖拽 selection。
4. ⌘Z / ⇧⌘Z 多轮 Undo/Redo，覆盖组合文本与结构操作（任务单勾选等）。
5. 自由/源码模式切换各若干次，确认诊断与正文一致、无内容丢失。
6. 点击原型“保存”（仅内存保存点），确认无任何磁盘写入（本宿主无保存能力，
   不以此宣称验证了正式产品磁盘保存）。
7. 每步采集截图/录屏与诊断栏内容归档；jsdom 或注入中文字符串不得冒充系统 IME。

## 明确限制

- 仅 arm64 本机构建（`-target arm64-apple-macos14.0`），未做 universal/CI。
- ad-hoc 签名仅本机可运行，不能分发；`spctl` 不适用。
- `network.client` entitlement 存在，但导航与 CSP 双重禁止 HTTP(S)；未做网络
  层抓包验证（属后续验证者范围）。
