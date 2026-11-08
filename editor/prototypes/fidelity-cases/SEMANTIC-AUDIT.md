# SEMANTIC-AUDIT：INK-PROT-004 独立样稿语义审计

基线：`c85e1890b2ef3938dd6853d97977d28ac54b309e`（本分支起点）。审计仅依据冻结规范（`docs/markdown-support.md@57aeaac`、`docs/block-editing.md`）、用户已确认的 M0 目标与 CommonMark 官方规范（0.31.2）；未读取 INK-PROT-001 原型代码或其输出，不存在迎合实现。独立解析证明使用主 repo 已安装的 `markdown-it@14.3.3`（只读复用，`commonmark` 预设，与项目锁定版本一致），仅作解析器证据，不作为 oracle 的生成器。

## 1. 用例 06 步骤①：视觉模式段内 Enter「拆分段落」

### 旧动作 / 旧预期

- 动作：视觉模式光标置于第一段「拆分点」后按 Enter **拆分段落**。
- 预期：仅插入 1 个 CRLF（`拆分点\r\n在句中`，135B）。

### 官方来源

- CommonMark 0.31.2 §Paragraphs：「a paragraph is a run of consecutive non-blank lines」+「paragraphs are separated by one or more blank lines」——段落边界必须是空行；单个换行只是段内 **softbreak**（§Soft line breaks），不产生新段落。
- 冻结规范 `docs/block-editing.md`：「相邻 paragraph 由后续 Enter / 光标命令创建」——视觉模式 Enter 的产品语义是创建新 paragraph（块级），不是段内软换行。

### 独立解析证明（markdown-it commonmark，实测输出）

| 输入 | 顶层块 | inline 子节点 |
| --- | --- | --- |
| `…拆分点\r\n在句中…`（旧预期字节） | **1 个** `paragraph_open` | `text, softbreak, text`（同段落软换行） |
| `…拆分点\r\n\r\n在句中…`（新预期字节） | **2 个** `paragraph_open` | `text` |

结论：**真正的新段落必须空行分隔**（连续 2 个 EOL）。旧预期单 CRLF 与「拆分段落」的动作语义自相矛盾——它解析后仍是同一段落。

### 决定

- main 变体步骤① oracle 改为插入 CRLF 空行：`拆分点\r\n\r\n在句中`（137B，sha256 `b1f83163…`），两个新边界均继承 CRLF（EOL-002）；步骤②合并回删空行，往返 sha256 仍与输入一致（不缩减原往返目标）。
- 原「单 CRLF」字节覆盖**不删除**，改为新 `softbreak` 变体：源码模式段内插入单个 CRLF（继承 EOL-002）→ 删除合并回（state-ref 指向 input）。动作明确标注「CommonMark 下结果仍是同段落 softbreak，不是新段落」。
- 步骤③④（列表）**未改**：按冻结规范 `block-editing.md`「列表中的 Enter 续写 item」+ 第 5 节归一化规则，新列表项 `- ` + 单 CRLF 是正确序列化（markdown-it 实测：`- 项目一内容衔接点\r\n- 在末尾\r\n- 项目二` 解析为单一 `bullet_list`，无空行需求）；懒延续回退条款原样保留。

### 为何不属于迎合原型

本审计未接触原型任何输出；改动的唯一依据是 CommonMark 官方段落/softbreak 规则 + markdown-it 独立解析 + 冻结产品规范对视觉 Enter 的定义。修改使 oracle **更严**（要求空行、禁止以单 CRLF softbreak 冒充段落拆分），并同时保留原有单 CRLF 字节判据于 softbreak 变体，未缩减任何历史/畸形/EOL 保护目标。

## 2. 用例 11：Enter 插入行的模式语义

### 旧动作 / 旧预期

- 动作：「光标置于行尾，按 Enter 并输入…」，`mode: "either"`，未区分 source/visual、也未区分软换行与段落拆分。
- 预期：单换行继承局部 EOL（CRLF 步 / LF 步）。

### 官方来源与证明

- 同上：单换行 = softbreak（markdown-it 实测 `第二行使用 CRLF 结尾。\r\n插入行继承 CRLF。` → 1 个 paragraph，inline 含 softbreak）；视觉 Enter 创建新 paragraph 则须空行。
- `EOL-002`：新插入换行继承当前行样式；`EOL-004`：尾部换行不得增删。
- 新 visual-split 预期实测：`…第二行使用 CRLF 结尾。\r\n\r\n插入为独立段落。\r\n\r\n第三行回到 LF。` → **3 个** `paragraph_open`；`尾段 LF 结尾。\n\n新尾段 LF。` → **2 个** `paragraph_open`。

### 决定（拆分动作语义，字节覆盖不缩水）

