# INK-REL-193：本机输入修复 build11

用户安装build10后反馈标题光标、中文首字母重复与列表连续编辑问题。修复固定于INK-FIX-190的c22e684。
本分支task/INK-REL-193-local-input-hotfix整合190与上次189版本/安装记录，仅另将project.yml build10升11。
不增加业务/依赖/网络/权限/公开发行能力，marketing0.1.0不变。

先make build-release，源entitlements ad-hoc/runtime重签，验证版本/双架构/离线资源和精确权限。
候选通过后等待用户保存退出及独立复审/最终CI，再私有备份旧build10和恢复目录并staging原位替换；
任何仍存活Inkora进程都会阻止替换，绝不强退/丢弃。安装后用实际资源跑真实Native/WK写作25项。
只本机预览，正式签名公证与物理IME/paint/VoiceOver/macOS14实机边界不变。
完成证据追加，不提前宣告安装完成。独立worktree/中间日志保留，借用链接只移除自身创建项。

## 候选验证与门禁

实际构建源码0f3d9c5（190最终18b产品+build11；随后只有文档/审查变化）。`make build-release`退出0。
ad-hoc/runtime重签、strict/deep与精确源权限、离线资源、macOS14/正式bundle ID、双架构通过；
App editor全文件与本次构建资源相同。实际候选资源运行190真实Native/WK写作专项26/26、0失败。
同域candidate.json与原始日志记录的是本地候选，不是安装收据。193产品代码与190最终固定逐字相等。

191原命名判断关闭且无硬项；192原bare-marker Enter P2由审查者冻结18b独立15项有限DOM复验关闭，
原报告首稿完整保留。未将作者1032/26当作审查者本人实跑。

用户确认无需要保留的未保存内容并授权强退；根目录私有artifacts/deployments/build11-preclose-*
保留恢复目录备份与真实进程核验后的close.json，旧卡死进程已结束。没有操作正式文档或丢弃选择。
最终精确HEAD完整CI通过后才安装。实际安装/回退/launch收据只保存根私有artifacts/deployments与
本工作树artifacts/INK-REL-193/installation.json，不提交用户恢复正文；该收据与候选收据明确区分。
安装后复核全部包SHA并再次运行实际资源26项，失败则保留回退，不提前报告成功。

未公证状态、物理IME/paint/VoiceOver/macOS14实机未验边界不变，不进行公开Release或Keychain操作。
