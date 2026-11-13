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

## 2026-11-14 固定afa00ca限定追加

受检 `afa00cab84a5fd184cc63b0ba65e7a8ec862ffbe`，追加基线 `6d373122a245bee219fb7523fef2e9fd31e357b2`；refs/merge-base/非空diff已核。原首稿逐字prefix保留，仅追加本节及报告追加节。

完成：核新语法删除区间减去可见span的hunk及第7公开测试；沿原8份未变化标准逐项核12个Fowler heuristic。新增hard0/possible0；不代判207 P1关闭。只读Git固定导出，不读取根动态Native夹具。

本人实际：`pnpm --dir artifacts/INK-REV-206/visible-syntax/fixed/editor exec vitest run src/heading-edit-contract.test.ts` 退出0、7/7通过；固定追加 `git diff --check` 退出0；157份导出editor文件逐字核目标Git blob一致。首稿report/task与原commit及目标整合blob核prefix一致。原始日志与清单在 `artifacts/INK-REV-206/visible-syntax/`，仅自建依赖链接已unlink。

仅追加原两文档，无产品修改；无全量、Native、构建、GUI、CI、安装或IME结果。限定审查无未完成；Spec关闭、WK/IME及候选交付仍属独立门槛。提交/push后真实核远端=HEAD及statusclean，完整SHA以执行回报为准；worktree及产物保留。
