# INK-PROT-034：剩余真人验收与取消诊断

## 固定候选与层级

基于031提交52cfa06375880fb2b566dbc58a14b959a80c1330，控制器为030候选493e2b7产物。入口 source SHA为4b8a2a3d51071ce6a5e6456f48c86f65f88d0786253f4959c768bddfc2ceca99；bundle SHA为7aaa2e7f7ff79104c01bf378dd79c959a084ba7a14ce480f82a978e26c23c807；observer SHA为073c1a46640c0855d7ca2c73068299519cc1faac9403de4536b7f4b906556950。

宿主新增自身Sandbox缓存JSONL落盘。后续取消诊断再增加应用本地的特殊键监视器、标准NSTextView和Quit菜单；不修改HTML、控制器、observer、输入法配置或系统权限。build metadata基线仍是52cfa06，宿主插桩差异以本任务git diff为准。

## 结果

H2通过：物理搜狗直接替换已选“测试”，无预删除。一次Undo恢复原字和原选区，一次Redo恢复“替换”和提交光标；保护片段和其余原文不变。

H3通过真实操作变体：用户在草稿中先按两次Backspace删除“替换”，再用搜狗输入“源码验证”。原追加断言false保留于H3-after-input.json；actualVariant按组合前草稿/选区和实际事件独立推导并核对。组合期间权威原文不变且保存被守卫；Apply单个文档历史单元，跨模式Undo/Redo、选区和内存保存点正确。不是正式NSDocument磁盘保存。

H1尚不确定：用户报告Esc取消且正文未变，原生WK却记录“取消”提交，实际原文和history改变。用户进一步确认来自Mac本机实体键盘。旧observer不含原生键码，不能据此归因。H1-runtime-prefix和结果原样保留。

准备阶段还观察到源码EOF换行后的raw43锚点直接输入X被安全拒绝，未丢原文。实际点击段内raw31后编辑/Undo正确。此限制待冻结契约分类，不隐去为全通过。

## 证据与后续诊断

H2-H3-runtime-prefix.jsonl包含392条真实宿主记录，其SHA为b2b43edf54b420a8c15aa9b8c067d65f8a4785b72083a9687feccc844f881537。SHA256.json固定本轮原始材料；不改031原记录。

取消诊断仅在本原型window记录Esc/Return/Space/Delete键，原样返回事件；不监听全局、不申请权限。NSTextView的setMarkedText/unmarkText/insertText/command仅记录后调用super。尚未宣称真实取消通过。第一次CUA无候选Escape仅验证记录接缝收到keyCode53/cancelOperation，不能作为物理搜狗证据。

实际执行：make -C editor/prototypes/fidelity/native-host verify ENTRY_HTML=<本worktree>/editor/prototypes/source-authority/PROTOTYPE.html，通过编译、ad-hoc严格签名和资源哈希核验。未重复生产315项测试（无生产变更）。M0/架构/首阶段交付均未据此宣布通过。
