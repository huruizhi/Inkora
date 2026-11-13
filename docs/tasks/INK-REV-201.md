# INK-REV-201：标题行首退格独立 Spec 审查

分支：`task/INK-REV-201-heading-backspace-spec`；worktree：`.worktrees/INK-REV-201`。
受审固定HEAD：`09af68a827f7eca1be9568c2abcaa43efe0b8dcb`；base及merge-base：`4e82ea0ac72f27ad5bf1b9ccf2145d87060cfd6b`。

## 范围与完成

按任务199、AGENTS、GLOSSARY、ADR-0004核对Spec；只写审查/任务文件，不修产品、不创建PR或合并。固定首稿见 `docs/reviews/INK-REV-201-heading-backspace-spec.md`。

结论：发现1项P1，headingBackwardPlan接受文档相同但目标selection不同的事务，导致虚假原文caret，下一次输入落到接合点；公开runtime dispatch可复现且snapshot仍可保存。固定基线同事务拒绝。首稿不得被补正报告覆盖。

## 实跑

先核工作区clean、固定diff非空、merge-base及提交。仅自建定向probe：公共会话2项失败；runtime/DOM6项中5过1失败；git archive冻结基线负控1项通过。命令与失败细节见审查文件；原始夹具、失败/通过日志保留 `artifacts/INK-REV-201/`，等待双层备份，不删除。依赖只借用自有symlink，结束仅unlink本人建立的链接。未安装依赖。

未运行全量1070/Native33；未运行make入口或构建；文档完成后运行 `git diff --check`。未启动App/GUI、触及用户文档、Keychain或外部消息。未做真实IME/paint/macOS14/关闭保存验收。

## 风险与未完成

固定09af不应据此审查通过发布门禁；修复归作者/主任务。收到补正SHA后可另做限定复验，保留原首稿。无其他要求内未完成项。

## 限定复验追加

固定补正 `7eb1eb0c4261f13ec25e8f02e81fe86a994c0b2d` 通过git archive隔离副本检验；未修改本分支产品。本人专用会话2项/runtime6项合计8/8通过：原错误事务原子拒绝且不污染选区、位置、history，三种正常Backspace及UndoRedo仍成功，首稿P1在该SHA关闭。原始故障演示重放显示入口拒绝；旧故障演示的3项失败断言和5项正常通过另存原样日志，不把失败冒充通过。

两个文件均只追加；用首稿提交 `2d338bc3f23e96a694da6bd28e7f04ff7633693c` 的完整blob做前缀bytes断言并记录SHA-256于ignored `artifacts/INK-REV-201/recheck/prefix-proof.json`。仅限定复验，未跑全量/Native/App。证据及worktree继续保留。提交并推送本分支后核远端fullSHA与clean状态。
