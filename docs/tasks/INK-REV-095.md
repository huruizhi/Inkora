# INK-REV-095：GFM 自动链接 Spec 评审

## 范围

- 分支：`task/INK-REV-095-gfm-spec`
- 固定基线：`15687430b7f2e5272975cc469e9c6ff30f0324f9`
- 评审 HEAD：`04b7f18a26cdff156f85ed2800cdca127120e0d2`
- 唯一比较命令：`git diff 15687430b7f2e5272975cc469e9c6ff30f0324f9...HEAD`
- 提交：`04b7f18 feat(editor): support GFM bare URLs and email links`；`54ae009 Merge current image lifecycle baseline` 对固定基线无新增产品差异。
- 需求来源：`docs/markdown-support.md` 的 `SYN-S016`、`SYN-S010`、`FID-*`、`ENC-*`、`EOL-*`、`GATE-*`，ADR-0004、`editor-session.md`、`save-barrier.md`、`docs/tasks/INK-M1-093.md`，以及离线 GFM 6.9 oracle。

## 结论

Spec 轴发现 1 项 wrong：邮箱及协议邮箱没有执行 GFM 6.9 的统一起点边界，非法标点后的邮箱会被错误投影为 link mark。Missing/partial 0 项，scope creep 0 项。详见 `docs/reviews/INK-REV-095-gfm-spec.md`。

## 独立验证

- 初始核对：工作树 clean；HEAD、基线、分支与交接一致。
- 临时公共 production seam：`pnpm --dir editor exec vitest run src/ink-rev-095-counterexample.test.ts`，1 test failed；`]foo@bar.baz` 得到 `foo@bar.baz` link mark，预期无 link。临时测试和借用的 `editor/node_modules` symlink 已删除。
- 未重复完整 editor、Native、Bridge、构建或性能测试；711/711、lint 与先前 Native/Bridge/Release 结果仅作为交接上下文，不冒充本评审自跑。

## 变更、未完成与风险

只新增本任务记录与 Spec 报告，未修改产品、既有证据、oracle、依赖或 lock。按“只审不修”保留上述产品缺陷；真实窗口、物理 IME、Sandbox、最低 macOS 和完整性能仍是原任务已声明的验收边界，不在本评审中重复判定。
