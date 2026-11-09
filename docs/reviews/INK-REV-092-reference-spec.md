# Spec

## INK-REV-092：引用定义独立审查

受检基线为 `d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14...49440e1b3bd7ea70974a5d671680c34f5b5c75d1`；审查前 HEAD 精确匹配、工作区干净、diff 非空，提交仅 `49440e1 fix(editor): preserve multiline reference definitions`。

## 核心发现

**缺失/partial：0；未经要求的 scope creep：0；实现错误：0。**

事实：实际接受的 definition provenance、全局 first-wins、容器与字段范围实现符合任务要求（`docs/tasks/INK-M1-087.md:15-18`）及 canonical 声明（`docs/markdown-support.md:17,82-83`）；现有回归覆盖转义 label、重复定义、多行 destination/title、BOM/CRLF、no-op/history、代码伪定义及 angle destination 增删 title（`editor/src/reference-definition-runtime.test.ts:4-122`）。CommonMark 192–218 的 LF/BOM+CRLF 语义比较仅适配空容器、code 尾 LF 与 HTML 排版空白，例201按 `SYN-D004` 单独保护，没有删除 oracle（`docs/tasks/INK-M1-087.md:24`；`editor/src/reference-definition-conformance.test.ts:37-75`）。

事实：旧跨行 label `toThrow` 改正例是任务明列的合法场景（`docs/tasks/INK-M1-087.md:20`；`editor/src/source-authority-runtime.test.ts:104-111`）。把空 href JSON 负例改为非字符串 `42`，同时增加空 href 往返，既保留 schema 类型拒绝又满足 CommonMark 空 destination；创建命令的非空安全守卫仍在（`docs/tasks/INK-M1-087.md:19`；`editor/src/inline-formatting.test.ts:256-282`；`editor/src/inline-formatting.ts:22-30`）。

判断：未发现能由本 diff 归因、且违反上述 Spec 的行为；不把 090 proof/handoff、物理验收延期或既有空 title 投影差异计为本轴问题。

## 验证边界

- 本轮自跑临时精确 Vitest：列表容器与 `blockquote > list` 容器定义 2/2 passed；临时文件和借用的 `editor/node_modules` 软链已删除。
- 空 title 诊断探针 1 failed（PM 得到 `null` 而非 `""`）；锁定 markdown-it 的 CommonMark 渲染同样省略空 title 属性，且旧 codec 已如此处理，因此否决为本 diff finding。
- root 已跑的 679 editor、Bridge 双侧 14/14、Native 169 passed / 0 failed / 8 performance skipped、lint 仅作为外部证据引用，本评审未重跑、未冒称自跑。
- 未启动 GUI、App、窗口、XCUITest、浏览器、CUA、bench-full 或物理输入。

