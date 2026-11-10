# INK-UX-126：采用900px默认阅读宽度

## 决定与范围

用户查看[INK-UX-124同窗口对照](../../.scratch/typora-ui-round3/README.md)后明确选择“默认900px，保留760px可选”。本任务以`a4af90301cda8747c405fc72513100e968ce29d9`为基线，独立分支`task/INK-UX-126-default-reading-width`；其生产基线为已合并的`main@ecfe2d96ab3368610a9af4eabbb1f98e057ed697`。不扩展为字号、段落间距或语法交互改造。

## 完成内容与文件

- `editor/src/main.ts`：新Web文档工作区初始阅读宽度900px，命令状态由同一值派生。
- `editor/src/style.css`：无内联宽度时回退900px，与初始命令状态一致；原有容器相对计算、最小边距及窄窗规则保留。
- `app/Sources/EditorCommandMenus.swift`：900px菜单移除临时“对照”标注，760px选项保留；菜单选中态继续读取当前工作区宽度。
- 三份`docs/design/`规划及对照README：记录实际用户选择，保留原始截图和捕获事实；本任务记录说明交付范围。

宽度只在当前工作区存续，不新增全局偏好；源码继续使用等宽字体。未改原文、投影映射、历史、composition、保存或资源协议。

## 实际验证

在本任务工作树运行：

- `make lint build`：通过；另独立重跑`make lint`通过。Debug App产物已生成，保留既有Swift actor-isolation及Vite chunk-size警告。
- `make test-editor test-bridge test-native`：通过。编辑器769/769，Web Bridge14/14，Native Bridge16/16；Native xcresult为Passed，192项中184通过、0失败、8个既有性能测试跳过。
- `git diff --check`：通过。

现有真实WK测试覆盖两档实际正文宽度、菜单/模式命令与snapshot/dirty/history不变；现有main测试覆盖两档切换及命令发布。本次复用这些行为测试，没有为两个默认常量新增镜像测试。

## 未验与风险

本轮没有启动App或执行XCUITest；不把上一轮手动选择900px的窗口当作新默认启动证明。宽度的实际阅读证据沿用用户已查看的760/900px原始对照，不重复物理IME或macOS14验收。受影响UI套件为`DocumentOpenUITests`、`AcceptanceUITests`；按仓库规定留待发布前集中运行。

没有替换`/Applications/Inkora.app`、修改用户文档或发布安装包。风险限于新工作区正文折行与首屏密度；760px可即时切回。借用的工具/依赖symlink会在提交前移除，主仓真实依赖不改。

## 集成

默认CI、PR及最终提交状态在交付回复和PR记录；必须基于最新main、精确HEAD默认CI通过后才合并。不得把文档中的计划写成已通过结果。
