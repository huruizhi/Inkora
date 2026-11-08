# CROSS-VALIDATION：fidelity 原型 × INK-PROT-002 冻结样稿

交叉核验日期：2026-11-08。输入为本工作区已接入的审计样稿，固定来源 `484ee81d924efd2a1038e8421b146f4ae5d5b743`，只读且未修改预期。本轮组合真实链接语义与源码选区接线；02/10 边界见 `BOUNDARY-EVIDENCE.md`，03 见 `REFERENCE-EVIDENCE.md`，09 见 `INTEGRATION-SELECTION-EVIDENCE.md`。

## 方法

- `crossval.mjs` 用 jsdom 载入本工作区最终 `PROTOTYPE.html` bundle。
- 02/10 打开走真实按钮；其它用例走 `sourceEdit` 建基线。可视编辑走 `EditorView.dispatch`；源码编辑走 textarea input + `TextAreaEditorKernel`；历史/保存走真实 actions。
- case03 载入后先断言真实 PM link marks、DOM `a[href]`、heading、裸 URL 普通文本、image span 且无 `img`；不以字面源码叶作为通过条件。
- case09 对内容锚点、方向、后向选区和 Cancel 作真实断言，不写死 PM 偏移。
- 每步完成后才读取预期文件并比较全文 SHA-256；预期字节不喂入模型。`refsKept` 比较引用定义行逐字节不变。
- jsdom 不是 WKWebView/IME/磁盘验收；`to_disk` 只以内存保存点近似。

## 本次指定组合结果

| 用例 | 结果 | 说明 |
| --- | --- | --- |
| 02 保护片段空白 | PASS | 真实 `openMixed`；3 步 SHA exact、`fragsKept=true`、BOM 保留 |
| 03 引用式链接 | PASS | 真实 link/image DOM/model；3 步 SHA exact + 保存，逐步 `refsKept=true` |
| 09 source selection | PASS（jsdom） | 步1–5 字节/内容锚点/方向通过；补充后向选区和 Cancel 通过 |
| 10 open-malformed | PASS | 打开观察、保存阻断、源码修复、内存重开通过；未执行真实磁盘 |
| 10 create-ambiguity | PASS/OBSERVED | 步1–3 通过；步4 只记录真实分类 |

## case03 全链

输入 475B，SHA-256 `7dd2d074e44cca9c1f3dcedc38af29d13debd0697ba4bd0f7e59b8299703f223`。

| 步 | 操作 | 实际 SHA-256 | 结果 |
| --- | --- | --- | --- |
| 1 | link 显示文字 `Inkora 文档`→`Inkora 手册` | `d9033db6a06e4f782239229a9cfb2d37f5de2d571e9bc64fd0ce6728c1624a0c` | PASS，`refsKept=true` |
| 2 | image placeholder alt `图标`→`图示` | `7450c1259be4f65c8d0c58efc4f1f08d9a10aca2e19078fa72d03369ee54738f` | PASS，`refsKept=true` |
| 3 | 专用 `linkTarget` 将行内 href 改为 `.../inkora-v2` | `4b5bfa9e8924e367fb0b6b96853915fb4e0569566fae251b8aa6b07d93d8e99d` | PASS，DOM href 更新，`refsKept=true` |
| 4 | 内存保存点 | 同上 | PASS，dirty=false，`refsKept=true` |

载入语义证据：5 个 link marks/anchors 分别显示 `Inkora 官网`、`Inkora 文档`、两个 `inkora-doc` 和尖括号 URL；href/title 与定义一致；heading 为 `链接保真`；裸 URL 不是 anchor；图片为 `SPAN`，精确原文占位 `![图标][inkora-icon]`，href `/assets/icon.png`，没有 `IMG`。

## 02 / 09 / 10 明细

- 02：真实按钮载入字节与样稿一致；保存、正文修改、尾段修改均 PASS，数学围栏、注释/脚注、callout 原字节不变。
- 09：PM 光标进入源码后落在同一内容锚点；真实输入“锚点”提交到新文档；Undo/Redo 同时恢复字节与选区；后向 PM 选区映射为 backward textarea 选区，Cancel 保留可视选区。
- 10 open-malformed：问题范围标注、非源码模式、不置 dirty、保存阻断、源码闭合修复和内存重开均 PASS。
- 10 create-ambiguity：正文修改、含混缓冲保留/pending/save disabled、源码修复保存均 PASS；末步追加闭合 `$$` 后尾段被归入 protected block，只记 OBSERVED。

## 保留的非 PASS 与反例

- 全量旧驱动中 01/04/07/08 仍通过；05 的序列仍缺 removeMark/行内代码定界符重写能力，06/11 的单换行结构 split 与 PM 目标不等价。本任务不把这些输出升级为新产品 oracle，也不实现其原生桥接。
- 审计驱动会按审计后 oracle 重放 05/结构/空文档/11；其 NOT_PASS 是预期的真实差异，详见 `DRIVER-AUDIT.md`、`audited-crossval-results.json` 与 `COMBINED-EVIDENCE.md`。
- `[a](later)later` 目标/正文碰撞和转义显示文字仍安全拒绝并阻断保存；不宣称通用 inline map 完成。
- 真实 WKWebView、系统中文 IME、磁盘写入/重开、Sandbox 与图片资源访问未执行。

结论：case03 真实链接语义与 09 源码选区闭环在同一最终 bundle 中通过，02/10 无回归；这仍不是 M0 结论。
