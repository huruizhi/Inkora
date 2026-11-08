# INK-PROT-025 真实中文输入与撤销缺陷（修复前）

Status: observed failure; M0 remains unaccepted

## 固定版本与证据

2026-11-09（Asia/Shanghai）由用户物理键盘输入，管理者只操作模式/历史/保存点按钮并只读日志。基线 `5fbeb109ac5a4158b50014b39b3864163ae8625a`，HTML source `c86390037282e71e4187aaea46fe92354f12c669373f3d4c1be69d2287c81090`；完整构建清单和事件摘要见 `ime-hitl-025-summary.json`，原始宿主输出逐字节保存为 `ime-hitl-025-runtime.txt`。记录中的 timestamp 为 UTC。测试系统为 macOS 27.2，并非最低支持系统实测。

用户最初报告没看到窗口。管理者通过 AX Raise 抬升本次精确 App 窗口并回到编辑区域，随后观察到用户实际操作及两次上屏确认。最初光标定位在第一段；用户最终输入发生在保护块后的末段，按实际发生位置记录，未强称原定位置通过。输入法名称尚待用户确认；不能仅由拼音数据推测厂商。

## 实际观察

1. 用户先输入并删除“收到”，随后完成“中文测试”。可视区真实 compositionstart/update/end、insertCompositionText、insertFromComposition 和 isComposing=true 均被只读 observer 记录（seq24–74 为中文测试的两次组合）。组合时 snapshot composing=true/saveDisabled=true；上屏后为false/false。
2. 最终正文为 `保护块之后的中文。中文测试`，revision23/past23。管理者点击 Undo 一次：正文回到 `…中文`，revision24/past22/future1；再次 Undo：正文显示 `…中文ce'shi`，revision25/past21/future2。**失败：中间拼音暴露到正常撤销历史。** 不能以最后上屏成功、按钮守卫或字节保真宣称 IME/历史通过。管理者 Redo 两次，恢复 `…中文测试`，revision27/past23。
3. 主动进入源码并定位末段。用户输入一个空格和“源码验证”（存在一次取消组合，之后确认“源码”“验证”）。真实 source-draft 组合事件 seq81–222；组合期 sourceComposing=true、combined composing=true、revision27/past23不变、保存阻断。
4. 管理者提交源码：revision28/past24，回可视，末段 `…中文测试 源码验证`；PM caret75 / raw UTF-16 179，patch仅增加空格和四个汉字。Undo revision29/caret70 返回 `…中文测试`；Redo revision30/caret75 恢复源码输入。
5. 建立**内存**保存点 dirty=false；Undo revision31 dirty=true，Redo revision32 dirty=false，内容和选区对应。未操作NSDocument磁盘保存。

## 清理与保留门槛

Cmd+W/Cmd+Q 对无完整菜单的最小宿主未奏效。管理者确认本次 PID52179 与精确可执行路径后发送 SIGTERM，前台锁包装器退出143；不冒称正常 App Quit。用户自主切换输入法，管理者未修改系统输入源设置。无用户文档写入。

尚未完整验证：候选窗截屏、组合期全部动作拒绝矩阵、组合取消/替换选区/跨块/原生快捷键历史、修复后真实物理键盘复验、用户整体交互审阅、macOS14、正式App磁盘与资源权限。M0仍未通过；架构票12不能据本轮局部结果关闭。

## 后续任务边界

先按 diagnosing-bugs 建立可重复的红色回归（真实EditorView/dispatch/公开操作路径，合成信号必须标注，不能代替此处真实运行记录），再调查和修复可视 composition 的历史事务边界。禁止清空历史、过滤拼音字符、禁用Undo或丢弃组合输入来假通过。保护原文、PM选区、staged/pending、dirty和分支历史必须保持；源码入口和守卫不能回归。修复后须人工物理键盘复验。
