# INK-PROT-022 source-ledger 真实接线证据

日期：2026-11-08。分支：`task/INK-PROT-022-ledger-native-integration`。准备基线：`fc1cdff0facf3c5b409a6c83aeb1269142f95f97`。

本任务只修改 `editor/prototypes/fidelity/` 与 `editor/prototypes/M0-INTEGRATION.md`。未修改冻结 fixture、`native-host/`、生产代码、依赖、桌面配置或真实用户文件。结论只覆盖隔离原型，不宣告通用 source map、M0 架构或产品验收通过。

## 接线入口与守卫

- `FidelityModel.sourceLedger()` 是可视编辑的实际 ownership 入口。普通缓存只在 `source` 字符串、PM `doc` identity、`ranges` 数组 identity 三者完全相同时复用；选区事务可复用，文字编辑、源码提交、Undo/Redo 后均因至少一个 identity 变化而重建。
- `FidelityModel.transaction()` 在继承 marks、规划补丁或修改 history 前先构建 ledger。`planNativeTransaction` 的 PM→source 回调已改为 ledger 映射；真实入口不再调用 `model.sourcePosition` 的顺序 `indexOf`。旧函数只留给 legacy 独立检查，不参与 bundle 的事务接线。
- `main.ts` 的可视补丁、链接目标、图片占位、源码进入/提交均消费同一 ledger。`selection-map.ts` 在真实入口只保留 textarea LF/raw 偏移转换；它的叶文本贪心不再参与双向选区。
- 源码提交先 `parse` 候选、建立候选 ledger、映射 textarea 当前 anchor/head，成功后才调用 `sourceEdit`。严格映射仍是默认；UI 仅在 `line-ending`、块间 `gap` 或 `definition-*` owner 上显式请求 `adjacent-gap`。inline href/title、entity/escape/grapheme 内部、protected 与 `bom-gap` 不会被该策略吸附。
- 所有候选仍经过无 issue + `parsed.doc.eq(target.doc)`；pending、保护块、保存阻断与主动源码修复入口保留。折叠/快捷引用显示文字被编辑时，局部展开为 `[新文字][原定义键]`，不改定义、href/title 或相邻字节。
- `reference-context.ts` 包装锁定 markdown-it 的 CommonMark `reference` 块规则，只记录该规则实际接受的物理行范围。`model.parse` 的引用环境与 ledger 定义 spans 均消费同一范围；不再全文件 regex 首现。因此 fence、缩进代码、HTML literal 与受保护数学块内的 `[ref]: ...` 都是字面内容，合法定义重复时仍由 CommonMark first-wins。

## Staged doc 与候选投影

Markdown 不能独立表示暂存空段或段首 staged softbreak。暂存接线不再使用旧 `stagedSourcePosition` 的全局/顺序 `indexOf`：

1. 先对可重解析 candidate 自身建立 ledger。
2. 按顶层块顺序验证 candidate block 与 staged PM block 的 `stageComparableBlock` 等价；只允许明确的空 paragraph 或段首换行投影差异。
3. 把每块 ledger 的 PM 坐标按验证后的 block position 与段首换行差投影到 staged doc。
4. 暂存空结构只使用 `NativeAnchor` 的明确 source/PM 对；BOM 前 source 0 明确拒绝。

这使 11 的中段 Enter、018 的尾部空段、移动到第一段输入、再回空段完成都使用同一 ownership 模型。未知 staged 事务仍在修改 source/doc/history 前拒绝。

## 独立预期与字节差异

`ledger-integration-check.mjs` 从真实 `PROTOTYPE.html` 启动 jsdom `EditorView`。预期是脚本内独立字面量；不读取 ledger 结果或 fixture oracle 来生成补丁。

| 场景 | 输入 | 预期输出/补丁 |
| --- | --- | --- |
| href/title/正文同文 | `[a](later "later")later\n` | `[a](later "later")FINAL\n`；UTF-16 `18..23` 的末尾正文单独替换 |
| 任务给出的 entity 拼写 | `[a](later &quot;later&quot;)later\n` | 只把第 3 个 `later` 改为 `FINAL`，前两个拼写逐字保留 |
| escape + entity | `escape \\* entity &amp; tail\r\n` | 第一步 `7..9: "\\*"→"X"`；第二步在新串 `16..21: "&amp;"→"Y"`；CRLF 与其余字节不变 |
| 完整/折叠/快捷引用 | `[old][ref]`、`[ref][]`、`[ref]` | 显示改为 `NEW`；后两者成为 `[NEW][ref]`；定义 `[ref]: /dest "title"` 不变 |
| 同段重复 marks | <code>[same](dest "same") same *same* `same`</code> | 只得 <code>[same](dest "same") BODY *EMPH* `same`</code> |
| staged 组合 | `[a](dest "title") \\*\n` | Enter 暂存→escape 改 `X`→空段输入 `Y`，最终 `[a](dest "title") X\n\nY\n` |
| code/link 混排 | code 内 `[ref]: /wrong`，块外 `[ref]: /right` | 正文 `[x][ref]` 的 href 为独立预期 `/right`；代码与两处定义字节在可视编辑、源码往返后不变 |

