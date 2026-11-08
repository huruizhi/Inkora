# INK-PROT-026 真实搜狗复验与保存资格异常（修复前）

Status: IME history target observed fixed; save-readiness finding unresolved; M0 not passed

固定代码5bde76bab9b2bb74839fc7be99935b97d8125c66、source23730ee34cc06c708c14f7112a4dfb39cd0d0d0898831e354003b2f8764586ff、bundle df2b8056f176d260777ed4b97ef68d1978ceb46bc6524867b8464fb355d619e5。用户物理键盘/搜狗，两次上屏回复已收到。新日志是本轮真实WK，不是synthetic。

## 实际轨迹

- 用户在两次中文组合前还有普通英文输入和删除（共48个历史步骤）；不能把本轮伪写为只有两个动作。两次中文composition为seq98–127（中文）及136–156（测试），期间有真实compositionstart/update/end、insertCompositionText/insertFromComposition和isComposing=true。
- 17:50:35Z revision58/past49，17:50:45Z revision65/past50；两次完整会话各增加一条历史。随后有六条普通空格/删除历史，最终revision71/past56，末段为“保护块之后的中文。中文  测试”，caret70，blocked=null。
- 管理者先Undo六次普通编辑，revision77/past50/future6，末段回“保护块之后的中文。中文测试”；随后Undo1 revision78/past49/future7，末段“……中文”；Undo2 revision79/past48/future8，末段回原句。两次中文会话撤销不露中间拼音。
- Redo1 revision80/past49/future7为“……中文”；Redo2 revision81/past50/future6为“……中文测试”。此后Redo六条普通编辑，revision87/past56/future0，完全恢复本轮结束内容、caret70、保存可用。未额外改写用户输入，未点击源码修复或重置来掩盖异常。
- **异常：revision77/78/80/81等正常正文历史恢复点出现 blocked='Error: 补丁重解析与目标 PM 文档不一致；可信状态未提交'，pending=false且无边界问题，保存按钮禁用；revision79回基线则无blocked，revision87恢复普通编辑后也无blocked。** 本轮025目标（Undo暴露拼音）未再复现，但保存资格/拒绝诊断随历史恢复仍有问题，不宣告M0通过。是否为旧失败诊断污染、真实未提交意图或其他事务差异需先建红回归和验证，不允许直接清所有blocked。

## 证据与边界

原始完整宿主输出保存为ime-retest-026-runtime.txt，摘要ime-retest-026-summary.json包含构建清单、rawSHA、全部blocked snapshot。observer未输出PM事务meta与完整doc，不据此猜测某单一内部根因。AX正文/原文、按钮及revision/past/future由管理者真实观察；上述两区内容不能替代独立doc/source等价证明。

退出前已恢复revision87状态。宿主PID79074经精确路径核对后SIGTERM；包装器session38883退出143，不冒称正常Quit；未修改用户输入源/权限，未写用户文档。新冻结记录独立于025修复前材料。尚未覆盖：干净开局的取消/no-op/选区替换，全部组合动作，最低OS、正式NSDocument磁盘与用户整体审阅。

## 后续修正约束

先通过真实EditorView/公开操作路径重放产生相同的“有效中文正文恢复后误阻断保存”红回归，明确synthetic/replay只测逻辑。验证该恢复点的source/doc/ledger、staged/pending/trusted及未提交输入含义，再区分历史中的保存资格与瞬时操作拒绝诊断。有效安全检查不得关闭；真正pending/含混或不一致必须继续阻断并保留输入。不得为了消错清历史、抹掉所有blocked、串改冻结真实记录或手供patch假通过。025中文历史边界和024守卫不能回退。修复后真实物理键盘仍需复验。
