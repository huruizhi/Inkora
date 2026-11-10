# INK-UX-128：纠正右上角侧栏按钮

## 用户更正与基线

用户指出右上角两个图标功能理解错误：最右侧应展开左侧大纲，三横线按钮删除。以包含最新main及125/127交付的`0d7a6cd`为固定基线，独立分支`task/INK-UX-128-outline-corner-button`。125原先“额外三横线大纲+最右模式切换”的设计被本次明确更正取代；原历史证据不改写。

## 完成内容与文件

- `editor/src/main.ts`：删除角落模式切换按钮及其事件/状态处理；原生菜单与快捷键模式命令不变。
- `editor/src/document-analysis-panel.ts`、`style.css`：既有大纲开关改用左侧栏图标，位于阅读统计之后，成为最右侧唯一图标按钮；删除三横线图标和旧模式图标样式。仍复用同一个左侧大纲状态、AX属性、焦点及composition守卫。
- `main.test.ts`、`document-analysis-panel.test.ts`：真实DOM回归检查仅两个按钮、最右侧开合大纲、不切换模式、pointerdown不夺焦点、零额外Bridge消息及snapshot精确不变。
- `EditorWebViewTests.swift`、`DocumentOpenUITests.swift`：将旧模式图标预期更新为侧栏图标/大纲开合；保留原生菜单模式切换及其他有效断言。
- `docs/document-analysis-panel.md`与本记录：同步当前入口契约。

## 实跑验证

- 修改测试后先重放原产品：最右侧唯一按钮回归1 failed / 118 skipped，准确暴露额外模式按钮（另一个测试文件未命中筛选，未计作红例）。
- 修复后`pnpm --dir editor exec vitest run src/main.test.ts src/document-analysis-panel.test.ts src/search-panel.test.ts`：3 files / 150 passed。
- `make lint editor-build`：通过，包含Swift严格格式检查、TypeScript及Vite生产构建；保留既有500kB chunk-size警告。
- `git diff --check`：通过。

## 未执行及交付边界

遵守用户对持续占屏的反馈：本轮不运行App、CUA、Native/WK测试、XCUITest，也不触发会运行原生宿主的默认CI。两个Swift测试仅更新预期并通过格式检查，未声称执行通过。未改Markdown、selection/history、保存及图片协议，无新增依赖。

提交候选不等于已安装修复：本轮不替换或启动`/Applications/Inkora.app`。合并仍受仓库“精确HEAD默认CI成功”的门禁约束，因此先保留分支/PR候选，不跳过CI合并。后续验证集中安排，不能因本记录自动重新占用桌面。临时借用依赖symlink提交前移除。

## 后续交付阶段

用户随后明确要求合并、删除本地其他安装，并反馈应用图标的I太粗。交付范围据此增加：

- `design/icon/render-icon.swift`与10个AppIcon PNG：竖干由120收细至60设计单位，横线由46收细至22；保留黑灰、I形光标及原页面/文字背景。查看256px与32px离线渲染，确认小尺寸仍可辨；不把此检查称为Dock实机验收。
- 合并前按仓库门禁对最终提交运行默认CI，`ui-tests=false`、`full-bench=false`；仅运行后台层与hostless原生检查，不触发XCU、窗口截图对照或App启动测试。最终结果、PR与安装校验记入交付回复/PR，不能把计划当作通过。
- CI通过后，用精确提交的通用Release包更新`/Applications/Inkora.app`；验证签名、bundle身份、双架构、Web资源与图标一致。不强退当前运行的App、不改用户文档；旧进程可能继续显示旧界面/图标，等待作者正常退出重开。
- 旧备份安装及重复开发App仅在新包验证后移入废纸篓，并注销相应Launch Services路径；不删除源码、工作树、测试证据或文档。清理清单留在本地artifacts，不把移动到废纸篓称为不可恢复删除。
