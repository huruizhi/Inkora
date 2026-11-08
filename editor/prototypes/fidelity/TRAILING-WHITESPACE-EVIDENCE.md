# INK-PROT-027：连续输入尾随空格证据

日期：2026-11-09。范围仅为 `editor/prototypes/fidelity/` 隔离原型；未启动 GUI、未操作用户文件、未验证 NSDocument 磁盘保存，也不宣告 M0 通过或最终架构采纳。

## 冻结红例与最小化

修复前在 HEAD `84adcab375cb20311d883c8b3b43e4fc2d067e06` 运行：

```text
node editor/prototypes/fidelity/trailing-whitespace-check.mjs
exit 1
actual:   ...保护块之后的中文。alphabeta\n
expected: ...保护块之后的中文。alpha beta\n
blocked after Space: Error: 补丁重解析与目标 PM 文档不一致；可信状态未提交
```

第一次运行因 worktree 缺少 `editor/node_modules` 只得到 `ERR_MODULE_NOT_FOUND: jsdom`，不算红证据；临时链接到主仓锁定依赖后，才得到与 `TRAILING-WHITESPACE-RED.txt` 相同的目标断言。冻结 `TRAILING-WHITESPACE-RED.txt`、`TRAILING-WHITESPACE-FAILURE.md` 与 025/026 真实记录未改写。

进一步把输入缩为 `a\n`：PM 尾部位置映射到 source offset 1，候选精确为 `a \n`；目标 PM 文本为 `"a "`，但候选重解析 PM 文本为 `"a"`。标题、列表、引用、LF/CRLF、BOM、无尾换行均得到同一差异；内部 `a b\n` 重解析正常。

## 可证伪假设与结果

1. **CommonMark 重解析隐藏 textblock 尾部普通空格**：成立。候选字节正确，差异只在目标 PM 暂时可见、重解析不可见的尾部空格。
2. **增量 source patch/ledger 区间错误**：否定。`a\n → a \n` 的 offset、候选与 EOL 位置均正确。
3. **ProseMirror schema 无法表达空格**：否定。事务目标文档稳定包含尾随空格，caret 也前进。
4. **history/selection 把空格事务误判为无效**：否定。拒绝发生在候选重解析后的 `doc.eq`；事务自身 `docChanged` 且目标 PM 正确。

同时发现 ledger 原先要求物理行与 markdown-it inline token 完全相等，因此对“解析器隐藏、原文仍存在”的最终行尾空格无法建账。该问题与 `doc.eq` 差异同源。

## 选择的状态与投影边界

没有放宽通用 `doc.eq`，也没有修改 production parser/schema。只增加一个命名明确的 `trailing-whitespace` staged 状态：

- 普通可视事务在 textblock 末尾插入一个或多个 ASCII space 时，完整字节写入 `staged.candidate`；可信 `model.source` 在候选可重解析前不被覆盖。
- staged 比较只对该命名状态删除 paragraph/heading 投影末尾的普通空格；代码块、softbreak/hardbreak、语法前缀和其他差异不参与该比较。
- ledger 把最终 inline 行被 CommonMark 隐藏的空格记为 `block-suffix`，并用显式 source/PM anchors 覆盖每个 staged 插入边界；caret 移动和多空格选择不猜测位置。
- 下一段可视文字到来后，候选成为 `word + spaces + word`，重新解析 PM 与目标 PM 完全相等，才进入既有 `commitClean`。
- strong/em/strike 尾部输入字母继续当前 mark；分隔空格移到闭合定界符之后并移除该空格继承的 mark，避免生成 CommonMark 会按字面量解析的 `**text **`。link/image/autolink 的后续文字从完整闭合语法之后开始。
- fenced/indented code 的尾部空格已有 code_block 投影，直接 clean commit，不进入此 staged 状态。

这是增量 PM 路线的局部验证，不是 source-primary 架构决定。

## 字节、caret、历史与保存资格

