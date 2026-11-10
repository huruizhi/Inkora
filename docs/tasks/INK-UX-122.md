# INK-UX-122：Typora 同尺寸对照与第二轮规划

## 请求与范围

用户要求先按 Ask Matt 做真实对照、规划调整项；已允许解锁后用自有示例只读查看，并亲自统一两窗口尺寸。继承“不再重复输入法测试”“不做macOS14专门验收”“排版后继续技术内容体验”的既定决定。

采用 Ask Matt 的 research → grill-with-docs 路线：一个 fresh-context 研究支线核对官方文档与固定代码，主会话负责自有文档真实窗口、截图和计划。没有进入实施流程，没有新增产品依赖或修改产品文件。

基线：`main@3e26211713ff0f78f0e90286a6125ce613b3e442`；工作树 `.worktrees/INK-UX-122`；分支 `task/INK-UX-122-typora-comparison-plan`。提交以本分支的 `docs: plan second Typora experience alignment` 为准，不在提交内循环写自身SHA；推送后向用户回报完整commit。

## 完成内容与文件

- `.scratch/typora-ui-round2/TYPORA-REFERENCE.md`：官方来源、固定代码事实、已有能力与差距候选，包含菜单路由依赖及独立图像复核。
- `.scratch/typora-ui-round2/COMPARISON.md`：实际App版本、fixture及安装文件SHA、同尺寸证据、差距、未验事项。
- `.scratch/typora-ui-round2/SCREENSHOTS.sha256` 与 `screenshots/*.jpg`：6张3714×2100原始JPEG及哈希；仅纠正扩展名，没有重编码。
- `docs/design/typora-ui-round2-plan.md`：五个有依赖的建议切片、状态/保真约束、可观察验收、待用户决定的两项前沿。
- 本任务记录。

判断：当前观感仍未达到Typora。已证实的优先候选是常驻顶栏占位、局部标题间距和表格激活工具密度；760px列宽是既有选择，须独立对照。块公式/图表/脚注已存在，不再按旧基线宣称缺渲染器。底部统计、图片授权及原文保存策略保留有意差异。

## 实际执行与结果

- `git rev-parse HEAD`、`git status --short --branch`：固定基线一致，任务开始时clean。
- `INKORA_UI_LOCK_TIMEOUT=10 scripts/ci/with-ui-lock.sh scripts/ci/ui-preflight.sh desktop /usr/bin/tail -f /dev/null`：取得UI锁，desktop预检通过；只读对照结束后Ctrl-C退出，`/tmp/inkora-ui-tests.lock`已释放。
- CUA：打开自有示例独立窗口，滚动/聚焦/查看菜单，保存截图；用户统一尺寸后用`sips -g format -g pixelWidth -g pixelHeight`确认六张均JPEG/3714×2100。未改主题、系统外观、授权、正文或用户真实笔记。
- `shasum -a 256`：结束时实际打开的110 fixture与基线副本均为`90885c3f…6293`，未编辑；安装文件实际SHA记入对照报告。
- 在`.scratch/typora-ui-round2`执行`shasum -a 256 -c SCREENSHOTS.sha256`：6/6 OK。最初从仓库根校验因相对路径错误失败，改为清单所属目录后通过；图像未改。
- 文档本地链接存在性、截图magic/数量、任务diff范围及`git diff --check`：交付前检查。
- **未运行**`make lint`、`make test`、`make build`、Release、Native、Bridge、XCUITest、物理IME或正式保存重开。本任务仅研究/截图/文档，不援引既有测试数充当本轮执行。

## 未完成、待决策与风险

- 两个独立选择仍待用户答复：先补菜单/快捷键再收顶栏；先用760/约900px做阅读对照再定默认。当前计划是可审阅建议，不是实施许可。
- 后段CUA两次返回`cgWindowNotFound`，库存显示App仍运行但无法重新绑定；未据此诊断用户锁屏或App故障。继续实机交互停止，已取得截图足以支持有限结论。
- 未完成窄窗/深色/同正文列宽、Typora表格激活、成功授权图片、行内标记与完整技术内容修改的配对。定位失败的Typora表格截图不当作激活态证据。
- 六张同尺寸截图不代表同主题/缩放/列宽，不能据屏内段落数给像素一致结论。安装文件版本与SHA已记录，但不据此断言完整源码/二进制等同。
- 顶栏优化牵涉Native/Web命令资格，不能先删入口；行内标记显隐与局部公式编辑需要隔离设计，不能放宽投影/保存门槛。
- 未改main、产品、现有冻结资料、Issue或发布包；本任务不宣告Typora整体对齐或首阶段验收通过。
