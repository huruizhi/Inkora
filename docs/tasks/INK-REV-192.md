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

## 18b0e94限定独立后验

根提供a37修复后又提供固定 `18b0e94d49713a331ce256c4e42b7b614f716b46`，后者仅去除LedgerSpan未声明字段。分别归档editor与Native测试/脚本到ignored `artifacts/INK-REV-192/post-a37ed68/`、`post-18b0e94/`；保留首稿和全部失败，不修改冻结产品文件。

实际运行：

- 两个归档内的 `node editor/scripts/prepare-renderers.mjs` 成功；资源仅写在本审worktree内。临时复用根node_modules，不安装依赖。
- a37首版原反例6/6通过，扩展历史探针6失败；原因是Undo重建view后探针使用旧已销毁view，属夹具错误，完整原日志保留，不报产品缺陷。
- `node /Users/rayhu/Documents/projects/Inkora/editor/node_modules/vitest/vitest.mjs run --root artifacts/INK-REV-192/post-18b0e94/editor artifacts/INK-REV-192/original-probe.test.ts artifacts/INK-REV-192/continuation-history-v2.test.ts`：2文件12项通过。覆盖原Enter反例3组、PM普通删除3组，另3标记×LF/CRLF六组EOF续输、BOM/换行保真、正文删除与反向选区替换历史；输出 `post-18b0e94/runtime.txt`。
- 同一vitest root运行 `artifacts/INK-REV-192/enter-history.test.ts`：3项通过，Enter一次Undo/Redo还原原文与选区；输出 `post-18b0e94/enter-history.txt`。

首稿P2已在18b0e94限定后验关闭；15项是独立新增/复核探针，不冒充全量。Native新增case/26项计数及EOF anchor守卫仅静态核对；未运行Native、GUI、全量/lint/构建或安装。物理IME/paint/VoiceOver/macOS14仍未验。只追加本task与原报告，保留首稿全文；两个后验归档借用依赖链接交付前unlink，产物与原日志保留。
