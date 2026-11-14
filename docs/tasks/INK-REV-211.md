# INK-REV-211 文末空段落 Spec 独立复审

- 分支：`task/INK-REV-211-empty-paragraph-spec`。
- worktree：`/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-REV-211`。
- 固定审查HEAD：`9fa528cd534e2a8c8319d4eb3091e5013f62cd54`。
- 固定基线/merge-base：`ffacfbff386377b317348b572ff3073521a0e67e`。
- 初始核验：HEAD正确、clean、merge-base正确、三点diff非空，唯一提交9fa528c。
- 规格：INK-FIX-209、GLOSSARY、ADR0004、source-authority-production-v1。

已完成独立 Spec 轴复审，只审不修。结果：[报告](../reviews/INK-REV-211-empty-paragraph-spec.md)。P1一项 missing/partial：既有末尾空白行含space时，本轮承诺的EOF paragraph创建删除旅程仍以PM结构位置映射失败阻断保存；与基线对照确认是范围内未补全，不是新增回归。未发现额外 scope creep / implemented wrong。

本人有界 synthetic runtime 运行：原作者目标文件加本人重开对照21/21 PASS；14项EOF矩阵HEAD10绿4红、基线14红；13项扩展HEAD10绿3红；最终2项空白行最小反例HEAD/基线均2红。命令、样例、原始日志均见报告及 ignored `artifacts/INK-REV-211`。未运行全量、构建、Native/WK/App/UI；作者/root1095/Native结果只属外部证据，不计本人验证。

修改仅两份本任务Markdown。临时依赖仅本人自建软链，任务结束解除，未删除共享依赖；生成renderer和探针为ignored。未访问用户正文、恢复内容、权限或凭据；未改产品/有效测试/别人报告。未做PR/merge/tag/release/安装。

未完成：P1修复及新固定SHA复验交由实现者；实际原生保存关闭重开仍需独立验收。风险：若只覆盖纯换行后缀，就可能把合法保留空格文档错误报告为EOF全面支持；修复不能trim隐藏字节、放宽Selection/位置证明或绕过未解决意图与保存关闭守卫。本复审提交及最终clean状态由交付消息记录。


## 追加：03715e9限定复验

受检固定产品 `03715e9cad05ed90a0f541b45826915676bf4135`（父9fa），由git archive导出本人ignored `artifacts/INK-REV-211/postfix`，固定来源及四文件git blob/SHA256逐字核对见 `source-proof.json`。本分支产品仍为9fa；原首稿f323d1c下的两文件逐字prefix保留。

原P1两个最小反例由2红转2绿，可在原反例及本次有界矩阵内关闭。本人重跑原公开矩阵及固定产品目标文件55项，51绿4红；4红为首稿已披露的reference/protected/初始化tab词法既有边界，不写成通过。新增9项精确字节/UndoRedo/保存点/新runtime snapshot/list EOF lift与caret后续X/完整有向Selection拒绝，最终9绿。自建lift oracle最初误写局部EOL导致2红，原oracle与日志保存后按既有局部CRLF契约纠正，不改产品或正式测试。

完整命令、逐项范围、原始日志见[追加报告](../reviews/INK-REV-211-empty-paragraph-spec.md#追加固定03715e9的限定修复复验)及 ignored postfix目录。无新增范围内Spec finding；没有全量/构建/Native/WK/UI证据，root1100通过是外部结果，不计本人运行。仅追加原两文件；结束后解除导出树本人依赖软链，tracked clean由交付消息记录，不push。实际NSDocument磁盘保存关闭重开仍由相应验收负责。
