# INK-FIX-169：空标题退格与连续空格

## 范围与基线

从 `0d6d7fd`（产品基线 d4976d3 / build6）在独立分支
`task/INK-FIX-169-heading-spaces` 诊断。只处理空标题退格、普通纯文本段落连续空格的
可编辑投影；列表与复选框由 INK-FIX-170 负责，真实 WK/Native 与集成由 INK-FIX-168 管理者串行执行。

## 已实际运行的红回路

命令：

```sh
cd editor
node scripts/prepare-renderers.mjs
./node_modules/.bin/vitest run src/heading-spaces-regression.test.ts
```

初次运行因未生成 `public/RENDERER_NOTICES.txt` 无法收集测试；运行既有 prepare-renderers 后建立红回路。
这是公共 runtime 的 inputRules/dispatch API 模拟，不是浏览器真实字符输入。逐字连续执行，字符之间不调用 snapshot、不恢复焦点。

- 单空格后 `a` 得到 ` a`（负控绿）；连续两空格后 `a` 得到 `a  `（红）。
- 第一空格：`ReplaceStep(1,1,' ')`，raw=`' '`，selection=2。
- 第二空格：`ReplaceStep(2,2,' ')`，raw=`'  '`，但投影重建为空 paragraph，selection=1；
  unresolved=false、saveEligible=true，下一字被插在原文空格前。
- 输入单个 `#` 后 raw=`'#'`、投影为空 heading、selection=1。
  Backspace 命令返回 false，没有 transaction，无法移除标题格式（红）。
- 修复可见空格后另建立红回路：输入两个空格，再连续两个文字删除 ReplaceStep，raw 仍残留一个空格。

输入 `#a`、`# a`、`a  b` API 序列在基线成功，不能拿这些绿例宣称复现了“所有标题后无法继续输入”。
管理者另报真实 WK 基线：`#`→Backspace→正文得到 `#正文`；普通 `# 标题` 连续输入成功；
`a` 后连续第三空格的即时 DOM 空格数回退。这些是管理者证据，不是本作者亲自运行 WK。

## 假设与最小原因

测试前报告的三项可证伪假设：

1. 空白接受后 canonical 重投影丢失可编辑位置；绕过 inputRules 的直接 ReplaceStep 若仍复现，则排除规则本身。
   实际直接 ReplaceStep 复现，支持该假设。
2. 标题连续 DOM 输入可能引用重建前的节点/选区；预测 API 绿而连续真实 DOM 红。
   本作者没有运行真实 WK；管理者普通标题序列绿，本轮不据此改 observer。
3. 空标题退格可能被语义差异拒绝；预测产生 ReplaceAroundStep 后 diagnostic 拒绝。
   实际没有产生事务，证伪：问题在默认 Backspace 链未处理顶层空 heading。

空白最小原因是合法源字节被接受后，canonical CommonMark 不显示首尾 ASCII 空格，
原先语义更新分支立即替换可编辑投影。仅保存原字节而重新定位到空 paragraph，会改变下一次输入位置。
另一个删除原因是 planner 把“目标等于现有原文 canonical 投影”一律视为无字节变化的 projection-sync，
从而吞掉最后一个真实可见空格的删除。

## 限定修复

- `clearEmptyHeading`：折叠选区位于顶层空 heading、非 view composition 时才将其降为 paragraph。
  普通文字退格继续使用既有链。
- 标题 structural 候选允许没有尾空格的 ATX 标记（例如 `#`）；候选仍须通过现有 parser/目标投影证明。
- `literalWhitespaceProjection` 只在未加 mark 的纯文本 paragraph 与原文所属区间逐 UTF-16 单元完全相等，
  且 canonical 只省略首尾 ASCII 空格时保留目标投影，并建立直接位置账本。
  无块空文档仅使用 BOM 后首逻辑行的显式区间，保留 EOL 与剩余原字节。
  不改 canonical parser、不序列化整篇、不 trim 原文，不把 hardbreak 或四空格代码当普通空白放行。
- planner 仅对“删除的 PM 内容与对应源区间都是相同 ASCII 空格”的 ReplaceStep 绕过 projection-sync 快捷路径，
  继续使用原有局部文字补丁规划。

## 作者验证

```sh
./editor/node_modules/.bin/vitest run --root editor \
  src/heading-spaces-regression.test.ts src/source-authority-runtime.test.ts \
  src/source-boundary-sequence.test.ts src/heading-input-runtime.test.ts \
  src/block-editing.test.ts src/composition-publication.test.ts \
  src/protected-source-runtime.test.ts
./editor/node_modules/.bin/tsc --noEmit -p editor/tsconfig.json
```

结果：7 个文件、140 个测试全部通过；TypeScript 检查通过。
新增测试覆盖即时 PM/DOM 文本、源字节、BOM/CRLF/范围外字节、有向选择、Undo/Redo、
snapshot 与 saveEligible，以及 composition、hardbreak、代码、mark 负控。
测试中的 snapshot 只在完整输入序列结束后调用；历史重建后重新取得活 view。

## 未完成与风险

