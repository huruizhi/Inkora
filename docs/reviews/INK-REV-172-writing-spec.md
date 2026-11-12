# Spec

审查对象固定为 `d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e...4b389169d746c785cbfeafce9f11c2854968d653`。本次只审不修，不将作者测试或管理者 WK 记录冒充自跑。

## 核心发现（少于400字）

- **P2 partial：引用空格消失。** 168:17要求“也要能看到/继续编辑”。source-authority:246不递归blockquote；`> a`末尾第二空格raw保留，PM/DOM却回`a`。
- **P2 partial：列表删除死路。** 168:18要求“首字符前删除”。block-editing:114进入lift，source-transaction:637–675未涵盖松散/引用；`- a\n\n- b`或`> - b`在b前Backspace拒绝且阻断保存。
- **P2 partial：strong空格失真。** V1:33要求“包含strong/link等边界”，FID-003要求其他语义保持。source-authority:225–227排除marks；`**bold**`尾插空格变字面`**bold **`。

三项均为base已有、本次未修完的需求。(b)无scope creep确证；(c)无独立新增错误。详证如下。

## 可证伪证据

证据为审查者自建 `artifacts/INK-REV-172/probe.test.ts`，以真正 `createEditorRuntime`、EditorView事务/keydown操作；属于jsdom synthetic，不是WebKit/物理IME。首次固定选区后连续输入，每字只读取raw/PM/DOM/status，不调用snapshot或恢复焦点。所有用例销毁runtime。

| 用例 | 固定HEAD结果 | 固定base对照 | 需求/产品位置 |
| --- | --- | --- | --- |
| 引用`> a`末尾逐个空格 | 第一空格可见；第二空格raw保留、PM和DOM丢空格 | 相同失败 | 168:17；V1:7/33；`source-authority.ts:216–254` |
| 松散列表`- a\n\n- b`，b前Backspace | 原文不变；unresolved=true；saveEligible=false；诊断不支持replaceAround | 同样不接受，诊断语义证明失败 | 168:18；SYN-S008明确“紧凑/宽松列表”；`block-editing.ts:110–114`、`source-transaction.ts:637–675` |
| 引用列表`> - b`，b前Backspace | 原文不变；unresolved=true；诊断列表标记无法安全定位 | 相同失败 | SYN-S007/008；`source-transaction.ts:643`正则未涵盖引用前缀 |
| `**bold**`、`# **bold**`，正文末尾插一空格 | raw变`**bold **`/`# **bold **`，正文出现字面定界符，原有strong消失；仍saveEligible=true | 相同失败 | FID-003；V1:33；`source-authority.ts:225–227`仅接纳无marks单文本 |
| `[link](target)`、嵌套列表、任务正文末尾三空格 | 三例通过逐字可见/无unresolved断言 | 仅link通过 | 排除“所有容器均失败”的过度结论 |
| 嵌套列表`- a\n  - b`，b前Backspace | 通过，有原文变化且无unresolved | 失败 | 本轮有实质改善 |

9例固定HEAD **4 passed / 5 failed**；相同probe对固定base **1 passed / 8 failed**。strong两例共享一个发现，两个列表失败共享一个发现。断言失败不是产品崩溃或测试环境报错。base通过`git archive <固定base> editor`提取至ignored目录运行，没有修改产品或已有测试。

## 功能与不回归矩阵

| 契约 | 本次依据与结论边界 |
| --- | --- |
| `#`后继续输入、空标题Backspace、连续普通空格 | 自跑heading-spaces-regression，相关普通路径通过；引用/marks缺口如上 |
| 列表末项空白退出、删完字继续上删、嵌套/任务 | 自跑list-input-runtime，紧凑列表/任务路径通过；松散/引用缺口如上 |
| 标准`- [ ]`可勾选、点击/Space、写回、Undo/Redo | 自跑list-input-runtime与tables-tasks-runtime通过；未扩裸`[ ]` |
| 裸`#`组合候选存活、确认、取消、late final、普通输入独立history/revision | 自跑heading-composition-runtime、composition-publication、source-authority-runtime通过；均synthetic，未代替物理IME或真实WK |
| BOM/CRLF、范围外原字节、有向选区、Undo/Redo | 上述选定runtime已有相关断言通过；不推出所有语法/平台通过 |
| 只读保护片段与未知语法 | 自跑protected-source-runtime通过；没有独立重跑所有bare-CR/非法UTF-8路径 |
| stale owner/新会话epoch与旧事务 | heading-composition-runtime含重开/跨owner/稳定前旧事务拒绝；静态核对owner绑定raw/doc/version/epoch/composition，未发现新增旁路 |
| 保存点/源码草稿/no-op | source-authority-runtime相应断言通过；未跑Native落盘、关闭重开或Bridge全矩阵 |
| 依赖、网络、整篇serialize、有效测试 | diff无新增依赖/网络能力；新增补丁有界证明，未删有效测试；不将此等同全部保真已验收 |

## 自跑命令与范围

前置核对：worktree初始clean，分支`task/INK-REV-172-writing-spec`，HEAD固定匹配；两ref有效，merge-base等于base，diff非空（2536行）。唯一比较命令：

```sh
git diff d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e...4b389169d746c785cbfeafce9f11c2854968d653
```

提交新到旧：`4b38916,c2c9bf5,42bf087,1e64324,ba00e4a,b7391c0,5c8243f,bc1f739,0d6d7fd`。

