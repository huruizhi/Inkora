# CROSS-VALIDATION：fidelity 原型 × INK-PROT-002 冻结样稿

交叉核验日期：2026-11-08。样稿 worktree 固定为 `c85e1890b2ef3938dd6853d97977d28ac54b309e`，只读且未修改预期。本轮是 INK-PROT-009 真实链接语义复测；本分支未合并 010 `713e922`。

## 方法

- `crossval.mjs` 用 jsdom 载入真实 `PROTOTYPE.html` bundle。
- 打开走 `sourceEdit` 或 02/10 的真实按钮；可视编辑走 `EditorView.dispatch`；源码编辑走 textarea + `TextAreaEditorKernel`；保存只更新内存保存点。
- case03 在载入后先断言真实 PM link marks 与 DOM `a[href]`、heading 文字、裸 URL 普通文本、image span 且无 `img`；不以字面源码叶作为通过条件。
- 每步操作完成后才读取 `after-step-N.md` 并比较全文 SHA-256；预期文件从不喂给模型。`refsKept` 比较引用定义行是否逐字节不变。
- jsdom 不是 WKWebView/IME/磁盘验收；`to_disk` 只以内存保存点近似。

## 结果

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| 01 中文/emoji | PASS | 步1–3 SHA exact，步4 observed |
| 02 保护片段空白 | PASS | 真实 `openMixed`；3 步 SHA exact、`fragsKept` |
| 03 引用式链接 | PASS | 真实 link mark/DOM；3 步 SHA exact + 保存，逐步 `refsKept=true` |
| 04 task CRLF | PASS | 2 步 byte-exact；仍无 checkbox 控件 |
| 05 marks/attrs | FAIL/BLOCKED | 旧序列依赖 removeMark；行内代码定界符重写未实现，本轮不处理 |
| 06 split/join | ERROR | 旧动作以单换行配 PM split，重解析不等价；不是本轮 oracle |
| 07 Undo/Redo | PASS | 6 步 SHA/state-ref exact |
| 08 source format dirty | PASS | no-op、格式修改、Undo 均通过 |
| 09 source selection | 字节 PASS | 只执行步骤2/4/5；本分支不含 010，不能宣称选区通过 |
| 10 open-malformed | PASS | 打开观察、保存阻断、源码修复、内存重开通过 |
| 10 create-ambiguity | PASS/OBSERVED | 步1–3 通过；步4 只记录分类 |
| 11 mixed EOL split | ERROR | 与 06 相同的旧单换行动作差异；不是本轮 oracle |

## case03 全链

输入 475B，SHA-256 `7dd2d074e44cca9c1f3dcedc38af29d13debd0697ba4bd0f7e59b8299703f223`。

| 步 | 操作 | 实际 SHA-256 | 结果 |
| --- | --- | --- | --- |
| 1 | link 显示文字 `Inkora 文档`→`Inkora 手册` | `d9033db6a06e4f782239229a9cfb2d37f5de2d571e9bc64fd0ce6728c1624a0c` | PASS，`refsKept=true` |
| 2 | image placeholder alt `图标`→`图示` | `7450c1259be4f65c8d0c58efc4f1f08d9a10aca2e19078fa72d03369ee54738f` | PASS，`refsKept=true` |
| 3 | 专用 `linkTarget` 将行内 href 改为 `.../inkora-v2` | `4b5bfa9e8924e367fb0b6b96853915fb4e0569566fae251b8aa6b07d93d8e99d` | PASS，DOM href 更新，`refsKept=true` |
| 4 | 内存保存点 | 同上 | PASS，dirty=false，`refsKept=true` |

载入语义证据：5 个 link marks/anchors 分别显示 `Inkora 官网`、`Inkora 文档`、两个 `inkora-doc` 和尖括号 URL；display 不含引用定界符；href/title 与定义一致；heading 为 `链接保真`；裸 URL 不是 anchor；图片为 `SPAN`，精确原文占位 `![图标][inkora-icon]`，href `/assets/icon.png`，没有 `IMG`。

## 02 / 10 回归

- 02：真实按钮打开的内嵌字节与样稿相同；保存、正文修改、尾段修改 3 步均 PASS，保护片段逐字节不变。
- 10 open-malformed：问题范围标注、非源码模式、未置 dirty、保存阻断、源码闭合修复和内存重开均 PASS。
- 10 create-ambiguity：正文修改、含混缓冲保留/pending/save disabled、源码修复保存均 PASS；末步归类只记 OBSERVED。

## 保留的边界

- 05/06/11 的非 PASS 与交接一致：旧驱动、旧序列或本轮未实现能力，不升级为新的产品 oracle。
- 09 只有字节证据；本分支没有 010，因此不作 selection 通过主张。
- `check.mjs` 另记录通用 inline ledger 反例：目标 URL 与后续正文同文、转义显示文字。两者安全拒绝并阻断保存，不用整段源码化换取通过。
- 真实 WKWebView、系统中文 IME、磁盘写入/重开、Sandbox 与图片资源加载均未执行。

结论：case03 在真实 link 语义下完整通过，02/10 无回归；这仍不是 M0 结论。
