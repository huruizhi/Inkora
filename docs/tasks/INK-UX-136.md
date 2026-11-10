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

## 固定候选与最终本地门禁

138底部裁切补正`bf82294d1943749b7fe0f78d70ee8a9567cb8d4b`已接入，固定产品候选`ce4dd2ff0487ead9d0970f21b81d9d6b84bae009`。按Matt两轴流程创建全新Standards 139和Spec 140独立审查，基线均为PR #87合并点666ef21；报告返回前不预填通过。

管理者自跑`make lint test-non-ui release-bundle-check`退出0：editor 798/798，Web Bridge 16/16，Swift Bridge xcresult 16/16，Native xcresult Passed、214通过/0失败/8既有性能跳过；离线Release bundle smoke通过。日志保留既有InkoraDocument actor-isolation warning及伴随的“command failed with exit code 0”诊断、Vite大chunk提示；最终命令状态与实际xcresult均已核对。未运行UI或full-bench。

管理者复制138最小harness，用组合源重新打包并在不可见WK运行：8种宽/高/底部空间组合，各9项焦点与中心命中全部通过，正文、选区、状态、发布数不变，editor不额外滚动。工具可见态仍按作者约束注入，不声称物理焦点或paint。首次Vite误传不支持的--root、Swift6 harness函数缺MainActor而未启动，完整日志保留；只修正自有临时harness启动及actor注解后通过，产品零改动。最终日志`artifacts/INK-UX-136/menu-geometry-final.log`与harness及首轮错误日志一并保留。

## 独立审查结算

139 Standards固定ce4dd2f：明确书面硬违规0，低优先级possible Duplicated Code 1（新旧上下文测试的公共setup/断言重复），是维护判断且不阻断，本轮不为消除重复删除有效覆盖或增加通用测试框架。140 Spec固定同SHA：missing/partial、scope creep、实现错误均0；审查者实跑两文件四项，其中两项新反例覆盖选区离开又返回、源码卸载、同文新runtime及取消。两轴全文分别保留于独立review/task，作者证据与审查者自跑没有混称。

审查之后仅追加两轴报告与本管理记录，产品相对ce4dd2f未变；精确最终HEAD仍须默认CI，未提前合并、安装或宣告整个开发目标完成。PR #88为本有限切片。屏幕paint、系统授权和人工AX证据保持各自未验边界；用户取消的macOS14专项与重复物理IME不再作为复做条件。
