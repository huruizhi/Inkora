# INK-M1-039 管理者独立验证

固定候选：09376154dea90b26843780630efda096722e46aa；基线271922e。结论：非UI候选暂不接受，补正后复核。

## 实际运行

锁定主仓pnpm运行完整editor test：19文件325项通过，exit 0。随后使用真实createEditorRuntime、EditorView.dispatch、现有PM命令及DOM composition生命周期建立独立反例：5项均准确失败，未修改产品。

- 对正文选区分别toggleMark strong/em/code，命令返回true，但实际PM mark未生效、原文未变化。新source-transaction不能处理已存在的addMark路径。
- setBlockType将正文段落改为二级标题，命令返回true，实际PM仍为paragraph，原文未变化。
- 同一composition ID：compositionstart、中间事务、compositionend、排空runtime计时器、晚到最终事务。runtime发出两次document回调，依次为`azh\n`及`a中文\n`；期望一个逻辑文档变更。main直接把每次回调转换为Bridge状态变更，独立模型的logicalRevision没有消除这个重复发布。

上述为synthetic/replay真实生产DOM/dispatch证据，不代表物理输入法。对应V1“普通已声明写作操作不得以安全拒绝替代”和“一个IME逻辑单元一次Bridge发布”的要求。

只读冻结原件位于本机归档`root-m1-checks/INK-M1-039/`：root-v1-review.test.ts、ROOT-V1-RED.txt、CANDIDATE-325-PASS.txt。测试SHA：f5818d1f76cf9b53958854fc9ef82afb5e836b2edd58f9af33c8a15070f01604；红日志SHA：1c86e7f8c60abceb4b3fc493493c9414d38202c8562e522eb2463833683ca3ab。临时测试和依赖链接已移除，原325测试与预期未改。

## 后续与回收

INK-M1-045以同一候选为起点补正真实基本格式/结构命令和IME发布边界；INK-REV-043仍进行独立规格轴审查。INK-REV-044规范轴无书面hard违反，另列6项判断类问题；不以规范通过覆盖本功能失败。

039执行Agent及workspace已归档，238文件逐项SHA与Git bundle备份验证通过。main未合入该候选；未启动GUI、未执行NSDocument文件保存/关闭重开，不能宣告V1或首阶段完成。
