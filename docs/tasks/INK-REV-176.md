# INK-REV-176：标题创建时序Spec独立审查

- 分支：`task/INK-REV-176-heading-entry-spec`。
- 固定对象：base `4d762fa44b8bf94c5afdd0ca3eda33db1f338615`；HEAD `aec23e2663ac5c624a0bdf071bf7a2a13c16feca`；开始clean。
- 范围：只审不修，Matt Spec的missing/partial、scope creep、implemented wrong；只新建根级ATX1–6创建呈现，不改语法或产品。
- 完成：实际固定diff与174/AGENTS/GLOSSARY/ADR0004/V1核对；限定runtime自跑与必要base粘贴对照；[独立报告](../reviews/INK-REV-176-heading-entry-spec.md)。
- 发现：1项P2 implemented wrong，strong正文后空格导致输入态提前丢失；无独立missing/partial或scope creep确证。
- 修改文件：`docs/reviews/INK-REV-176-heading-entry-spec.md`、本任务单；产品和已有测试无修改。
- 自跑：准备既有离线renderer后，heading-entry-runtime 11/11通过；独立补7例5通过2失败，其中1项对应finding、完整标题paste失败与base相同；base仅跑paste1例同样失败，6例skipped。命令/夹具修正与证据路径详见报告。
- 未执行：全量/lint/build、Bridge、Native/WK、App/UI/Xcode、物理IME、可见paint、最低系统/AX/性能；963/16/18仅外部引用。
- 未完成/风险：P2待修；本轮有界synthetic证据不等于整体体验验收。未安装依赖，未push/PR/merge。
- 证据：ignored `artifacts/INK-REV-176/`保留日志/probe/base快照；本人自建node_modules链接结束时移除。
- commit：以本分支Conventional Commit为准，完成回报提供SHA。

## 固定补正后验（仅追加）

- 首稿提交：`1f2ba28e271d4ab254e7e34a936dfa4abb6cfcc4`，上文与首稿finding保留。
- 补正产品固定SHA：`512ad4e41660355fe14dd6a7db6fa0c2672fa2a9`；仅核对该P2相关产品diff并archive，不读取动态174作为证据。
- 后验：原独立strong反例1通过/6跳过；同对象12个heading-entry-runtime测试全通过。**原P2在限定复现下关闭**。
- 修复接缝：dispatch前capture原始纯文本输入事实，仅接受后更新显示收据；原有边界未放宽。
- 证据与命令：见报告追加节，ignored `artifacts/INK-REV-176/recheck*`保留；结束已移除本人自建四个node_modules链接。
- 只追加本任务与原报告，未改产品/原测试/依赖，无push/PR/merge；全量/Native/WK/Bridge、App/UI、物理IME/paint/最低系统仍未自跑，不能宣称整体体验验收。
- 本追加独立commit，完成回报提供第二阶段SHA。
