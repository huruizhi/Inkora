# Standards

受检范围：`git diff 2fa3a9e88e7462e3d6929625911cd39f68ce89ad...d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14` 的全部 27 个文件与全部 hunk。已实际读取 `AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/markdown-support.md`、`docs/bridge-protocol.md`、`docs/editor-session.md`、`docs/save-barrier.md`、`docs/local-images.md`、`docs/recovery.md`、`docs/testing.md`、`docs/tasks/INK-M1-083.md`；库内未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`。

## Hard

无。`git diff --check` 无输出；提交 subject 均为英文 Conventional Commits 且不超过 72 字符。Native scanner 删除不是有效覆盖的无声删除：原 8 个 scanner 测试在 `editor/src/source-authority-runtime.test.ts:61-137` 的 canonical parser 覆盖中迁移，另有 `editor/src/main.test.ts:694-765` 的 snapshot/access proof 覆盖。未见绕过 composition、保存闸门或 source-authoritative 约束的标准违规。

## Judgement

- 可能的 `Duplicated Code`：`editor/src/source-authority.ts:555-562` 与 `editor/src/editor-runtime.ts:945-953` 都逐节点筛选 `image` 并收集非空 `href`。可考虑提取接受已解析 doc 的共享 collector；但 bare-CR runtime 需要先做 LF 语义副本，生产 session 使用已接受 doc，当前差异有明确边界，故不算 hard finding。

其余 Fowler baseline（Mysterious Name、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man、Refused Bequest）在本 diff 未形成可可靠报告的 finding；Bridge 兼容字段与对称 proof 校验按仓库标准保留。