仅借用根`editor/node_modules`，未安装依赖。第一次93例命令因缺少生成的`RENDERER_NOTICES.txt`失败（0测试执行），运行既有离线准备脚本后重跑：

```sh
node editor/scripts/prepare-renderers.mjs
editor/node_modules/.bin/vitest run --root editor src/heading-spaces-regression.test.ts src/list-input-runtime.test.ts src/heading-composition-runtime.test.ts
editor/node_modules/.bin/vitest run --root editor src/source-authority-runtime.test.ts src/composition-publication.test.ts src/tables-tasks-runtime.test.ts src/protected-source-runtime.test.ts
editor/node_modules/.bin/vitest run --config artifacts/INK-REV-172/vitest.config.ts
editor/node_modules/.bin/vitest run --config artifacts/INK-REV-172/baseline.config.mjs
```

前两组选定产品回归分别 **93/93**、**137/137**，合计7文件230例通过。两个probe命令因上述预期断言失败返回1，日志分别`probe-results.txt`与`baseline-results.txt`。没有跑完整Web、make lint/build、Bridge、Native/WK、App、屏幕、性能或物理IME；父会话14项真实隐藏WK只是外部证据，不算审查者自跑。未作整体验收通过结论。

审查仅新增本报告与任务单；ignored artifacts由管理者备份。风险为三项未完需求及上述验证边界。未修产品、不push、不merge。

## 固定补正后验（2026-11-12，追加）

首稿原文保留。审查分支后验开始时clean、HEAD为`a7fd2d19cb4970c5b95ac5f086f3e4941e463e7e`。本节只复核原三项P2，不扩成全语法或整体验收。

固定产品对象：`53ffb58ab56f4269503f7936e0db3e639654fc66`；base仍为`d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e`。只用`git archive <固定对象> editor`得到ignored快照、`git show 717f104`与`git show 53ffb58ab56f4269503f7936e0db3e639654fc66`核对补丁，没有读取动态管理者文件。补正归属为`717f10425e99ab59d819942507775deaf60346bc`（marked/quoted whitespace）和固定对象（loose/quoted lists）。

**后验结论：原三项P2在限定复现及必要保真负控下均已关闭。** 原9例probe对新固定对象9/9通过；独立补7例7/7通过。该结论不追改首稿，也不把管理者或作者输出计为本人实跑。

| 原finding | 固定对象自跑证据 | 补丁核对 |
| --- | --- | --- |
| 引用空格不可见 | `> a`逐个三空格均可见，source精确保留；补probe覆盖有向选区、三次Undo/Redo与逐字回删 | ownerTrailingWhitespaceProjection纳入blockquote，增量tail保留已接受inline Fragment |
| 松散/引用列表Backspace阻断 | 原`- a\n\n- b`、`> - b`首字符前Backspace均接受；补probe松散列表及BOM/CRLF双重引用连续两次Backspace后为`- ab`及原引用前缀下`ab`，两次Undo/Redo恢复字节 | lift重证tight attrs，原文候选覆盖引用前缀与段落/列表join；混入无关文字的lift负控保持原文并unresolved |
| strong尾空格语义损坏 | 原strong/heading-strong用例三空格后维持正文；补probe检查原inline Fragment逐节点/marks一致、源插入在关闭定界符之后、BOM/CRLF/范围外原字节、选区方向与删除历史 | 以ledger关闭语法owner定位源插入边界，只对合法尾空白建立sourceBoundary，不重新序列化整篇 |

命令均在本审查worktree根运行：

```sh
git archive 53ffb58ab56f4269503f7936e0db3e639654fc66 editor | tar -x -C artifacts/INK-REV-172/recheck
artifacts/INK-REV-172/node_modules/.bin/vitest run --config artifacts/INK-REV-172/recheck.config.mjs
artifacts/INK-REV-172/node_modules/.bin/vitest run --config artifacts/INK-REV-172/recheck-guards.config.mjs
```

- 原9例probe仅把runtime导入指向固定快照，文件`artifacts/INK-REV-172/recheck-probe.test.ts`；结果`recheck-results.txt`：**9 passed**。
- 新7例为`recheck-guards.test.ts`；结果`recheck-guards-results.txt`：**7 passed**。涵盖4组空白保真/历史、2组连续列表lift/join、1组混入额外编辑的负控。
- 补probe首轮4个失败来自审查夹具：初始raw选区仍在关闭定界符内侧，却被误用为应插入位置；以及Undo/Redo重建view后复用旧view。保留该轮源码`recheck-guards-fixture-errors.ts`与输出`recheck-guards-fixture-errors.txt`，改为明确期望的源关闭边界、重新取得当前view后重跑通过；未修改产品。
- 三次实验对比：原base 1/9、首稿固定HEAD 4/9、补正固定HEAD 9/9，原始文件与输出均保留。

本后验只借用已有node_modules并复制本审查已生成的依赖许可证文件；没有安装依赖、修改产品或已有测试。结束移除自建两个node_modules链接，ignored快照/probe/日志留待管理者备份。未跑全量/Native/WK/Bridge/App/屏幕/物理IME/构建/性能。管理者另报固定对象真实隐藏WK/Native16项通过，是外部synthetic证据，本人未自跑，不代替可见paint/物理IME/最低系统验收。
