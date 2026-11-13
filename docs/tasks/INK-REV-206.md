# INK-REV-206：标题取消格式空格补正 Standards 复审

状态：限定审查完成；仅审不修。

分支：`task/INK-REV-206-heading-space-standards`。worktree：`.worktrees/INK-REV-206`。
受检固定提交：`6d373122a245bee219fb7523fef2e9fd31e357b2`；基线：`b7cdd790a702dc38c0709035098c986a7252360f`。
审前status干净、refs有效、merge-base=基线且diff非空；唯一产品提交 `fix(editor): preserve accepted spaces when unformatting headings`。

完成：全文读8份标准、搜索附加标准、独立审查全部7文件hunk并逐项核12个Fowler heuristic。书面hard0、possible0。详见[审查报告](../reviews/INK-REV-206-heading-space-standards.md)。不以Spec结论替代Standards。

仅新增：

- `docs/reviews/INK-REV-206-heading-space-standards.md`
- `docs/tasks/INK-REV-206.md`

实际命令与结果：

```sh
pnpm --dir editor exec vitest run src/heading-edit-contract.test.ts
# exit 0；1文件，6测试通过
git diff --check b7cdd790a702dc38c0709035098c986a7252360f...6d373122a245bee219fb7523fef2e9fd31e357b2
# exit 0；无输出
```

另以Python对157份editor文件逐一核受检Git blob，全部相同；原始日志、冻结清单与diff在ignored `artifacts/INK-REV-206/`。仅借用根editor/node_modules自建symlink，已unlink；未安装依赖、未删除测试。

未跑全量、Native、GUI、Xcode、构建、CI、安装；作者1079项不作本人结果。限定审查无未完成事项；主任务的build16资源、Native绿、精确HEAD CI及物理验收仍需独立结算。风险：6项公开模型契约不等于真实IME、WK焦点及保存/关闭通过。没有PR/merge/Issue、应用或用户文档操作。

交付提交以本分支HEAD及执行回报完整SHA为准，避免文档自引用commit；提交后push自有分支，并以真实 `git ls-remote` 核对远端HEAD一致、statusclean。worktree及ignored产物保留待两层备份。
