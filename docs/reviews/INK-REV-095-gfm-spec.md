# Spec

固定基线：`15687430b7f2e5272975cc469e9c6ff30f0324f9`；评审 HEAD：`04b7f18a26cdff156f85ed2800cdca127120e0d2`。

## Finding

- **[P2] 邮箱分支缺少 GFM 扩展自动链接的起点边界** — `editor/src/gfm-autolinks.ts:17-25,45-53`。Canonical 采用 GFM 0.29（`docs/markdown-support.md:67`），`SYN-S016` 要求正确识别裸 URL 与邮箱（`:88`），有界任务也要求共享规则处理“域名与前后边界”（`docs/tasks/INK-M1-093.md:9`）。[GFM 6.9](https://github.github.com/gfm/#autolinks-extension-) 规定扩展自动链接只能出现在行首、空白后或 `*`、`_`、`~`、`(` 后；实现只在 URL 分支检查此前字符，邮箱及 `mailto:`/`xmpp:` 分支直接接受。独立公共会话反例 `]foo@bar.baz\n` 因而产生 `foo@bar.baz` link mark，尽管 `]` 不是允许的分隔符。共享匹配器使错误同时进入 parser、ledger 与后续 owner 操作；14 例 oracle 未覆盖此边界。应让邮箱/协议邮箱复用同一起点约束，并补不允许标点与允许分隔符的对照。

Missing/partial：0。Scope creep：0。Wrong：1。真实 UI/物理 IME/Sandbox/macOS 14+ 的明确延期未重报为代码缺陷。
