# M0 真实 WKWebView / 中文输入人工验收

Status: prepared; runtime and human review pending

本记录用于[原型票11](../issues/11-incremental-fidelity-prototype.md)的第五项门槛，不是正式产品验收。2026-11-09 已完成以下固定版本的非UI检查与签名构建；桌面预检仍为屏幕锁定（exit78），尚未启动本版本 App。已向用户询问解锁及物理键盘配合时间，未收到答复时保持待验收。

## 固定产物

- 集成分支：`task/INK-PROT-008-m0-integration`，HEAD `5fbeb109ac5a4158b50014b39b3864163ae8625a`。
- 工作区：`/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-008-m0-integration`。
- App：`editor/prototypes/fidelity/native-host/artifacts/FidelityHost.app`，bundle ID `com.huruizhi.Inkora.FidelityPrototype`。
- HTML source SHA256：`c86390037282e71e4187aaea46fe92354f12c669373f3d4c1be69d2287c81090`。
- HTML bundle SHA256：`df25ee909a326fb87a74f2b5187b8c7c2cf01553593102a0261985260cab8373`。
- source/bundle script SHA256：`a60f78cb3f19c0099477955ce037f3fa6effe9ce78d1eca79030a34120932080`，脚本字节一致；CSP只在副本注入。
- observer SHA256：`2aa57f6906dd5afe0dd9a9e3bd4ad8d149f4534afd25e7d754632d66eb68696d`。
- [本机构建清单](/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-008-m0-integration/editor/prototypes/fidelity/native-host/artifacts/build-manifest.json)。Info/HEAD/hash与清单独立核对通过，ad-hoc签名通过；未据部署目标宣称macOS14真机通过。

旧014日志属于旧HTML，不能作为本版本运行证据。023/024合成信号只证明只读诊断与操作守卫，不证明系统IME。

## 启动与会话所有权

由管理者在用户解锁后先重新预检，再以前台可执行文件持锁启动：

```sh
cd /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-008-m0-integration
INKORA_UI_LOCK_TIMEOUT=30 scripts/ci/with-ui-lock.sh \
  scripts/ci/ui-preflight.sh desktop \
  editor/prototypes/fidelity/native-host/artifacts/FidelityHost.app/Contents/MacOS/FidelityHost \
  > editor/prototypes/fidelity/native-host/artifacts/M0-HITL-runtime.log 2>&1
```

包装器会话在整个验收期间保持存活；App正常关闭后才释放锁。记录本次PID、实际系统版本、当前输入源以及清单哈希。只操作隔离内置样稿；输入固定测试词，日志由管理者读取。

## 人工步骤与证据

1. 用户用物理键盘在可视正文输入“中文测试”。观察候选窗或marked text，以及observer的真实compositionstart/update/end、组合期isComposing/combined composing状态；只有直接插入中文或字母不足以判过。
2. 候选期间观察模式/保存/历史按钮处于保护状态，组合文本和选区保留。上屏后用Undo/Redo验证内容及光标恢复，记录一次撤销是否错误暴露拼音或中间候选。
3. 主动进入源码，在相同文档中重复真实中文组合。组合期保留源码草稿、模式与选区；上屏后提交回可视，Undo/Redo核对内容锚点及字节。记录sourceComposing与combined composing，不把PM visual单一标志当作源码状态。
4. 在可视与源码往返后建立原型内存保存点，继续编辑并核对dirty、保存点和撤销；组合期间保存守卫保持。此处不是NSDocument磁盘保存证明。
5. 用户审阅正文与保护片段共存、局部修改的原文差异、源码仅改格式的dirty，以及含混输入的保存阻断和主动修复。记录具体操作/可见结果，不以演示按钮数量代替体验。
6. 正常关闭本次App，确认前台进程及锁结束；若临时切换输入源，恢复步骤1记录的实际输入源。

每步分别记录PASS / FAIL / NOT_EXECUTED、用户可见现象及日志时间段。真实失败保留并交回修复；未取得候选/marked text与真实事件、用户审阅前，11保持claimed，12不锁架构。

## 当前结果

| 层级 | 状态 |
| --- | --- |
| 最终组合非UI检查、只读observer与签名构建 | PASS，固定上述HEAD/hash |
| 本版本真实WK运行 | NOT_EXECUTED |
| 系统中文IME与物理键盘 | NOT_EXECUTED |
| 用户交互审阅 | PENDING |
| 正式产品磁盘保存/资源权限/最低OS | 独立阶段门槛，未由本原型证明 |