双向选区组合以 `pre \\* mid &amp; post\r\n` 为独立输入：后向 PM 选区折返为 textarea raw `4..16 backward`，修改前缀后提交仍为后向；光标落在 `&amp;` 内部时返回 `entity` 不可分割 span 原因，草稿、可信 source 与可视选区保持。

常见 EOF 路径以尾部引用定义验证：`/dest` 改 `/next` 后 textarea 光标保持 raw EOF 36。严格映射先记录 `原文 36 没有可审计文本锚点`，UI 显式 `adjacent-gap` 到定义 owner 相邻的 `source 7 / PM 7`，trace 保留 `owner=delimiter/definition-close`；提交后链接 href 为 `/next`，Undo/Redo 恢复各自 source 与内容选区。BOM 文档 raw 0 仍拒绝，不变成插字边界。

## 分层结果

### 纯 module

- `source-ledger-check.mjs`：17 组 PASS；含 19 次冻结 fixture/case05 状态构建、有效引用定义块归属、链接 ownership、escape/entity、Unicode、代码块、hard_break、empty anchors、BOM 与规模测量。
- `selection-check.mjs`：15 项原有效断言 PASS。该脚本保留 legacy 模块证据，不代表真实入口仍使用其文本贪心。
- `verify.py`：11 例、49 步、582 项 PASS；fixture 未修改。

### jsdom / 真实原型入口

- `make -C editor/prototypes/fidelity test`：37 组合检查 + 4 staged native 回归 + 16 ledger 真实接线回归，全 PASS。
- `crossval.mjs`：02、03、09、10-open、10-create 指定变体通过；10 的 EOF 源码修复由 UI 明示 `adjacent-gap`，不是修改 fixture 或默认 nearest。
- `audited-crossval.mjs`：`PASS`；16 个累计 native 步骤、3 个 isolated 分支、3 个 probe 全部通过，FAIL/UNSUPPORTED/BLOCKED/runner error 均为 0。
- 生产 editor：`make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` PASS；锁定 pnpm 执行 `pnpm --dir editor test` 为 11 files / 125 tests PASS（包含 action audit）。

### 真实 WKWebView / IME

未执行。jsdom keydown、`EditorView.dispatch` 和 textarea `input` 不能证明 WKWebView DOM 事件、系统中文 IME composition、物理键盘或 AppKit 焦点行为。

### 磁盘层

未执行。原型 Save 仍只建立内存保存点；未访问用户文件，未验证 NSDocument、App Sandbox、磁盘重开、冲突或恢复。

## 最终产物与命令

最终 `PROTOTYPE.html` 由当前 `shell.html + main.ts` 重建，SHA-256：`e2e259f44b9a3cf372ba1de891da99d68b7a655dd39ab79073942105c6ffd3f6`，字节数 `396964`。验证均在仓库根 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-prot-022-ledger-native-integration` 执行；fidelity Makefile 的 `PNPM` 与根 lint 显式复用主仓库锁定 pnpm。worktree 原无 `editor/node_modules`，本轮只临时创建 symlink，最终清理时只删除该 symlink。

```sh
make -C editor/prototypes/fidelity test
node editor/prototypes/fidelity/source-ledger-check.mjs
node editor/prototypes/fidelity/selection-check.mjs
node editor/prototypes/fidelity/crossval.mjs editor/prototypes/fidelity-cases editor/prototypes/fidelity/PROTOTYPE.html
node editor/prototypes/fidelity/audited-crossval.mjs editor/prototypes/fidelity-cases editor/prototypes/fidelity/PROTOTYPE.html editor/prototypes/fidelity/audited-crossval-results.json
python3 editor/prototypes/fidelity-cases/verify.py
make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor test
```

## 未完成与风险

- 复杂 lazy continuation、多行引用定义、复杂/嵌套 delimiter、跨叶通用 mark/attrs、复杂列表/blockquote 结构仍未完成。
- 引用范围捕获为复用真实规则函数而读取当前锁定 markdown-it `Ruler.__rules__` 中的 `reference` 项，再通过公开 `ruler.at` 包装；升级 markdown-it 必须复核该内部 rule roster。本轮只验证现有单行定义子集，不把容器内/多行定义支持扩张为已完成。
- ledger 构建仍有重复扫描和线性查找组合；规模检查不是最坏 `O(n²)` 已消除的证明。
- 数学与部分保护边界仍过度保守，本轮没有把这些问题混同为 ledger 接线完成。
- `adjacent-gap` 只在 UI 明确调用且限制 owner；策略仍需在真实 WK/IME 中验证方向、焦点和组合输入。
- staged/history 是原型完整快照，不是 production `prosemirror-history` 或 composition 分组设计。
- 以上 PASS 不等于通用 map、M0 总门槛或架构采纳通过。
