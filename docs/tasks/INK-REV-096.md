# INK-REV-096：保护片段生产核查

基线main1568743；范围仅公共会话反例、冻结证据和报告。完成V2缺口核查：脚注定义不可见、callout吞普通续行、行内Wiki冻结整段；front matter异常与源码修复控制通过。修改仅docs/reviews、docs/evidence/INK-REV-096和本文。

实跑单文件Vitest：3failed/1passed，原始红记录已保存；未运行全量/Native/GUI/物理输入，不借用PR75结果。本审计无产品修复，三个缺口留下一任务；不以红例为已交付，不宣告M0/M1/首阶段或物理门槛通过。没有依赖/锁/Swift/Bridge改动。

分支task/INK-REV-096-protected-syntax-audit；完成后提交、推送并保留冻结归档，供后续V2实现逐项转绿。
