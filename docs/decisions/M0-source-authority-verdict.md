# M0 原文权威路线：有界可行性裁定

2026-11-09，管理者按原04五项门槛及029冻结契约逐项核对，结论为：**有界路线通过，进入生产迁移**。首阶段产品尚未完成，不能对外宣称Typora常用功能已齐备。

| 原门槛 | 可复核证据 | 裁定范围 |
| --- | --- | --- |
| 局部字节、Unicode/EOL/非规范格式 | 030 frozen oracle c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08；036最终11回归、10集成域、PRIMARY8/8、repeat13/13、Enter3/3；独立case04/05真实EditorView累计字节与冻结文件全等，fixture582检查通过 | 原文补丁/锚点/历史边界可行，不承诺全Markdown映射 |
| 高级片段混排 | 031/034固定7aaa2e7f7ff7，中文前后正文、保护数学片段及字节；自动protected-neighbor覆盖 | 高级原文片段不要求整篇切源码，不代表公式等完整渲染 |
| 主动源码/选区/dirty/历史 | 030自动主链及031真实WK；034 H2直接中文选区替换Undo/Redo；H3源码删除后中文输入、Apply单文档历史、跨模式Undo/Redo与内存保存点 | H3真实变体保留，未把原追加断言false改成true；不是NSDocument文件保存 |
| 含混与恢复 | 031 U1真实未闭合数学→保存拒绝→主动修复→Undo含混/Redo安全；源码草稿和真实拒绝控制 | 保留原文、候选与可信视图；不整篇自动源码 |
| 真实WK与物理中文 | 031连续两次上屏/历史；034 H1物理Esc53、deleteCompositionText和空compositionend，原文/有向选区/past/future恢复，Redo仍可用；H2/H3用户物理搜狗操作及独立日志 | 自动重放、CUA输入、真实物理IME分别报告 |

固定提交与证据：

- 原型030最终基础：`493e2b7cdbe982da02f4747e89a0cf52df3a770f`；宿主031：`52cfa06375880fb2b566dbc58a14b959a80c1330`，原始U1/真人资料保持冻结。
- 真人034：`90d6135`，分支 `task/INK-PROT-034-m0-remaining-acceptance`，`editor/prototypes/fidelity/native-host/INK-PROT-034-EVIDENCE/`。H1日志SHA `8abe40be087da84c5c0f3f059ab876db81a57a6efb838267ff0e5d87e08b90e6`；H2/H3日志SHA `b2b43edf54b420a8c15aa9b8c067d65f8a4785b72083a9687feccc844f881537`。
- EOF补正最终：`d3ee3f0`，分支 `task/INK-PROT-036-eof-review`，`editor/prototypes/source-authority/evidence/INK-PROT-036-review/`。source SHA `ce8e3800fb7ad1dbf2f4d405ac255e6826c1ccf54ece46804cbcd40025cdb808`，WK bundle `c62466a08ced7527f700f88328d7ca07569a92ddf2921bd5cbd6213259cc291c`。

## 曾失败、已修正与未证明

合法尾随空格无法保存/源码进入使027未通过，故比较并验证统一原文权威；没有降低原门槛。034准备时发现EOF锚点续写拒绝，最小真bundle红例可重跑。036初稿27213dd虽保留字节，却隐藏了真实softbreak，独立语义红例失败，未被采纳。最终用受限输入意图证明建立真实语义投影，字节/语义两个红例均转绿，真实WK源码EOF→EditorView事务→保存/Undo/Redo/no-op/新epoch投影一致。

034此前quxiao上屏与用户“Esc未变”报告不一致，未确定原因，记录原样保留。后续linshi对照的本机Esc原生键码及WK取消链明确通过；没有宣称对前一差异做了确定修复。

最终EOF补正只影响已接受raw EOF+末行尾续写分支。031/034物理路径未命中该分支，证据按各自bundle保留；新EOF的composition证据仍为synthetic，未谎称新bundle全面物理重跑。该边界及inclusive strong末尾继承冲突进入生产V1验收，不掩盖为通用语法已完成。

完整NSDocument写入/重开/失败恢复、图片授权迁移、最低macOS14、VoiceOver、长文性能、表格/任务/图片交互、高亮、可视搜索及发布均属于生产交付门槛。Node scratch真读写、HTML内存保存点和037图片沙盒试验不能替代它们。

用户此前“测试正确，继续推进”的整体审阅及本轮明确取消/替换/源码输入反馈已纳入；采用路线由管理者在既有授权内决定，不重复索要相同确认。下一步为ADR-0004下的有限生产纵向实施。
