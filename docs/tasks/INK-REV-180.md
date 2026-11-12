# INK-REV-180：任务空格修复Spec独立复审

## 范围与完成内容

仅审查、不修产品。固定基线`4b3fa6faa21f2a46bbcab3cc3329e681c2cf2401`至HEAD `e6b6d20801f637ebc6067b122fec39742c01b7aa`，开始时工作区干净，merge-base等于基线，恰有`fa2ae55`、`e6b6d20`两提交且差异非空。

对照用户确认的`-[]`→`- []`位置、随后状态空格与新task继续label需求，核对源码及GFM、当前原文、位置依据、composition和历史契约。Spec轴0项发现；报告见[独立复审](../reviews/INK-REV-180-task-space-spec.md)。没有把裸`[]`或`[ ]`另行扩成task。

## 修改文件

- `docs/reviews/INK-REV-180-task-space-spec.md`：Spec裁定、固定点及证据边界。
- `docs/tasks/INK-REV-180.md`：本任务记录。

未改产品代码、既有测试、依赖或用户文档。

## 验证

- `node editor/scripts/prepare-renderers.mjs`：通过，退出0。
- `cd editor && ./node_modules/.bin/vitest run src/task-space-input-runtime.test.ts`：通过，1文件16例，退出0（2026-11-12）。
- 依赖仅临时链接现有`editor/node_modules`，结束时移除本人链接；准备生成的ignored资源保留。未安装依赖、未访问网络。

## 未完成事项与风险

本审查范围内无遗留。未运行构建、全量测试、App/Native/WK/Xcode/UI或物理IME；这些验证仍由根任务单独汇总，不以本次16例代替。旧build8红例及其他矩阵为外部证据，未冒称自跑。只审文档提交，无push、PR或merge。

分支：`task/INK-REV-180-task-space-spec`。提交：本任务最后的`docs(review): record task space spec review`文档提交，准确SHA随交付回报。
