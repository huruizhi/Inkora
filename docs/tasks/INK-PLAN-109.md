# INK-PLAN-109：当前系统验收范围与桌面续验

基线：`1e1e4561c7c79b36bd081e04bc54b54e8beffc41`。分支：`task/INK-PLAN-109-current-system-acceptance`。

## 用户决定

2026-11-10 用户明确：“不验收14版本。继续推进”。本轮取消 macOS 14 版本专门验收，不修改 macOS 14+ deployment target，不伪造兼容性通过结果。更新当前系统验收决定、acceptance/testing/release/performance 对应条款。原始历史结果保留；其余功能/数据完整性/真实输入法/授权/AX/显示与性能门槛保持。

## 当前系统实际续验

- 当前环境 macOS 27.2 arm64。按仓库脚本取得生产 UI 互斥锁后，`scripts/ci/ui-preflight.sh desktop` 实跑通过。
- 使用已校验的专用 `com.huruizhi.Inkora.UITesting` Release bundle，产品代码 `7305b97`；与当前 main 的生产源码相同。文档从冻结样本复制到唯一临时目录，原始包与用户正式文档不修改。
- 通过真实系统 Open 面板打开 `02-Structure.md`。用 CUA 原生 AX/键盘完成任务一 checkbox、单元格 `text → edited`、代码语言 `ts → python`、实际查找面板的两处 `alpha → beta`。
- 一次 Cmd-Z 回到两处 alpha，Cmd-Shift-Z 同时恢复两处 beta；表格/任务/语言保持。Cmd-S 后，磁盘原文精确等于独立推导的预期 186 bytes，SHA-256 `09b3933fadd1bde1511c4b0621bfe1bba8821f51da0bbc239480f49a2a4f96c7`。
- 主动源码 no-op 往返，真实关闭文档并经 Open 面板重开；观察任务状态、单元格、Python 选择、两处 beta 与链接保持，实际截图检查布局。统计随编辑从54变56、两处 alpha 改 beta 后回54，未把不相关预览当正文。
- CUA `selectText` 针对含工具栏的整个编辑器 AX 文本时曾选中不期望的大范围，未在该选区写入；改为双击实际单元格并确认只选中 `text` 后才输入。此为自动化工具选区校准，不报成产品故障。
- 已打开 `01-IME.md` 并将折叠光标定位到 `Input here.` 后，等待用户按提示用实体搜狗完成两个会话。准备好窗口不算该项通过。

精确输入、预期、实际文件与系统/动作摘要见 [证据目录](../evidence/INK-PLAN-109/)。窗口/AX与截图观察还保留在本轮 CUA 对话轨迹中；未声称生成独立截图文件。

## 校验与边界

- `git diff --check`、文档链接与变更范围检查：见提交时实际结果。
- 本任务只改文档/验收证据；不改变产品源码、测试、依赖、Bridge、权限配置或 deployment target。没有因文档变化重复声称 editor/Native 测试自跑；合并仍需最终精确提交的默认 CI。
- 手动桌面续验不等于完整 XCUITest 套件通过；实体中文、Esc取消、选区替换、源码中文、目录授权/书签、系统拖放/剪贴板、VoiceOver、深色/放大字体及可见性能等未执行项仍需逐项结算。仅 macOS 14 版本专门验收被用户排除。
