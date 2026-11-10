# INK-UX-136：阅读节奏与节点工具委派管理

基线`main@666ef210b814c1a7e779b7468781764b44980239`，独立管理分支`task/INK-UX-136-typora-rhythm-tools`。目标来自既定Typora第二轮计划第2、3项；具体契约见[阅读节奏与表格工具](../design/typora-rhythm-tools.md)。

已核对当前生产事实：正文实际规则在`writing-surface.css`，17px/1.8及900/760阅读宽度保留；h1–h6共同使用1.6em/.75em间距。表格NodeView仍一次创建并展示11个上下文按钮，Option+F10/Esc已有公开接缝。旧同尺寸对照和fixture位于保留的INK-UX-122/124工作树，未重新占屏。

模型/profile已实时发现：无配置profile。A为Luna medium（有限CSS/测量），B为Sol medium（菜单焦点、原文历史与过期意图），均使用已发现Codex full-access配置。主会话不替执行Agent写产品实现，不扩展尚待决策的交互。

当前为契约与委派阶段，未交付新产品或提前填通过；之后按固定SHA接收、独立复核、默认CI、合并/唯一安装及两层备份回收。隐藏WK不等于真实屏幕paint/观感、系统授权、物理输入或macOS14实测。

## 总体范围与完成审计

已实读历史路线Issue #1及其指向的首阶段范围票03、质量票07；旧Issue明确为重新规划中的历史清单，不能把其剩余1.x条目自动当本切片任务。用户确认的单篇技术写作闭环、资源保存迁移、保真、系统输入与辅助功能门槛仍须分别核对，不能因PR #87合并或本轮排版完成就宣布整个阶段通过。导出/主题、原件自动保存和可浏览版本历史是另行分阶段的决策范围，不顺带实施。

当前主干有生产写作生命周期测试，真实WK/Bridge/NSDocument覆盖混排正文、表格、任务、代码语言、替换、四种图片Save As及新文档重开；PR #87精确HEAD默认CI通过，安装/归档回执已保存。但`docs/acceptance.md`明确该测试注入目录选择，只能证明对应后台层，不能替代真实Sandbox授权/持久化、系统保存面板、人工VoiceOver和实际屏幕显示。其人工VoiceOver两项仍未勾选。M0真人材料与后续代码证据按各自提交保留，不改标为新版本物理通过。

用户已取消macOS14专门验收和重复物理中文上屏；继续尊重，不再把复做这些场景作为条件。本轮先完成仍有独立开发空间的两个P1切片，不占屏补验，不提前把上述剩余证据写成通过或将总目标设为complete。实际派发句柄在本地`artifacts/delegation/agents.json`，A/B均已返回running收据。

## 执行恢复

A的Luna medium连续两轮仅阅读规范和现有脚本后结束，实际工作树仍clean、无build/artifacts，尚无真实WK测量或CSS改动；不将这类回报算作交付或外部受阻。管理者已在同一Agent/工作树升级Sol medium并重新下达具体测量步骤，范围和禁止占屏要求不变。B菜单任务继续独立执行；未因此提前整合或替换安装。

## 组合阶段核对

已按固定提交接入137 `c1bd4733b036bee08955aead4a588714de739fc0`与138 `f5d6d38bf0db6d3490a7e42e3224797987c3c565`。管理者在组合产品`4fc4a78c4fbf2d1dfb578a8d19b403a295da1007`自跑四文件定向回归88/88、`make editor-build`通过。初次误用不存在的`.tools/pnpm`未启动测试，随后按Makefile锁定入口`.tools/node_modules/.bin/pnpm`成功，不计第一次为产品失败。

复制137最终无候选注入harness到管理者自身build目录，用组合生产bundle重新编译并运行真实不可见WK，8组宽窄/900与760配置/深浅色均通过。独立读取JSON核对：h1→p为17px、h2→h3为21.25px；raw/revision/dirty与实际EditorView DOM身份保持，页面与editor无横向溢出。含17px内部滚动条的实际内容列分别883/743px，480px视口为415px；不把配置宽度冒称实际正文宽度。命令、JSON、编译与运行日志保留于管理者`artifacts/INK-UX-136`及`build/artifacts/INK-UX-137`。该证据不证明屏幕paint或对Typora像素一致。

138顶部菜单几何证据尚不足以覆盖编辑区底边裁切，已由原实现Agent有限补测剩余40–80px、360px横滚及最后命令真实可达性；在取得结果前不固定最终候选，也不重复全量门禁。
