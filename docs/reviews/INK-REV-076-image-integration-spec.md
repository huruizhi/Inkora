# Spec

固定对比 `c9e247defa790db399f6286f8e83086b736bfd4d...a58b8ba1edddb7863856214b9c36f0893030bf11`；仅审 V4 overlay。结论：4 项 Spec 缺口，范围扩张 0 项。

## Findings

1. **[S1][c] 首存失败后无法直接重试或改目标。** 规格 30、49–51 行要求路径事务可解释且失败可恢复；`LocalImageStore.swift:358-360` 在发布后仍保留 draft owner，而 Web 已在 `source-authority.ts:1307-1315` 要求 `from` 唯一存在。真实生产 seam 反例：首次 `draft→Note.assets/a.png` 成功后，同目标重试及 `draft→Other.assets/a.png` 均返回 `false`；必须先 Undo 才能继续，异目标保存也被锁死。

2. **[S1][a] 持久化 pending 导入意图没有启动发现入口。** 规格 28、32、51、76 行要求资源先落盘且跨进程保守恢复。`LocalImageStore.swift:243-265` 可在 Bridge 接受前写出 `LocalImages/<session>/manifest.json`，但 `RecoveryStore.swift:169-194` 只枚举 Recovery 顶层 JSON，`InkoraDocument.swift:80,157-163` 的新文档又生成新 UUID。最小反例是落 manifest 后、`stateChanged`/1 秒正文草稿前 SIGKILL：字节仍在，却没有任何启动路径能找回该 session/意图。

3. **[S2][a] Save As 未覆盖合法 CommonMark 图片 owner。** 规格 10、53、78 行与 canonical `SYN-S010` 要求迁移全部真实图片引用；`LocalImageMigration.swift:315-322` 的 inline destination 正则在首个 `)` 截断。真实 Swift seam 对 `![x](Old.assets/a(b).png)` 返回 `Old.assets/a(b`，随后会找错来源并阻断 Save As，而非迁移真实资源。

4. **[S1][c] 已恢复 bookmark 的命名图片注册在 scope 外同步读。** 规格 36、40 行要求解析书签后进入 scope 并覆盖读取 lease。`InkoraDocument.swift:217-222` 导入返回即 stop；随后 `EditorViewController.swift:549-580` 解析根目录后直接调用同步 `broker.read`，而 lease 只存在于 `DocumentAssetBroker.swift:193-207` 的异步入口。Sandbox 最小链路会在已授权且已复制后仍把预检判为拒权，导致图片不进入当前原文。

## 边界

未复报 V6 epoch/嵌套 marks；未把真实 WK、拖放/剪贴板、书签跨启动、NSDocument/macOS 14 与物理输入法待验收项当成通过或代码缺陷。
