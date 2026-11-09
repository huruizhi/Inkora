# GFM 自动链接独立双轴审查

固定 `15687430b7f2e5272975cc469e9c6ff30f0324f9...04b7f18a26cdff156f85ed2800cdca127120e0d2`；两名新上下文评审分别执行，不合并或跨轴重评。

# Standards

审查范围：`15687430b7f2e5272975cc469e9c6ff30f0324f9...04b7f18a26cdff156f85ed2800cdca127120e0d2`，含 `54ae009` 与 `04b7f18`；覆盖源码、测试、证据和 fixture 许可说明。

## 结论

硬违规：0。

依据 `GLOSSARY.md`、ADR-0004、`docs/markdown-support.md` 的 `FID-*`、`ENC-*`、`GATE-*`、`SYN-S016`，新增自动链接接线仍以当前原文为唯一权威，PM 只是可解释投影；owner、selection、history 和 composition 相关路径保留了原有事务边界。新增 fixture 说明了离线执行、来源哈希与 CC BY-SA 4.0 许可；未见网络访问或依赖锁变更，符合 `AGENTS.md` 与 `docs/testing.md` 的约束。

Fowler baseline 判断项：0。`gfm-autolinks.ts` 同时包含纯匹配器和 MarkdownIt 接线，但两者服务同一 GFM 变化，且 `docs/tasks/INK-M1-093.md` 已明确记录锁定 runtime seam；不足以成立 Divergent Change、Feature Envy 或其他 smell。其余 Mysterious Name、Duplicated Code、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Speculative Generality、Message Chains、Middle Man、Refused Bequest 均未发现有证据的条目。

本轴未重复运行全套测试或性能/构建命令；结论基于固定 diff 与仓库已有书面证据，未把 root 实跑结果冒充本次自跑。

# Spec

固定基线：`15687430b7f2e5272975cc469e9c6ff30f0324f9`；评审 HEAD：`04b7f18a26cdff156f85ed2800cdca127120e0d2`。

## Finding

- **[P2] 邮箱分支缺少 GFM 扩展自动链接的起点边界** — `editor/src/gfm-autolinks.ts:17-25,45-53`。Canonical 采用 GFM 0.29（`docs/markdown-support.md:67`），`SYN-S016` 要求正确识别裸 URL 与邮箱（`:88`），有界任务也要求共享规则处理“域名与前后边界”（`docs/tasks/INK-M1-093.md:9`）。[GFM 6.9](https://github.github.com/gfm/#autolinks-extension-) 规定扩展自动链接只能出现在行首、空白后或 `*`、`_`、`~`、`(` 后；实现只在 URL 分支检查此前字符，邮箱及 `mailto:`/`xmpp:` 分支直接接受。独立公共会话反例 `]foo@bar.baz\n` 因而产生 `foo@bar.baz` link mark，尽管 `]` 不是允许的分隔符。共享匹配器使错误同时进入 parser、ledger 与后续 owner 操作；14 例 oracle 未覆盖此边界。应让邮箱/协议邮箱复用同一起点约束，并补不允许标点与允许分隔符的对照。

Missing/partial：0。Scope creep：0。Wrong：1。真实 UI/物理 IME/Sandbox/macOS 14+ 的明确延期未重报为代码缺陷。

## 管理者处理

094 hard0/judgement0，已487文件tar/Git bundle核验备份，commit8df46e5，tar SHA b11e49bc55869f03696adfb385a679da1b7a682b85650531b18705154629cb25；已Agent/workspace两层回收。095 Spec wrong1/P2（missing/partial0、scope creep0），报告ffcc25f远端同SHA且clean；备份tar SHA `3a8820787101f303f038583531c62488d78f0bd8f284429c9e78205f9b46eb4e`，Agent/workspace归档成功、removedDirectory=true。managed累计84。root已在093公共会话复现同症状：`]`后三种邮箱写法误生成link；单变量将已有起点检查提升为共同规则后转绿，合法分隔符与14个官方oracle控制28/28通过，全量正在运行。未用Standards通过替代Spec修正。
