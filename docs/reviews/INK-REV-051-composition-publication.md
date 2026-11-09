# INK-REV-051：composition 发布与选区边界

固定组合起点 c18bc9df278bcdc87e5c697b9f955886b303b5e7，包含 049@50cdf2c、045 格式补正、046 高亮、047 源码可见性。原 049 完成候选不直接视为验收通过。

## 独立反例与单变量诊断

真实生产 runtime + EditorView.dispatch：compositionstart → 拼音 zh（meta172）→ compositionend → 无 docChanged 的选区事务 → 同 meta 最终中文。同步选区事务后 changes 已是 azh，故两个 caret 位置均红（2 红 1 绿）；尚未等待 timer，排除 quiet window 为直接触发因素。

按 diagnosing-bugs 排序并分别验证：一、runtime 把任意无 meta 事务当作普通编辑强制封口；二、session 在检查 docChanged 前也会 finishComposition 拆开历史；三、计时器过早（同步反例不支持）。单改 runtime 后最终发布值正确，但两个 Undo 都回 azh，证明第二层仍坏；第二处调整后全链绿。

## 修复与永久回归

只允许实际 docChanged 事务触发新输入边界。选区事务仍通过同一 ledger 验证并更新当前选区和 anchors，但不启动或结束 composition 历史单元。不改协议字段、依赖或保存校验，不关闭 Undo，不按拼音过滤。

永久 composition-publication.test.ts 四项覆盖：公共稳定边界后的 final、snapshot、Undo/Redo；end 后的两个 caret 位置；active 期 backward 选区与不同 meta 的非编辑事务。

旧冻结 045 最终值反例原件保持不变；049 已引入公开异步稳定接口，新增控制使用 whenCompositionStable，而非要求 10ms 后同步 document 发布。要求仍是一会话只发布最终 raw，snapshot、Undo/Redo 一致，未删除最终值断言。

## 实际验证

- 初版三项：2 failed / 1 passed。
- 仅 runtime 修复：2 failed / 1 passed，失败从中间发布变为 Undo 返回拼音。
- 双层修复与加强：4/4 passed。
- 完整 editor 含 Bridge：23 文件 406/406 passed。
- make lint（主仓锁定 pnpm）：通过。
- editor 生产 build：通过，单 chunk 超过 500 kB 警告保留。
- git diff --check：通过。

本轮未启动 GUI、真实 IME 或 NSDocument；四项仍是 synthetic replay 与真实 runtime/EditorView 接缝，不能当作物理中文验收。原 049 执行 Agent/workspace 已经 240 文件和 Git bundle 校验备份回收；完成 workspace 累计 57。