- main 变体：字节/ops/sha **原样保留**（源文单换行继承局部 EOL 的字节覆盖不变），但 `mode` 改为 `source`，动作明确「单个换行；同段落 softbreak，不是新段落」，模式判据明确「不得以本步源码结果冒充可视编辑」。
- 新增 `visual-split` 变体（mode: visual，**不可降级**）：
  - ①「第二行使用 CRLF 结尾。」行尾视觉 Enter 创建新段落并输入「插入为独立段落。」：第 2 行后与插入段后各插 1 空行，4 个新边界继承 CRLF（EOL-002）；原第 2→3 行 CRLF 边界被段落重组吸收，其余原始边界不变。203B（sha256 `8578d9df…`）。
  - ② 尾段行尾视觉 Enter 创建新段落「新尾段 LF。」：2 个新边界继承 LF，原尾部换行保持（EOL-004）。220B（sha256 `61aca3d3…`）。
  - 模式判据：若原型按 EOL-001 现状对混合 EOL 整篇源码、无法执行视觉 Enter，记「现状差异、未执行」，**不得**以源码单换行结果（main 变体字节）冒充通过——视觉要求没有被降成源码编辑。

### 为何不属于迎合原型

拆分后两套判据各自独立成立：源码字节覆盖逐字节不变；视觉判据按 CommonMark + 冻结规范推导出更明确的空行/继承要求，且明确禁止用源码路径的通过掩盖可视编辑缺失。

## 3. 用例 01：emoji 长度说明与实际字节

### 旧说明（错误）

- README/manifest：「25B→20B，UTF-16 单元 14→8」。

### 实测（Python 3 对文件字节与字符串计算，非生成器逻辑）

- 👨‍👩‍👧‍👦（家庭）：7 个 Unicode 标量 / 25 字节 / **11** 个 UTF-16 单元（4 emoji ×2 + 3 ZWJ ×1）。「14」为臆算错误。
- 🧑‍🤝‍🧑（两人牵手）：5 个标量 / **18** 字节 / 8 个 UTF-16 单元（`f09f 91b1 e280 8d f09f 919d e280 8d f09f 91b1`，与 after-step-2.md 实际字节一致；273−266=7=25−18 自洽）。「20B」错误。
- 🇨🇳→🇯🇵：各 2 标量 / 8 字节 / 4 UTF-16 单元，原说明无误。

### 决定

仅修正**说明/metadata 文本**（README 步骤说明与高价值边界 #1、manifest 步骤② `edit_scope` 与 `acceptance` 措辞）为实测值 25→18 字节、7→5 标量、11→8 UTF-16；**所有字节预期、ops、sha256 一律未动**（原本就与实际文件一致）。

### 为何不属于迎合原型

纯文档纠错，oracle 字节零变化，数值来源为对样稿文件的独立 Python 计算。

## 修改文件清单

- `editor/prototypes/fidelity-cases/cases.json`：01 说明修正；06 main 步骤①②重写为空行段落拆分/合并；06 新增 `softbreak` 变体；11 main 两步改 `mode: source` 并明确语义；11 新增 `visual-split` 变体。
- `editor/prototypes/fidelity-cases/cases/06-split-join/after-step-1.md`：改为空行版本（137B，重写）。
- `editor/prototypes/fidelity-cases/cases/06-split-join/softbreak-after-step-1.md`：新增（原单 CRLF 135B 字节原样保留）。
- `editor/prototypes/fidelity-cases/cases/11-mixed-eol-insert/visual-after-step-1.md`、`visual-after-step-2.md`：新增。
- `editor/prototypes/fidelity-cases/README.md`：01/06/11 说明、高价值边界 #1、新增自校验记录。
- 本文件。

未改动：06 步骤③④、其余 8 个用例、verify.py、任何字节判据的既有保护要求（历史 state-ref、畸形阻断、BOM/尾部换行等）。

## 实际运行结果

```text
$ python3 editor/prototypes/fidelity-cases/verify.py
用例: 11  步骤: 47 (byte-exact 34 / state-ref 8 / operational 5)
检查通过 557 项，失败 0 项
全部通过
exit=0
```

- JSON 解析：`python3 -c "import json;json.load(open('…/cases.json'))"` 通过（11 用例）。
- 字节/语义检查：Python 独立计算 emoji 三种长度并与文件字节比对；markdown-it@14.3.3（commonmark）对 06 单 CRLF（1 段+softbreak）/空行（2 段）、06 列表（单 bullet_list）、11 visual-split 步骤①（3 段）/②（2 段）解析结果如上表。
- 未执行：原型内人工交叉核验（打开样稿逐步操作）、桌面/产品测试——按任务边界不在本任务执行。
