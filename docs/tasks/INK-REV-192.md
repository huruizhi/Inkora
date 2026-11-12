# INK-REV-192：IME 与列表输入 Spec 独立审查

只审不修；分支 `task/INK-REV-192-ime-input-spec`，从固定受审 `c22e6841a3b5c69197a0556cfe457bd3dcdbb081` 创建。
固定base `3dac317feef5c3850c245c3b1ba634cfad6a58eb`；ref有效、三点diff非空，单条产品提交。源190工作树预检已前移到87ad9b3，且有作者借用依赖链接；未清理或改动源工作树，全部审查读本工作树冻结版本。

结果见 [独立报告](../reviews/INK-REV-192-ime-input-spec.md)：1项P2，裸 `-`/`+`/`*` 后Enter被拒且保存资格失效，已及时通知根代理；本任务不修产品。无其他已证明缺陷或scope creep。

实际运行：

- `node editor/scripts/prepare-renderers.mjs`：成功；仅写本worktree ignored资源，依赖复用根现有安装，未安装网络依赖。
- `node editor/node_modules/vitest/vitest.mjs run --root editor src/heading-entry-runtime.test.ts src/heading-composition-runtime.test.ts src/list-input-runtime.test.ts artifacts/INK-REV-192/spec-probe.test.ts`：109既有项通过；首版探针6失败，其中3个Enter为产品缺陷、3个Backspace因jsdom不执行默认删除而无效。
- `node editor/node_modules/vitest/vitest.mjs run --root editor artifacts/INK-REV-192/spec-probe-v2.test.ts`：3失败/3通过；v2以PM普通删除事务替代无效默认删除假设。
- `node editor/node_modules/vitest/vitest.mjs run --root editor artifacts/INK-REV-192/spec-probe-trace.test.ts`：3失败/3通过；保留Enter replace步骤与目标doc。
- `node editor/node_modules/vitest/vitest.mjs run --root artifacts/INK-REV-192/base/editor artifacts/INK-REV-192/baseline-control.test.ts`：base冻结归档控制3/3通过，仅核对Enter不进入unresolved。

未运行make全量/lint、Native、GUI、App/Release构建、物理输入法/paint/VoiceOver/macOS14。报告不将作者结果视为自跑。风险与未完成事项：P2由产品任务修复后需要新固定SHA复核；物理验收仍待后续。

只新增本task与review文档；不改产品/有效测试。ignored `artifacts/INK-REV-192/`、`editor/artifacts/INK-REV-192/`保留首版、v2、trace和冻结base副本；本任务自建借用软链交付前unlink，源依赖不变。
