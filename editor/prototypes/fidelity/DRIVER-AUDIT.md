# Audited Driver 审计报告

## INK-PROT-018 当前结果（2026-11-08）

当前 driver 已升级为 schemaVersion 2，基线 `30b73530af2e8dac37399a0dc9df64f8a9689eb3`。执行结果为 **PASS**，但只表示隔离原型中本次矩阵通过，不表示 M0、生产架构、桌面、WKWebView、IME 或磁盘保存通过。

- 16 个累计步骤全部 PASS：05/main 4、06/main 4、06/softbreak 2、11/main 2、11/visual-split 2、11/single-enter 2。
- `EXPLICIT_PATCH_DEMO=0`。05 四步由 driver 只构造真实 PM transaction 并交给 `EditorView.dispatch`；source patch 全由 model/native bridge 基于当前 source 元数据推导。
- 06 main 的 Enter/Backspace 与列表 split/join 由 jsdom DOM `keydown` 进入真实 keymap/command；三个冻结前置状态的 isolated 分支也 PASS。
- 11 visual-split 按新 016 动作执行 Enter→输入→Enter→forward Delete；single-enter 单独执行。expected 仍只在动作完成后读取；当前不再把旧 484 歧义结论应用到新 5d02043 fixture，`oracleActionAmbiguity=0`。
- 空文档 `中文😀` visual 输入、选区、dirty、Undo/Redo PASS；`[a](later)later` 原生修改被安全拒绝且 source/doc 不变；CRLF/LF 实际局部 patch ranges PASS。
- runner error、FAIL、UNSUPPORTED、BLOCKED_BY_PREVIOUS 均为 0。结果固定在 `audited-crossval-results.json`。

执行层：

- `EDITORVIEW_DISPATCH_PM_TRANSACTION`：05 marks/attrs；普通 PM transaction，不向 model 提供 patch。
- `VISUAL_KEYDOWN`：06 Enter/Backspace/list commands。
- `VISUAL_KEYDOWN_AND_VIEW_DISPATCH`：11 Enter/Delete 为 keydown，jsdom 不生成浏览器 beforeinput，文字由真实 PM `insertText` dispatch。
- `SOURCE_INPUT_KERNEL`：06 softbreak、11 main，仍走 textarea `input` 与生产 `TextAreaEditorKernel`。
- `VIEW_DISPATCH`：空文档与安全拒绝 probe。

driver 从不读取或执行 `manifest.ops`；expected 在动作后读取。每步记录 source SHA/bytes、selection、dirty、revision、history、pending/blocked/staged 与实际 patch ranges。原型 `to_disk` 始终只是内存保存点。

复现：

```sh
node --check editor/prototypes/fidelity/audited-crossval.mjs
node editor/prototypes/fidelity/audited-crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html \
  editor/prototypes/fidelity/audited-crossval-results.json
```

完整 native bridge、空结构暂存、EOL 与环境边界见 `NATIVE-TRANSACTION-EVIDENCE.md`。

## INK-PROT-012 / 015 历史报告（已被上节当前结果取代）

以下内容原样保留当时的 NOT_PASS、explicit demo 与旧 484 动作歧义证据，用于历史追溯；不得继续作为新 5d02043 fixture 或当前 bundle 的状态结论。

## 结论

本次交付完成了可独立重跑的 audited driver，但原型目标结果为 **NOT_PASS**，不表示 M0 通过。

- runner 自身错误：0。
- 原生 source 路径：4 步通过。`06/softbreak` 的插入/删除及 `11/main` 的 CRLF/LF 局部插入均经 textarea `input`、生产 `TextAreaEditorKernel` 与 `actions.apply` 实际执行，逐字节命中 oracle。
- `05/main`：4 步均按完整累计顺序得到预期字节，但执行层是 `EXPLICIT_PATCH_DEMO`。它们使用真实 PM 事务加显式 source patch，只证明模型事务与补丁配对后可表达结果，不算原生 UI/命令能力。
- `06/main`：真实 `keydown Enter` 在步骤 1 被模型以“结构/marks 事务需使用专用演示操作”阻断；步骤 2–4 因累计前置失败记为 `BLOCKED_BY_PREVIOUS`。另以冻结中间态分别隔离执行步骤 2、3、4，三步同样被模型阻断，均为目标 `FAIL`，不是 runner 错误。
- `11/visual-split`：真实 `keydown Enter` 在步骤 1 被同一结构事务限制阻断；步骤 2 记为 `BLOCKED_BY_PREVIOUS`。
- 空文档 visual 普通输入：`view.dispatch(tr.insertText(...))` 已实际执行，模型因“选区不能安全映射到原文（空段、转义或重复文本）”拒绝提交，记为 `FAIL`。INK-PROT-010 的空文档 source 提交回退没有覆盖此 visual 输入路径。
- 原型的 `to_disk` 仅代表内存保存点；driver 不访问或保存用户文件。

