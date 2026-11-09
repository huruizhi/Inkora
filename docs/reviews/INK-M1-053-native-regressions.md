# INK-M1-053：原生内核集成回归诊断

固定基线 `744c0141f5ffb0c6fcb0b7c2d6761efbce0be973`。冻结资料位于调度者只读
归档，原件未修改、移动或覆盖。基线实际 xcresult 为 121 项：108 passed、6 failed、
7 skipped。

## 红环与排序假设

限定六项 `EditorWebViewTests` 的 xcodebuild 红环实际复现 6/6 failed，症状与冻结
xcresult 一致。按 diagnosing-bugs 排序：一、测试仍把新内核当自动 textarea；二、
composition 注入错误 DOM seam；三、Bridge 的 composition snapshot retry/lifecycle
存在真实缺陷；四、reload 没有在第二次 ready 后重放 queued document。

单变量验证先证明生产 runtime 仅在主动源码模式创建 textarea，mixed EOL 与未知标签
保持 ProseMirror 可视投影，bare CR 才是只读 textarea。修正 mode/oracle 后 bare-CR 与
mixed EOL 两项通过。composition 改到 ProseMirror 文本节点、DOM input 与生产
composition guard 后，三次 `editor_not_ready` retry 会正常结束，compositionend 后
snapshot 恢复，否证第三项产品缺陷假设。

reload 阶段化探针进一步定位：DOM 已生成但 Bridge ready→load 的 JavaScript completion
尚未收口时，reload 前 snapshot 合法返回 `editorNotReady`。改为只短暂重试该明确错误，
并要求旧页面 token 消失及第二次 versioned snapshot 成功后，单项通过；没有修改
Bridge 生命周期或放宽 timeout。

## 永久回归

- 加载与 reload 的可信 oracle 是 Bridge snapshot，不是渲染 `textContent`。
- CRLF/Unicode 通过生产源码入口、input、显式 apply 与 snapshot，断言 CRLF 风格和
  Unicode 精确值。
- mixed EOL 断言可视模式与精确 raw；bare CR 断言只读、显式 LF 转换、不可撤销转换
  边界及后续一组 Undo/Redo。
- synthetic 可视 composition 断言中间态 revision/dirty/recovery/blur/selection 不变；
  stable 后一次 revision、精确 raw、recovery 以及 Undo/Redo。synthetic 不替代真人 IME。
- reload 断言新页面、相同 documentID/revision 与原始尾 LF，避免把显示文本和原文混用。

## 实际验证

- 六项初始红环：0 passed / 6 failed / 0 skipped。
- 逐项修正中间态：2 passed / 4 failed，随后 5 passed / 1 failed；reload 阶段化探针
  定位 ready 等待后单项通过。
- 六项最终专项：6 passed / 0 failed / 0 skipped。
- `make test-native` 实际 xcresult：121 项，114 passed / 0 failed / 7 skipped。
- 完整 editor：22 files / 394 tests passed；Bridge editor：1 file / 12 tests passed；
  Bridge native：9 passed / 0 failed / 0 skipped。
- `make lint`、`git diff --check` 与 `make build-release` 通过。Release 构建保留既有
  Swift actor-isolation/optional coercion warnings和 editor 单 chunk 大小提示。

本轮未运行 XCUITest、物理键盘或真实输入法，未启动 App，未修改产品源码、依赖、
entitlement、prototype 或冻结验收资料。7 项既有 skip 保留并如实记录。
