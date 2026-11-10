# INK-REV-140：Spec 独立审查

- 分支：`task/INK-REV-140-rhythm-tools-spec`。
- 初始受检HEAD：`ce4dd2ff0487ead9d0970f21b81d9d6b84bae009`；基线：`666ef210b814c1a7e779b7468781764b44980239`。
- 完成：固定HEAD/非空diff/七提交核对，A/B全部条款与第二轮计划Spec审查；报告发现0项，保留未验边界。未修产品，未混入Standards轴。
- 修改：仅新增`docs/reviews/INK-REV-140-rhythm-tools-spec.md`与本任务记录。
- 本人实跑：`cd editor`后`node node_modules/vitest/vitest.mjs run artifacts/INK-REV-140/spec-probe.test.ts src/table-menu.test.ts`，2文件4项通过，exit 0。2项自建探针覆盖选区往返过期、Esc取消、源码/销毁后旧按钮；另2项为现有菜单测试。本次未运行lint/build/全量测试。
- 临时证据：`editor/artifacts/INK-REV-140/spec-probe.test.ts`，被忽略，保留供管理者备份；只暂借主仓`.tools`及`editor/node_modules`两项自建symlink，提交前unlink，不删除真实依赖。
- 风险/未完成：未独立复跑WK几何、paint、物理IME、AX、macOS14或App验收；动态readonly及全部历史排列未实跑。作者88项与隐藏WK八组合不归为本人实跑。详情见审查报告。
- 交付：本提交包含两份报告；fullSHA及真实remote=HEAD/clean核对结果随最终消息交付。不得自行PR/合并/安装或回收；通知管理者先备份commit与临时证据，再由管理者回收工作树。