专项真实 `PROTOTYPE.html` + `EditorView.dispatch` 覆盖 14 组：冻结复杂样稿、中文/英文混合、单/双空格、paragraph/heading/list/blockquote、LF/CRLF/BOM/无尾换行、strong/em/strike/link 边界、引用定义间隙、保护块邻接、softbreak/hardbreak 保持、code whitespace、已有原文尾随空格。

每组验证：

- staged candidate 精确包含每个空格；`ledgerSource()` 指向 candidate，可信 source 不被提前改写；
- 每个 staged caret 边界可移动，最终 caret 在第二个词之后；
- staged 期间保存按钮和 `actions.save()` 明确阻断，继续输入后自动恢复保存资格；这不是 pending/含混，也不会丢字节；
- Undo 回到含空格 candidate，Redo 恢复 clean source/PM/caret；
- 内存 savepoint 等于完整 source，新建 `FidelityModel(source)` 得到相同字节与 PM 投影；
- 主动源码模式 no-op 往返不改任何字节；已存在于原文的尾随空格是 hidden-but-owned、可保存状态。

026 的保存资格测试不再把普通尾随空格当故障触发器。新触发器是通过真实 EditorView 在既有 paragraph 开头输入 `# `：目标 PM 仍是 paragraph，而 Markdown 重解析变成 heading，属于尚未实现结构输入规则的真实不安全事务。它仍验证拒绝后直接 Undo/Redo 清除 operation diagnostic、pending/staged 保持阻断、空 history 不制造恢复；没有手工赋值 `model.blocked`。

## 实际命令与结果

```text
make -C editor/prototypes/fidelity test
PASS: 37 reproducible checks
PASS: 4 staged native transaction regressions
PASS: 17 real EditorView ledger integration regressions
source composition synthetic-signal-guard: 4/4 PASS (not real IME)
visual IME history synthetic/replay: 6/6 PASS (real IME retest required)
history save readiness: 5/5 PASS (real IME retest required)
trailing whitespace continuous input: 14/14 PASS (real WK/Sogou retest required)

node editor/prototypes/fidelity/source-ledger-check.mjs
PASS: 17 组独立来源断言

node editor/prototypes/fidelity/selection-check.mjs editor/prototypes/fidelity-cases
PASS: 15 项可复现校验

node editor/prototypes/fidelity/audited-crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html \
  editor/prototypes/fidelity/audited-crossval-results.json
PASS: native 16；isolated 3；probe 3；失败/unsupported/runner error 均为 0

python3 editor/prototypes/fidelity-cases/verify.py
用例 11；步骤 49；检查通过 582 项，失败 0 项
```

`selection-check.mjs` 的默认 fixture 路径改为当前 worktree 相对目录，不再依赖已移除的 004 绝对 worktree。

## 明确拒绝的边界与剩余风险

- 只把普通 ASCII space 作为本次视觉尾随空格候选；tab、代码缩进、块前缀与其他 Markdown 语法空白不套用此规则。
- softbreak 前的空格可能改变 hardbreak 语义，不按 textblock 尾部空格暂存；既有 softbreak/hardbreak 原文字节与 ledger atom 回归均保持通过。
- 受保护块内部仍无可视文本锚点；只验证其相邻正文输入不会吞掉块或间隙。
- staged 尾随空格尚未与重解析投影一致，因此短期保存和主动源码切换明确阻断；继续输入或 Undo 可解除。已有源码尾随空格仍可重开和保存。是否将“只以尾随空格结束”的可视草稿设计成可直接保存，需要后续独立定义重开 caret/投影语义，不能靠跳过 `doc.eq` 实现。
- synthetic/replay 只证明模型逻辑；本次未执行真实 WKWebView 普通键盘、搜狗候选窗、物理 composition、NSDocument 磁盘保存/重开。
- 未修改 native-host、production、依赖或冻结 fixture；未创建 PR、未合并 main、未修改 Issue。
