# INK-PROT-017：真实系统 IME 键码路径调查

## 结论

本机公开 CoreGraphics 键码路径已完成“可编译 + 只读权限预检”，但当前 probe 进程的
`CGPreflightPostEventAccess()` 返回 `false`。因此本任务严格停止在权限边界前：没有启动
FidelityHost、没有取得 UI 锁、没有切换输入源，也没有投递任何键盘事件。

这证明当前进程不能作为 M0 中文 IME 的系统键码驱动；没有证明正文或源码 textarea 的
IME 行为。INK-PROT-014 的 A 层历史结论保持不变，B 层仍为未执行，不能宣告 M0 通过。
机器可读记录见 `INK-PROT-017-evidence.json`。

## Probe 约束

`Sources/ime_keypath_probe.swift` 只使用公开 API：

- `CGPreflightPostEventAccess` 读取当前进程已有的事件投递权限；源码不调用
  `CGRequestPostEventAccess`，不会申请权限或触发 TCC 提示。
- 获得权限时，仅允许固定 `zhongwen`、`space`、`escape` 三种键序，以虚拟键码
  down/up 事件走 `cghidEventTap`；不调用 Unicode 字符串注入，不使用剪贴板、
  JavaScript `insertText` 或合成 composition 事件。
- 目标 bundle 固定为 `com.huruizhi.Inkora.FidelityPrototype`；整批之前及每个键之前
  都检查 `NSWorkspace.shared.frontmostApplication.bundleIdentifier`，失焦立即停止。
- probe 是 `artifacts/` 下的独立产物，不进入产品、HTML 或模型。

SDK 27.2 的 `CoreGraphics/CGEvent.h` 声明 `CGPreflightPostEventAccess`（macOS 10.15+）
与 `CGEventPost`；Swift 使用后者的公开 overlay `CGEvent.post(tap:)`。

## 实际执行

环境：macOS 27.2 (26B123)，arm64，Xcode 27.2 (27B52)，SDK 27.2。

```sh
make -C editor/prototypes/fidelity/native-host probe
editor/prototypes/fidelity/native-host/artifacts/ime-keypath-probe preflight
```

probe 编译成功；最终二进制 SHA256：
`76f981a34c4b6936669dbedc202d1bce13378d56bb8f56a33ad3d769d9dafa43`。
preflight 退出码为 `77`，实际记录：

```json
{"architecture":"arm64","bundle_id":null,"frontmost_bundle_id":"com.google.Chrome","input_source_id":"com.sogou.inputmethod.sogou.pinyin","post_event_access":false,"process_name":"ime-keypath-probe"}
```

检查时的实际输入源是 `com.sogou.inputmethod.sogou.pinyin`。本任务没有改变输入源或焦点，
所以无需恢复；也没有启动 App 或持有锁，不存在本次进程/锁清理项。

宿主非 UI 校验另行实际执行：

```sh
make -C editor/prototypes/fidelity/native-host verify
```

结果通过。manifest 固定基线为 `afe85724a0b98acae7c0810de003b92d7858d2ac`；HTML source / bundled
SHA256 分别为 `182fcee…382a9` / `123726e…0c7a`，script 字节 SHA256 前后一致
`98a7ca0…10af`，observer SHA256 为 `28f0fa8…3d4f`。未改 HTML、model、main、生产代码或依赖。

## 后续人工物理键盘复现

需要真人在同一 Mac 的已解锁桌面上执行，不能用 Computer Use `pressKey` 或 `typeText`
代替：

1. 记录当前实际输入源；用既有
   `scripts/ci/with-ui-lock.sh scripts/ci/ui-preflight.sh desktop <FidelityHost executable>`
   启动前台宿主，让可执行文件在整个验收期间持续持锁。
2. 对照 `artifacts/build-manifest.json`、Info.plist 与诊断栏核对 baseline、HTML source / bundle、
   script、observer SHA；确认前台 bundle 是上述隔离 FidelityHost。
3. 临时选择已安装的系统拼音或搜狗拼音。在 visual 正文用物理键盘输入短拼音，必须看到
   候选窗或 marked text，并在只读 observer 中看到 `compositionstart/update/end` 与
   `isComposing=true` 后再上屏；只有字母或直接出现 Unicode 中文都不算通过。
4. 仅在真实组合成立后，依次验证 visual 选区替换、上屏后的 Undo/Redo；再进入 source
   textarea 重复组合，并验证组合期间保存与模式切换守卫。保留所有真实失败。
5. 正常关闭本次 FidelityHost，等待包装器退出并释放 UI 锁；恢复步骤 1 记录的实际输入源，
   不假设它是 U.S.，不关闭任何他人实例。

在上述步骤获得 observer 事件、候选/marked text 与模式状态证据并由用户逐项体验签字前，
B 层及 M0 均保持未通过。
