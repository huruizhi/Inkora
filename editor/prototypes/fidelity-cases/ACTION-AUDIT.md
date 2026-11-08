# ACTION-AUDIT：INK-PROT-016 case 11 视觉动作语义再审

基线：`484ee81d924efd2a1038e8421b146f4ae5d5b743`。范围仅为 case 11 的 oracle 动作、独立证据和新增预期；未读取 `fidelity/model.ts`、`fidelity/main.ts`、HTML、crossval、results 或其他执行 Agent 输出，未运行桌面原型。证据脚本只读取冻结 `input.md`，不读取任何 expected 文件，也不把程序输出解释为 WKWebView、键盘事件或 IME 结果。

## 结论

原 `visual-split` 步骤 1 的**三段字节目标正确但动作不充分**。在生产 schema/markdown-codec 创建的文档上实跑锁定的 `prosemirror-state@1.4.4` 与 `prosemirror-commands@1.7.2`：

1. 在第 2 行句号后、原 softbreak 前执行一次 `splitBlock`，再 `insertText("插入为独立段落。")`，只得到两个受影响 paragraph；第二个 paragraph 是 `插入为独立段落。\n第三行回到 LF。`。
2. 要得到冻结三段目标，在相同光标处还需第二次 `splitBlock`；此时原 softbreak 移到第 3 段开头，必须再执行一次 forward Delete（删除光标后的字符；macOS 通常为 Fn+Delete），删除且只删除该 softbreak。
3. 因此 `visual-split` 的明确复合动作是 `Enter → 输入 → Enter → forward Delete`。其既有字节文件、ops、bytes、sha256 全部保持不变。
4. 新增 `single-enter` 变体，保留 `Enter → 输入` 的真实两段语义，并独立覆盖尾段的一次 Enter。

在“光标不另作选择、输入仅为给定文本、结构动作使用 `splitBlock`”的操作词汇内，上述复合动作是达到旧目标所需的最小序列：一个 paragraph 变成三个至少需要两次 split；两次 split 后原 softbreak 仍存在，而冻结目标没有该字符，所以还需要一次单字符删除。Delete 不能省略或无说明地把原换行吞掉。

## 可重复证据

运行：

```bash
pnpm --dir editor exec vitest run prototypes/fidelity-cases/action-audit.test.ts --reporter=verbose
```

脚本使用生产 `parseMarkdown`、独立 `EditorState`、真实 `splitBlock`/`insertText`/transaction delete，并用锁定的 `markdown-it@14.3.3` CommonMark preset 复核源字节结构。每个派生源再次经生产 parser 解析，完整 PM JSON 必须与命令执行后的 PM JSON 相等。

### 步骤 1：single-enter

命令后受影响节点 JSON 与选区：

```json
{
  "content": [
    {
      "type": "paragraph",
      "content": [{
        "type": "text",
        "text": "混合换行文档第一行 LF 结尾。\n第二行使用 CRLF 结尾。"
      }]
    },
    {
      "type": "paragraph",
      "content": [{
        "type": "text",
        "text": "插入为独立段落。\n第三行回到 LF。"
      }]
    }
  ],
  "selection": { "anchor": 42, "head": 42 }
}
```

- PM：2 个受影响 paragraph；原 softbreak 保留在第二个 paragraph 内。
- CommonMark：受影响区域 2 个 paragraph；全文件顶层 `paragraph_open` 为 3（另一个是尾段；列表内 paragraph 不计入顶层）。
- 派生文件：201B，sha256 `9b28e5830da2d0e01a8484aba818e85f4bba103d5e2256e245f98f4eff3d40f7`。
- 局部字节：`第二行…\r\n第三行…` → `第二行…\r\n\r\n插入为独立段落。\r\n第三行…`。前两个 CRLF 是结构分隔，第三个 CRLF 是保留下来的原 softbreak。

步骤 2 在尾段执行一次 `splitBlock` 并输入后，末尾节点为两个 paragraph：`尾段 LF 结尾。` / `新尾段 LF。`；选区 `anchor=head=105`，全文件顶层 paragraph 为 4。派生文件 218B，sha256 `ded79639a6cb1dda69d6c117e3a34f2364471a9345add4193425cfbb319e927e`。

### 步骤 1：visual-split 复合动作

命令序列为 `splitBlock → insertText → splitBlock → delete(from, from+1)`；删除前脚本断言该一个字符恰为 `\n`。命令后受影响节点 JSON 与选区：

