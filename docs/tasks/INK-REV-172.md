# INK-REV-172：四项写作修复Spec独立审查

- 分支：`task/INK-REV-172-writing-spec`
- 固定对象：base `d4976d344daf90dd10ea4db0bbe326a6f8ce6f2e`；HEAD `4b389169d746c785cbfeafce9f11c2854968d653`
- 状态：审查完成；修复与整体验收未完成。
- 范围：只审不修；以四项用户要求、168任务、GLOSSARY、ADR0004、V1/V3、tables-tasks、markdown-support为依据，不读取管理者动态新文件。
- 完成：ref/clean/merge-base/nonempty diff核对；独立Spec报告；7组选定runtime文件230例通过；9例最小probe及base对照。
- 发现：3项P2 partial（引用空格、松散/引用列表Backspace、strong边界空格语义）；均为本次未覆盖既有缺口，不称新增回归。无可证实scope creep。
- 修改文件：`docs/reviews/INK-REV-172-writing-spec.md`、本文件；未改产品、已有测试或依赖。
- 命令与结果：见[报告](../reviews/INK-REV-172-writing-spec.md)；probe HEAD 4/9通过、base 1/9通过，其余为可重现需求断言失败。
- 未运行：全量、Native/WK/Bridge、构建/lint、App、物理IME、性能、可见paint与最低系统验收；未push/merge。
- 风险与未完成：上述需求缺口待修；报告仅覆盖静态审查与限定synthetic回归，不宣称产品整体验收完成。
- 证据：ignored `artifacts/INK-REV-172/`保留probe、命令日志和base源码快照供管理者备份；自建node_modules链接完成后移除。
- 提交：以该分支本任务Conventional Commit为准，完成回报提供完整SHA。
