# INK-REL-193：本机输入修复 build11

用户安装build10后反馈标题光标、中文首字母重复与列表连续编辑问题。修复固定于INK-FIX-190的c22e684。
本分支task/INK-REL-193-local-input-hotfix整合190与上次189版本/安装记录，仅另将project.yml build10升11。
不增加业务/依赖/网络/权限/公开发行能力，marketing0.1.0不变。

先make build-release，源entitlements ad-hoc/runtime重签，验证版本/双架构/离线资源和精确权限。
候选通过后等待用户保存退出及独立复审/最终CI，再私有备份旧build10和恢复目录并staging原位替换；
任何仍存活Inkora进程都会阻止替换，绝不强退/丢弃。安装后用实际资源跑真实Native/WK写作25项。
只本机预览，正式签名公证与物理IME/paint/VoiceOver/macOS14实机边界不变。
完成证据追加，不提前宣告安装完成。独立worktree/中间日志保留，借用链接只移除自身创建项。
