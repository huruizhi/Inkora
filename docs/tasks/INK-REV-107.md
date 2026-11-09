# INK-REV-107：parser 补正 Spec 审查

状态：完成，只审不修。受检 HEAD `fab0bccc98dc62518af462fb97f54660d46b328a`，基线 `47c0d54735c70b9e55268ad43f9f085f08ff4dd6`；工作区起始清洁且 diff 非空。

结论：missing/partial 1（P1），scope creep 0，wrong 0。闭合 Mermaid、同 raw 重开旧事务、BOF EOF-only `---` 三个原反例均已转绿；但 canonical `SYN-S005` 明定无 closing fence 仍是合法围栏代码块，当前未闭合 Mermaid 仍被专属降级为 `SYN-U002`。详见 `docs/reviews/INK-REV-107-parser-corrections-spec.md`。

实际运行：

- `protected-parser-review.test.ts`：3/3 passed。
- `source-authority-runtime.test.ts -t 'keeps the metadata opener input rule'`：1 passed。
- `protected-source-runtime.test.ts -t 'horizontal-rule'`：2 passed。
- `source-explicit-save.test.ts -t 'allows exact UTF-8|does not let a source receipt'`：2 passed。
- 生产 Session 水平线控制：5/5 passed；未闭合 Mermaid/TypeScript 对照稳定复现上述 finding。

未修改产品、测试、依赖、锁、既有证据或冻结 oracle；未运行完整套件、Native/Bridge/Release、lint、性能与 GUI。临时 `editor/node_modules` symlink 已清理。