固定结果见 `audited-crossval-results.json`。汇总为：4 `PASS`、4 `EXPLICIT_PATCH_DEMO`、2 累计链 `FAIL`、4 `BLOCKED_BY_PREVIOUS`、3 隔离分支 `FAIL`、1 空文档探针 `FAIL`、1 `ORACLE_ACTION_AMBIGUITY`；runner 退出码为 1。

## 审计边界与防迎合措施

driver 只读取 `cases.json` 的用例、变体、动作说明、模式和预期文件元数据，从不读取或执行 `manifest.ops`。每个动作由冻结动作语义独立实现；expected 文件只在动作实际执行完毕后读取并逐字节比较。

执行层明确分为：

- `SOURCE_INPUT_KERNEL`：进入 source mode，控制 textarea 光标，派发真实 `input`，再走 `actions.apply`。
- `VISUAL_KEYDOWN` / `VISUAL_KEYDOWN_AND_VIEW_DISPATCH`：向真实 EditorView DOM 派发 Enter/Backspace；只有 Enter 成功后才允许继续派发文字事务。
- `VIEW_DISPATCH`：空文档普通 visual 输入探针。
- `EXPLICIT_PATCH_DEMO`：显式调用 `model.apply(patches, tr)`，永不计为 native pass。

累计链一旦出现目标 `FAIL`、`UNSUPPORTED` 或 runner 错误，后续步骤不再使用错误状态继续判定，而是记为 `BLOCKED_BY_PREVIOUS`。对 06 后续结构步骤另建预置分支研究，结果只标为 isolated，不回填累计链。

每步固定记录动作、声明模式、实际模式、执行层、是否实际执行、前后 SHA/字节、expected SHA/字节、首个字节差异、selection、dirty、revision、history、pending 与 blocked。结果中的路径为本次执行解析后的绝对路径；默认资源定位基于 `import.meta.url`，不依赖 `process.cwd()`。

## 11 visual-split 动作歧义证据

冻结步骤 1 的文字是“一次 Enter 创建新段落，并输入文字”，但冻结 expected 要求受影响区域成为三个 paragraph：原前两行、插入段、原第三行。

driver 在独立状态中对真实 PM 文档执行一次 `splitBlock`，随后执行一次 `insertText`。实际 PM 结构的前两个块为：

1. `第一行 + softbreak + 第二行`
2. `插入文字 + softbreak + 第三行`

也就是一次 Enter 加输入只形成两个受影响 paragraph；要让插入文字成为独立第三块，还需要另一个结构动作。对应字节反例为 201B、SHA-256 `9b28e583…`，CommonMark 全文解析为 3 个 paragraph（含原尾段）；冻结 oracle 为 203B、SHA-256 `8578d9df…`，解析为 4 个 paragraph。首个差异在 byte 101，oracle 比反例多一个 CRLF。

因此步骤 1 另记 `ORACLE_ACTION_AMBIGUITY`。这不是仅根据说明文字推断：证据同时包含真实 PM `splitBlock` 后的节点 JSON、CommonMark 段落计数和逐字节 diff；oracle 未被修改。

## 固定输入与可替换 bundle

- baseline commit：`698dbdb9fa10a7d246a1ff36259e5beec17f69ec`
- `cases.json`：`da5b3f51946dd4d21341d0d1d4a3ffb5dd784013240966a4c4475f0e10b58196`
- `PROTOTYPE.html`：`182fceeaae5daecf3b9d4e160d4c2f336090e58b5b81e1458471e356832382a9`
- 05 input：200B，`5d732779fee0ae8577d6864af86b3ef701c05eb264386652eaa46488a833ed10`
- 06 input：133B，`6b96d81818b7a25a0d6670b283e9b1e04bec33327ebc829666adc066156a9f29`
- 11 input：173B，`0b4e136a39ad9a432f8de66078f0800798080c855195b803d45cdeb53521b05c`

CLI：

