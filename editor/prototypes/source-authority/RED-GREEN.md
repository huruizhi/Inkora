# INK-PROT-030 限定修正红绿记录

日期：2026-11-09

基线：`6658185fd87ab3d23adbed0c5934fd852acd8f2b`

冻结 oracle SHA-256：`c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08`

## 冻结材料

管理者材料只读使用，未复制预期进模型、未修改：

- `review.cjs` SHA-256：`f3a7a118c3d748ce541fda83f2977f05b0eaea1447d3563c48ecc3d33effb8cc`；
- `RED.txt` SHA-256：`2915a3462d54905df472b9b912fd1d68cf7c8ed4df0a8c23beea02ae73c803f9`。

## RED

先在未修改实现上连续两次执行：

```text
node /Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-030-checks/review.cjs
```

两次均稳定复现：

1. textarea 把 `\uFEFFa\r\nb\r\n` 显示为 LF，页面直接提交 `value`，产生 dirty/version/Undo；
2. dirty source draft 下 Undo 旅行到旧原文并清掉 controller draft，页面仍停在 source mode；
3. 旧 tail anchor 的 visual 未随插入映射，下一次真实 PM 选区把 `Y` 写到 `c` 后。

随后先新增 `regression.mjs` 再改实现；首次运行 8 组中 7 组 FAIL（empty history 原本就不旅行，
但没有明确 draft guard）。它还独立冻结了 mixed EOL、LF/raw 后向选区和任意 parser reprojection。

## 假设与验证

| 排名 | 假设 | 验证结果 |
| --- | --- | --- |
| 1 | 页面直接读取 textarea LF `value`，丢失生产 kernel 持有的原始 EOL | 成立；复用只读生产 `TextAreaEditorKernel` 后 no-op 与局部混合 EOL 均通过 |
| 2 | Undo/Redo 缺少 dirty draft 守卫，`restore()` 又清 draft | 成立；统一入口守卫覆盖 past/future/empty，clean draft 仍可旅行并明确退出 source mode |
| 3 | `accept()` 只移动 raw anchor，visual 未经 transaction mapping | 成立；raw/visual 双映射修正首个错位，并进一步发现 replacement end 两侧语义不一致 |
| 4 | parser 与 target 不可比时无条件采用 parser projection 掩盖错 patch | 成立；改成有限共享契约，无证明的 `*a*` 重解释原子拒绝并保留 candidate raw |

replacement 边界的追加发现仍属于假设 3：PM `StepMap` 把旧 replacement end 固定映到新右边界，
原 raw mapper 却按左 affinity 压到左边界。统一两者后，连续 composition、后向替换和多次编辑通过。
多补丁 strong 定界符删除又证明不能把每个语法补丁的旧边界都冒充为同一个用户 caret；最终实现只为
单一内容补丁或显式 `sourceCaret` 新增 caret anchor，并统一验证所有新旧 anchor 的 raw/visual 边界。

## GREEN

实际执行并通过：

```text
make -C editor/prototypes/source-authority test
```

结果：`regression.mjs` 11/11 PASS；原 `test.mjs` 9 组 PASS（PRIMARY 8/8、repeat 13/13、paragraph
3/3 等）；冻结 oracle hash 保持不变。管理者 `review.cjs` 再连续执行两次，三个检查均 PASS。

相关窄控制实际通过：生产 `editor-kernel.test.ts` 7/7、selection 15/15、source composition guard
4/4 synthetic、source ledger 17/17、native transaction stage 4/4；没有重跑无关生产 125 项。

证据层级修正：旧 source no-op 是直接 controller 对照，不能证明 textarea；旧 `nativeType` 也是
controller dispatch。新证据通过真实 DOM 按钮/textarea input、生产 kernel、真实
`EditorView.dispatch` 和 native key handler；数据层直调不再标成页面证据。

## 有界结论

不可比语义只允许四类带 provenance 的共享契约：隐藏单尾空格在续写时显形、带 raw anchor 的空行
实体化、第二尾空格形成 hardbreak、空原文行激活 ATX heading。其余差异拒绝，原文/历史/选区不变，
候选 raw 保存在 `unresolvedIntent`。

未执行真实 WKWebView、物理搜狗、NSDocument/App Sandbox 或 macOS 14 实机验证；本记录不宣称这些
层级通过，也不构成 INK-008/生产合入或 M0 通过。
