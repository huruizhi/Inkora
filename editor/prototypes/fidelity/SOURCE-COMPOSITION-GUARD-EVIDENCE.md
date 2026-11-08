# INK-PROT-024 源码 composition 操作守卫证据

日期：2026-11-09。分支：`task/INK-PROT-024-source-composition-guard`。固定基线：`6360a2904cb07f9d94f1a9169fc709962f4f1a99`。

本任务只修改 fidelity 原型入口、检查、文档和重建产物；未修改 `native-host/`、`model.ts`、source ledger、冻结 fixture、生产代码或依赖。这里的 `CompositionEvent` 是 **synthetic-signal-guard**：只验证守卫对合成状态信号的响应，不是系统中文 IME、候选窗、WKWebView 或桌面输入验收。

## 修复入口

- `main.ts` 统一读取 ProseMirror `view.composing` 与生产 `TextAreaEditorKernel.composing`。任一为真时，`run` 拒绝会修改 view、source draft、模式或历史的动作。
- 拒绝路径只更新诊断和按钮状态，不调用 `EditorView.updateState`、`sourceKernel.setText`，不强制 flush、不移动 textarea 光标，也不退出源码模式。
- visual/source composition 分别显示在状态诊断中；组合期间按钮统一禁用，结束后恢复既有保存/模式条件。
- `window.fidelityPrototype.sourceComposing` 与 `window.fidelityPrototype.composing` 是只读 getter；没有暴露可修改 kernel，也没有把合成事件解释为 IME 已完成。
- composition 结束后仍由现有 ProseMirror 与生产 textarea kernel 处理正常输入；本任务未重写 PM 的内部 IME 流程。

## 独立 DOM 回归

`source-composition-guard-check.mjs` 从最终 `PROTOTYPE.html` 启动真实 jsdom DOM 与 bundle，共 4 组：

1. 对 `apply`、`cancel`、`undo`、`redo`、`reset`、重复 `source` 和可视 `text` 动作逐个使用独立初态。源码 composition 信号期间均拒绝；草稿全文、textarea 选区/方向、source mode、可信 source、PM doc/selection、dirty、revision、past/future 完全不变。测试替换 `view.updateState` 计数，compositionstart 诊断与每条拒绝路径均为 0 次；全部按钮为 disabled。
2. compositionend 后，生产 textarea kernel 正常登记输入，`\uFEFFa\r\n` 提交为 `\uFEFFa中\r\n`；BOM 与 CRLF 保留，随后 Undo/Redo 恢复两端字节。
3. 无 composition 的普通 source typed draft 继续提交；逐字节相同的 no-op 不增加 revision/history。
4. 原有 visual composition 守卫继续有效，`sourceComposing=false`、combined `composing=true`；compositionend 后普通可视动作恢复。

## 实际验证

在本工作区复用主仓库锁定依赖，仅临时建立 `editor/node_modules` symlink；未执行 setup/install。实际结果：

- `make -C editor/prototypes/fidelity test`：PASS；37 组合 + 4 staged native + 16 ledger integration + 4 source composition guard。
- `node editor/prototypes/fidelity/source-ledger-check.mjs`：17 组 PASS。
- `node editor/prototypes/fidelity/selection-check.mjs`：15 项 PASS。
- `node editor/prototypes/fidelity/audited-crossval.mjs editor/prototypes/fidelity-cases editor/prototypes/fidelity/PROTOTYPE.html editor/prototypes/fidelity/audited-crossval-results.json`：PASS；16 个累计步骤、3 个 isolated、3 个 probe，失败/不支持/runner error 均为 0。
- `python3 editor/prototypes/fidelity-cases/verify.py`：11 用例、49 步、582 项 PASS，fixture 未修改。
- legacy `crossval.mjs` 仍输出其既有 05/06/11 非 audited 路径失败；02/03/09/10 通过。当前 native 结论继续以 audited driver 为准，本任务未改 oracle。

最终 `PROTOTYPE.html` 由当前源码完整重建：SHA-256 `c86390037282e71e4187aaea46fe92354f12c669373f3d4c1be69d2287c81090`，397611 bytes。`audited-crossval-results.json` 已随新 bundle 重放并记录该 SHA。

## 未覆盖与风险

- 未启动真实桌面、WKWebView、系统中文 IME、候选窗或物理键盘；合成事件不能证明真实事件顺序、焦点、候选提交、撤销分组或 AppKit bridge 行为。
- 未修改或重建 `native-host/`；旧 022/014 runtime 结果不能外推到本 bundle。
- 未验证磁盘保存/重开、NSDocument、App Sandbox 或用户文件。
- 本检查证明的是操作守卫与恢复路径，不表示完整 composition history 分组、通用 source map、M0 总门槛或生产架构采纳完成。