```text
node audited-crossval.mjs [样稿目录] [PROTOTYPE.html] [结果 JSON]
```

三个参数均可省略。默认样稿目录、HTML 和结果文件以 driver 的 `import.meta.url` 为基准；指定另一个 bundle 路径即可对同一用例重跑。结果会记录本次 HTML、manifest、input 的 SHA-256，便于区分 bundle 与样稿变化。

## 复现命令与实际结果

复用主 repo 已安装的 `editor/node_modules`，没有安装或修改依赖；临时链接在命令后删除。

```sh
node --check editor/prototypes/fidelity/audited-crossval.mjs

ln -s /Users/rayhu/Documents/projects/Inkora/editor/node_modules editor/node_modules
node editor/prototypes/fidelity/audited-crossval.mjs
runner_status=$?
rm editor/node_modules
test "$runner_status" -eq 1

python3 editor/prototypes/fidelity-cases/verify.py
```

本次实际结果：

- `node --check ...`：退出码 0。
- audited driver：输出 `status: NOT_PASS`，runner 错误 0，退出码 1；随后对预期非零状态的断言通过。
- `verify.py`：`检查通过 557 项，失败 0 项`，退出码 0。
- runner 每次 boot 均从指定 HTML 取得 `window.fidelityPrototype`；本次所有 boot 成功，jsdom error 列表为空。

没有重跑未修改的生产 111 项测试或旧 29 项检查；没有执行桌面 App、WKWebView、IME 或用户文件测试。

## 修正优先级

1. **P0：空文档 visual 输入。** 为唯一空段落提供可逆的 source insertion anchor，使普通 `view.dispatch` 不依赖不存在的 source range；同时保留 source/visual selection、history 与逐字节语义。
2. **P0：结构事务到 source patch 的原生桥接。** Enter/Backspace 的 `splitBlock`、`joinBackward` 与列表 `splitListItem`/join 不能继续被 `model.transaction` 一概阻断；需按局部 EOL、列表定界符和保真规则产生可审计 patch。
3. **P1：marks/attrs 原生命令。** 把 05 的 remove strong、heading level、inline-code delimiter 增长、fence info string 修改从显式 demo 提升为真实 UI/命令路径。在此之前 05 不应计作通过。
4. **P1：澄清 11 visual-split 步骤 1。** 决定动作应增加第二次 Enter，还是 expected 应表达“一次 Enter 后插入内容并与原第三行处于同一新段落”。本 driver 不修改冻结 oracle。
5. **P2：真实环境验收。** 上述模型能力完成后，再补桌面/WKWebView、中文 IME composition、光标/选区及用户文件保存验收；当前结果不能外推到这些环境。

## 风险与未完成事项

- 当前结构 visual 操作和空文档 visual 输入均是已复现的产品原型缺口，不是 driver 待办。
- 05 仅证明显式 patch 与 PM 目标文档一致；没有 native command 证据。
- 11 visual-split 的冻结动作存在独立证实的歧义；在 oracle 决策前，不应以实现迎合预期字节。
- 未触碰 `model.ts`、`main.ts`、HTML、旧 `check.mjs` / `crossval.mjs`、独立样稿、生产代码或依赖。

## INK-PROT-015 最终 bundle 重跑

INK-PROT-015 将本 driver 以固定提交 `70597e0697cbaeb3df60680496c71213353cbd98` 合入后，指定本工作区审计样稿与组合后的最终 HTML 重新执行：

```sh
node --check editor/prototypes/fidelity/audited-crossval.mjs
node editor/prototypes/fidelity/audited-crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html \
  editor/prototypes/fidelity/audited-crossval-results.json
# 预期且实际：NOT_PASS，exit 1
```

- 最终 HTML SHA-256：`f37dd72cd8c665b2224eda3a23b702445a170843f65c029319396dbf1c3b7cf4`。
- 结果：4 PASS、4 EXPLICIT_PATCH_DEMO、2 FAIL、4 BLOCKED_BY_PREVIOUS、3 isolated FAIL、1 empty visual probe FAIL、1 ORACLE_ACTION_AMBIGUITY、runnerErrors=0。
- 结果仍为 `NOT_PASS`；009 的真实 link/image 语义与 010 的选区接线没有掩盖结构、空文档 visual 输入和原生 marks/attrs 的缺口。
- driver 必须使用本工作区审计样稿；旧 `c85e1890` 样稿不含审计新增的 `visual-after-step-*` 文件，不能作为本 driver 的输入目录。
