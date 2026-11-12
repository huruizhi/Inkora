# INK-REV-184 表格 Spec 审查

独立worktree：`.worktrees/INK-REV-184`；分支：`task/INK-REV-184-table-spec`；起点冻结产品 `efa551708d824a2c98a808d18faf94ce05ffebd4`。

完成TP-TBL-02～06 Spec审查，固定比较 `16d0a6282f60b1357780aa7b964746be7e62b9bd...efa551708d824a2c98a808d18faf94ce05ffebd4`。发现4项P2：无管道数据行规模拒绝、列表首行列重排拒绝、行移动搬容器前缀、缩行改存活末行EOL。没有改产品。

交付文件：[审查报告](../reviews/INK-REV-184-table-spec.md)、[四项反例](../reviews/INK-REV-184-table-spec.probe.ts)、本任务记录。反例归档不在默认测试目录，不删除或绕过任何有效测试。

独立运行：本地renderer准备退出0；既有表格专项16/16通过；追加规格反例4/4 red已保留在本worktree `artifacts/INK-REV-184/frozen-probe.log`。未运行main/Bridge、全量、Native、App或GUI；产品与文档文件不在修改范围。四项问题已即时回报根代理；修复由根代理限定实施，后续复验另记固定SHA。

仅创建/结束unlink本worktree依赖软链，忽略产物保留；不回收worktree。提交与remote验证以交付回报为准。

## 限定补正复验追加

固定补正 `8bb27ad0bd0f29237d371551daf4cf694fa9fdd2`；仅临时导出相关五个产品源码文件，在公共runtime接缝自跑原四项反例加EOF无末尾换行Undo/Redo负控。efa对照4失败/1通过，补正5/5通过，退出0，原四项在该固定补正上已解决。原冻结报告逐字保留，追加结果见报告末尾。

固定diff、对照red、补正green与完整探针保留于 `artifacts/INK-REV-184/`。临时源码已恢复，新增产品导出文件与自建依赖软链仅unlink；没有cherry-pick产品提交，没有扩大到全量、Native或其他审查项。仍未独立验证物理输入/IME、Native/WK及真实保存重开。