```json
{
  "content": [
    {
      "type": "paragraph",
      "content": [{
        "type": "text",
        "text": "混合换行文档第一行 LF 结尾。\n第二行使用 CRLF 结尾。"
      }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "插入为独立段落。" }]
    },
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "第三行回到 LF。" }]
    }
  ],
  "selection": { "anchor": 44, "head": 44 }
}
```

- PM：3 个受影响 paragraph，原 softbreak 已由明确 Delete 删除。
- CommonMark：受影响区域 3 个 paragraph；全文件顶层 `paragraph_open` 为 4（另一个是尾段）。
- 步骤 2 后末尾仍是两个独立 paragraph，选区 `anchor=head=106`，全文件顶层 paragraph 为 5。
- 生产 parser 对冻结 `visual-after-step-1.md` 语义的独立派生源与命令后完整 PM JSON 相等。

## EOL 原始范围与局部吸收边界

范围均为 UTF-8 字节半开区间 `[start,end)`。冻结输入共 173B、8 个 EOL：

| 序号 | 原始范围 | 样式 | 说明 |
| --- | --- | --- | --- |
| 1 | `[40,41)` | LF | 第 1→2 行 softbreak |
| 2 | `[71,73)` | CRLF | 第 2→3 行 softbreak；唯一允许被步骤 1 局部重组的原边界 |
| 3 | `[94,95)` | LF | 第 3 行之后 |
| 4 | `[95,97)` | CRLF | 列表前空行 |
| 5 | `[122,124)` | CRLF | 列表项 1→2 |
| 6 | `[150,152)` | CRLF | 列表后 |
| 7 | `[152,153)` | LF | 尾段前空行 |
| 8 | `[172,173)` | LF | 原尾部换行 |

single-enter 步骤 1 的 EOL 范围为 `[40,41)` LF、`[71,73)`/`[73,75)`/`[99,101)` CRLF、`[122,123)` LF、`[123,125)`/`[150,152)`/`[178,180)` CRLF、`[180,181)`/`[200,201)` LF。局部三个 CRLF 中最后一个承载原 softbreak 语义。

visual-split 步骤 1 的 EOL 范围为 `[40,41)` LF、`[71,73)`/`[73,75)`/`[99,101)`/`[101,103)` CRLF、`[124,125)` LF、`[125,127)`/`[152,154)`/`[180,182)` CRLF、`[182,183)`/`[202,203)` LF。原 `[71,73)` softbreak 在 PM 复合动作中经 split 位移后被 Delete；源 oracle 将局部整体序列化为两个 CRLF 空行。manifest 的唯一 `find→replace` 证明该局部之外的字节不变。

尾段步骤只把原 `尾段 LF 结尾。\n` 替换为 `尾段 LF 结尾。\n\n新尾段 LF。\n`：结构分隔新增一个 LF，原尾部换行仍存在于文件末尾。

## 冻结 visual-split 目标未改证明

基线与当前文件 sha256 相同：

| 项目 | 基线 / 当前 sha256 |
| --- | --- |
| `visual-after-step-1.md` | `8578d9dfc3a6d4b8a9aadd2ce26e335410755d9909f42820ff6c33b7332374c8` |
| `visual-after-step-2.md` | `61aca3d39289c0e2d83b21a4465ca7249076de9d413ec7372c014a59f172be8d` |
| 两步 `{n,ops,expect}` 的 canonical JSON | `99b933e4e9367312b2a895f80a08d6992d659ba5cd755397b57ba246386979c9` |

因此本次只修动作口径，未为追随实现改写旧字节 oracle。

## 仍有歧义与边界

- ProseMirror 模型不携带 LF/CRLF 来源；EOL 继承与原范围映射仍是 oracle 的源保真规则，本审计用 ops 与生产/CommonMark 解析证明结果结构一致，未声称生产保存实现已经支持该映射。
- 浏览器实际 Delete 键是否走原生输入还是命令链、混合 EOL 文件是否允许进入视觉模式，均需产品/WKWebView 人工交叉核验。本证据只证明模型动作可达性。
- PM 选区数字是锁定 schema 和 fixture 下的 UTF-16 文档位置，不是桌面坐标，也不是 IME/composition 证据。
- 未执行或宣告 M0 产品通过；源码占位、原型能力与本 oracle 审计完成与否分开记录。
