# INK-PROT-021 进程重启恢复证据

## 结论

`make restart-check` 在唯一 `mktemp` 根内启动独立 worker。父脚本观察 `ready.json` 中已持久化的检查点后向该 PID 发送 `SIGKILL`，确认返回码为 `-9`；随后启动不同 PID 的 `audit` 进程，只从 `manifest.json`、`events.jsonl` 和文件实际字节恢复。8 个关键窗口与 10 个负例全部通过。

这是普通 scratch 文件系统上的真实进程中断证据，不是同进程抛异常，也没有靠重新导入资源模拟恢复。它不证明断电/磁盘硬件耐久、App Sandbox bookmark、NSOpenPanel、WK broker、GUI、IME 或最低 macOS 14 真机运行。

## 中断矩阵

`saveDraft` 与 `Save As` 各覆盖四个窗口：

| 阶段 | 磁盘 checkpoint | 恢复判定 | 目标/资源观察 |
| --- | --- | --- | --- |
| 导入后、保存前 | `imported` | `not-committed`，独立未保存草稿 | Markdown 目标不存在，0 个目标资源 |
| 部分资源发布后 | `partially-published` | `not-committed` | Markdown 目标不存在，1 个目标资源匹配 SHA |
| 全部资源发布、Markdown 前 | `assets-published` | `not-committed` | Markdown 目标不存在，2 个目标资源匹配 SHA；孤儿保留 |
| Markdown 提交、最终确认前 | `markdown-committed-unconfirmed` | `observed-bytes-match-completion-unknown` | 目标 Markdown 与原始 BOM/CRLF/中文/emoji 字节 SHA 相同，但不补写 saved |

每个场景都记录 worker PID、recovery PID、SIGKILL、operation/session UUID、事件数、目标恢复前后 SHA，并对恢复前后整个 fixture 文件树做 SHA 快照，断言只读恢复没有写入或删除。Save As 还断言来源 Markdown 与 `original.assets/` 两个来源资源的 SHA 保持一致；目标保留原资源目录名，不删除来源。

实际逐次 PID、UUID 和 SHA 是运行时数据，保存在 `evidence/restart-recovery-results.json`，不在本文复制易过期值。

## 损坏与所有权负例

检查项均以真实文件状态断言“拒绝或保留”，任一失败使脚本非零退出：

1. 截断 manifest：`record-rejected`，不清空会话目录。
2. 截断 JSONL event：因没有完整末尾换行/事件而拒绝，不猜最后事件完成。
3. 外部目标变化：报告 `external-target-change`，恢复前后目标 SHA 相同。
4. 草稿图片丢失：报告 `draft-asset-missing-or-changed`，其余资源保留。
5. 预置同名字节资源：记录 `ownership=none` 复用，恢复不删除。
6. 预置同名异字节资源：worker 真实非零失败，既有资源 `different-preserved` 且 SHA 不变。
7. 另一会话共存：同一根下两个 UUID 会话分别恢复，不合并、不清理。
8. 未知 schema：拒绝记录，不执行记录中的动作。
9. `../outside.md` 非法目标：拒绝记录，根外 marker SHA 不变。
10. UUID 会话目录符号链接：不跟随，根外 marker SHA 不变。

## 写入与耐久边界

- JSONL 事件以 `O_APPEND` 打开，完整写入一行后对 fd 调用 `fsync`。副作用前写 `intent`，完成后写 `confirmed` 或 `blocked`。
- manifest/资源/Markdown 写到同目录私有临时文件，对文件 `fsync`，`rename` 到最终路径，再对父目录 fd 调用 `fsync`。
- 资源使用不覆盖的 `copyItem` 发布；已存在同字节只复用且无所有权，异字节阻塞并保留。
- Markdown 在资源全部发布后才原子 rename；目标基线变化时不提交。
- 多文件事务并非原子。发布与 Markdown 之间被杀会遗留资源，本原型选择保留并审计，不自动清理。
- `SIGKILL` 只证明 OS 进程被强制终止后可重建；没有做拔电、内核崩溃、存储控制器缓存或损坏介质测试。

## 复跑

```sh
cd prototypes/local-assets
make restart-check
python3 -m json.tool evidence/restart-recovery-results.json >/dev/null
```

脚本用 `tempfile.mkdtemp(prefix="ink-prot-021.")` 创建唯一 fixture 根，`finally` 只删除该根；`INK_PROT_KEEP=1` 可保留本轮 fixture 供人工审计。恢复过程中不会访问网络、用户真实文档、GUI 或 TCC。

## 未执行层

- App Sandbox bookmark / NSOpenPanel 授权与跨启动恢复；
- WKWebView 离线资源 broker；
- GUI、拖放、剪贴板、IME、光标、选区、撤销重做；
- macOS 14.0 真机运行；
- 断电与存储硬件耐久验证。

因此本证据不关闭父票 14，不宣称 M1/生产功能完成，也不替代 INK-PROT-013 的签名 Sandbox EPERM 探针。
