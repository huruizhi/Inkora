# Spec

## 核心结论（少于400字）

**P2 implemented wrong：正文含strong后的空格使标题提前结束输入态。** 174:4要求“回车结束该行才呈现正式标题”，24–25要求输入中正文大小、灰色标记直到回车。自跑逐字输入`# **加粗**`再输入` 尾部`，未按Enter，原文正确但`.inkora-heading-entry-ready`已消失；CSS因而恢复正式标题并隐藏灰标记。`heading-entry.ts:29–37`只接收单step；runtime:815–817在session接受后检查可变Transaction，而source-authority:1500会为尾空格追加removeMark，误判输入结束。

(a)无独立missing/partial；(b)无scope creep确证；(c)上述1项。不是要求支持无空格`#文字`标题。

## 固定范围与依据

- 基线：`4d762fa44b8bf94c5afdd0ca3eda33db1f338615`。
- 产品对象：`aec23e2663ac5c624a0bdf071bf7a2a13c16feca`，提交`285b92e`、`aec23e2`。
- 唯一产品diff：`git diff 4d762fa44b8bf94c5afdd0ca3eda33db1f338615...aec23e2663ac5c624a0bdf071bf7a2a13c16feca`；开始工作树clean。
- 依据：用户Typora示例与补充“# + 空格，#会变成灰色”、`docs/tasks/INK-UX-174.md:3–8,22–28`；AGENTS编辑器核心原则、GLOSSARY当前原文/组合输入会话、ADR0004与V1:13–18、31–36保真/选区/历史/证据边界。
- 审查只涉及新建根级ATX1–6创建呈现。现有标题、菜单、完整粘贴沿用既有路径，`#文字`仍为普通段落。没有修改产品、已有测试或依赖定义。

## 本人限定执行与证据

```sh
node editor/scripts/prepare-renderers.mjs
pnpm --dir editor exec vitest run src/heading-entry-runtime.test.ts
node editor/node_modules/vitest/vitest.mjs run --config artifacts/INK-REV-176/vitest.config.mjs
git archive 4d762fa44b8bf94c5afdd0ca3eda33db1f338615 editor | tar -x -C artifacts/INK-REV-176/base
node artifacts/INK-REV-176/base/editor/scripts/prepare-renderers.mjs
node editor/node_modules/vitest/vitest.mjs run --config artifacts/INK-REV-176/base.config.mjs -t 'paste immediate'
```

既有heading-entry-runtime **11/11通过**。审查者独立补充`artifacts/INK-REV-176/probe.test.ts`使用真实`createEditorRuntime`、EditorView公开事务/命令/keydown；属于jsdom synthetic。

| 补probe | 固定产品结果 |
| --- | --- |
| 输入期有向选区替换/正文删除 | 通过，仍保留输入态，原文正确 |
| 两段之间创建根级二级标题后Enter | 通过，归属正确、Enter后结束输入态 |
| 菜单设置二级标题 | 通过，即刻呈现，无entry class |
| BOM/CRLF文档中间创建标题 | 通过，原字节/快照符合冻结预期 |
| snapshot及仅选区导航 | 通过，不完成输入态、不移动选区 |
| strong正文后空格及续写 | **失败**，原文正确，entry-ready意外丢失，对应唯一finding |
| 完整标题HTML粘贴 | 原文仍空；固定base同一公开paste调用同样失败，不属于本次新增问题，不计本轮finding |

补7例结果为**5 passed / 2 failed**；第二个失败为必要base对照已确认的继承行为，不能将其称作本次粘贴回归或完整粘贴验收通过。base仅跑该1例，余6例skipped。

首轮补probe夹具问题单独保留：jsdom不会替未拦截的Backspace执行浏览器默认删除；PM `atEnd`不代表隐藏EOF空行；直接paste事务不代表浏览器paste事件。改为显式文本删除、中间可见段落创建及公开`pasteHTML`；另补显式synthetic paste Event解决jsdom缺少ClipboardEvent构造器。记录位于`probe-fixture-errors.ts/.txt`、`probe-clipboard-fixture-error.txt`。没有改产品来迎合断言。

## 边界、未完成与风险

- 只新增本报告与`docs/tasks/INK-REV-176.md`。ignored `artifacts/INK-REV-176/`保留补probe、日志、固定base快照；结束移除本人自建node_modules链接。
- 未自跑全量/lint/build、Bridge、Native/WK、App/UI/Xcode、物理IME、可见paint、VoiceOver、macOS14或性能。174的963/16/18是外部证据，不计为本人执行。
- 装饰属性/CSS伪元素不直接改PM文本、raw、选区或历史；11例及上述有界补例只能支持相应路径。finding待修复，不能据此宣称整体体验完成验收。
- 没有push、PR或merge。

## 固定补正后验（仅追加）

首稿与其finding保留，首稿独立提交`1f2ba28e271d4ab254e7e34a936dfa4abb6cfcc4`。本后验仅复核该1项P2，不重审粘贴或扩展语法/产品矩阵。

固定补正对象：`512ad4e41660355fe14dd6a7db6fa0c2672fa2a9`。用`git diff aec23e2663ac5c624a0bdf071bf7a2a13c16feca 512ad4e41660355fe14dd6a7db6fa0c2672fa2a9 -- editor/src/editor-runtime.ts editor/src/heading-entry.ts editor/src/heading-entry-runtime.test.ts`核对，并`git archive`提取至ignored `artifacts/INK-REV-176/recheck/`，未读取动态任务单作为修复证据。

**限定结论：原P2在固定补正对象上关闭。** runtime在`session.dispatch`前调用`capture`保存原始单步纯文本事实；仅接受后调用显示收据。单step、正文范围、非paste、root空段落等原有约束保留，未用扩大容许事务集合绕开问题。正文安全处理追加removeMark后，不再使输入态提前丢失。

独立自证strong反例只改runtime导入至固定快照，复验**1 passed / 6 skipped**；同对象heading-entry-runtime **12/12通过**。没有将其他6个补probe、base或作者全量结果计入后验通过数。

```sh
git archive 512ad4e41660355fe14dd6a7db6fa0c2672fa2a9 editor | tar -x -C artifacts/INK-REV-176/recheck
node artifacts/INK-REV-176/recheck/editor/scripts/prepare-renderers.mjs
node editor/node_modules/vitest/vitest.mjs run --config artifacts/INK-REV-176/recheck.config.mjs -t 'strong body'
node editor/node_modules/vitest/vitest.mjs run --config artifacts/INK-REV-176/recheck-entry.config.mjs
```

证据保留`recheck-probe.test.ts`、两个config及`recheck-strong-results.txt`/`recheck-entry-results.txt`。仍只有jsdom synthetic；本后验未运行Native/WK/Bridge、全量、构建、App/UI、物理IME、paint或最低系统验收，没有push/PR/merge。本人自建四个依赖链接均已移除；产品与已有测试零修改，ignored快照与日志保留。原finding关闭不等于整体体验验收完成。