- 作者未运行真实 WK、Native、物理输入法、性能、全量门禁、保存/关闭物理验收；由管理者集中补验。
- 有 mark 的段落、空正文 textblock、非 list 容器（例如 blockquote）中的扩展空白不是本轮 owner 映射的覆盖范围。
- 与 170 的 Backspace 链同字段修改由管理者合成，保留两个有界命令；不以作者单支结果宣称整体验收通过。

## 追加：heading 与 list 正文尾空格

管理者真实 WK 验证初次提交 d5ab07a：空标题退格、普通段落与空文档起始空格已通过；
heading/list 逐键仍出现空格回退。因此扩展任务继续，未将初次提交称为用户空格问题整体验收通过。

先加入实际红例：ATX 闭合 hash、setext、无序及有序列表第一项，连续追加三个空格与 `b`，
第二空格时 DOM 仍只有一个空格或回退无空格。命令仍为上述单文件 vitest。

新增 `ownerTrailingWhitespaceProjection`，只递归配对 doc/list/list_item 与无 mark 的 heading/paragraph。
正文必须是 canonical 单文本正文加 ASCII 尾空格；同一次 baseLedger 的 visible text span 必须完整、
连续且源/投影长度相同，并由 accepted 顶层 range 证明从原文正文起点到新增空格终点的归属。
整段目标正文必须等于对应原文片段。前后语法不会被重写，后续块位置按已证明 textblock 长度差平移。
不改 parser、source-ledger、列表 planner 或 Backspace 链。

扩展作者验证：7 文件、151 测试通过，TypeScript 通过。新增每键 DOM/原文光标、方向选择、
Undo/Redo、尾空格逐个删除与 snapshot；ATX 原有闭合 hash、setext 下划线、列表标记及 CRLF 均保持。
两项列表正文同时持有可见尾空格的账本也已覆盖。实际输入两空格形成 hardbreak、四空格形成代码的
负控通过，不能被此分支当普通空白保留。真实 WK 扩展仍由管理者串行补验。

## 追加诊断：无空格 `#` 后组合输入候选失活（未修复）

普通 `#` + space + 提交字符串在基线本就绿，不能覆盖用户“`#` 后无法继续输入”原报告。
本阶段只补诊断，没有修改产品代码或组成输入守卫。

独立运行有意保留红状态的诊断：

```sh
cd editor
./node_modules/.bin/vitest run --config diagnostics/heading-composition.vitest.ts --silent=false
```

完整本机日志：`artifacts/INK-FIX-169/heading-composition.log`（相对工作树根目录）。
测试使用独立 probe/config，不加入普通测试文件匹配范围；这不是跳过已有有效测试。
实跑两次均为 3 例中 2 绿 1 红（约 0.6 秒）：

| 初始原文 | 拼音候选阶段 | 确认字阶段 | stable 后原文 |
| --- | --- | --- | --- |
| 空原文 | Text 存活、`<p>zh</p>` | Text 存活、`<p>中</p>` | `中` |
| `# ` | Text 存活、`<h1>zh</h1>` | Text 存活、`<h1>中</h1>` | `# 中` |
| `#` | Text 已脱离、`<p>#zh</p>` | 原候选替换不再被观察，仍为 `<p>#zh</p>` | `#zh`，错误 |

操作序列：boot→仅一次初始 focus→公开 DOM compositionstart→移除空块 trailing BR→append
候选 Text(`zh`)→浏览器式选区移到候选末端→公开 input（insertCompositionText/isComposing）→自然等 20ms→
在**原候选节点** replaceData 为 `中`（若仍连接则更新候选选区）→input→自然等 20ms→compositionend→
whenCompositionStable。整个序列不调用中间 snapshot、不重新 focus、不私写 view.composing、也不调用私有 DOMObserver。

`#` 候选阶段 view.composing 与 runtime.composing 均 true，raw=`#zh`，rawCaret=3、PM head=4、
diagnostic 为空，saveEligible=false。说明 canonical heading→paragraph 已在活动组合输入期间发生。
稳定后 saveEligible=true、raw 仍为 `#zh`，没有保住该候选上的确认字。负控在活动与确认阶段均保持候选节点。
稳定边界后 Text 可以常规重建，因此诊断不要求 stable 以后原节点继续连接。

初版探针遇到 jsdom 缺少 getComputedStyle/Range 几何方法，已经补齐纯布局 shim 后重跑；
不得将这些 harness 环境异常作为产品失败。jsdom 没有实际输入法，此处是公开 DOM 事件与候选节点生命期模拟，
需要管理者用真实 WK 同形独立复核，不能声称已获得物理 IME 证据。

最小候选接线尚待裁决：dispatchTransaction 为已证明的空 ATX heading 失效候选签发临时 owner，
accept/projectionContext 共同保持原文、候选正文与位置的有限对应，active/settling 期间保留活投影；
endComposition 在安静且 PM composing=false 后以最终原文恢复 canonical、有向位置，再结算历史/一次逻辑 revision。
禁止靠清 composing、提前结束候选或放行 snapshot 修复，禁止把临时证书扩大到所有语义差异。
