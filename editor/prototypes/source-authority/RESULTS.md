# INK-PROT-030 结果

## 结论

在冻结的有界范围内，source-authoritative 目标契约可由“唯一当前原文 + 带 provenance 的真实 PM
投影”满足，不需要在 Save 时才把 candidate 升格为文档。合法尾随空格、编辑空行和源码格式变化
一经接受即进入 `currentRaw`；Save 只移动 `savedRaw`。语义 parser 隐藏的字节通过明确 raw span、
affinity 和 projection anchor 审计，不以 `trim`、无条件 `doc.eq` 忽略或入口标签放行。

这只回答 INK-PROT-030 的原型问题。它不构成生产迁移、M0 通过或 PM 对任意事务安全的承诺。

## 新原型自动证据

2026-11-09 实际执行：

```text
make -C editor/prototypes/source-authority test
```

结果：退出码 0，严格 TypeScript、离线 HTML 重建、11 组限定回归和原 9 组集成域全部通过：

1. 冻结 PRIMARY P0–P7：`a+LF → Space → Save → source no-op → scratch 新 epoch → b → Undo/Redo`。
2. 13/13 repeat vectors：无 EOF 换行、BOM/CRLF、strong/em/strike、行内/引用链接、标题、列表、
   引用、保护片段邻接和 Unicode。
3. 3/3 paragraph cases：Enter、Space→Enter、CRLF Enter，均能停在空行时 Save、重开和续写。
4. 单空格 softbreak、双空格 hardbreak及未影响后缀。
5. 隐藏空格重开后的真实 EditorView Backspace，只删除该空格；Undo 恢复原字节和 caret。
6. 同 epoch Save/history、后向选区替换、源码格式变化和 draft/document dirty 分离。
7. pending math + 源码修复、保护片段未映射、过期事务、非法 Unicode/EOL 边界、composition guard、
   empty history 真负例。
8. 两个完整 synthetic composition 历史单元，以及取消/no-op 保留已有 future。
9. `# ` 的有界正例：字节、heading 语义、选区、Undo/Redo 均有断言。

限定回归另覆盖：真实 DOM 按钮/textarea 的 BOM+CRLF no-op、混合 EOL 局部编辑、LF↔raw 后向
选区、source composition 提交、dirty draft 对 past/future/empty Undo/Redo 的统一拒绝、clean source session 的明确旅行退出、
所有 anchor 的 raw/visual 同步映射、后向替换、重复文字、多次编辑、marks 后隐藏空格，以及无证明的
parser reprojection 原子拒绝并保留候选意图。

测试读取冻结 `ORACLES.json`，先核对 SHA-256
`c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08`；预期从冻结文件读取，
测试和模型均不写 oracle。

本次固定离线 HTML SHA-256：
`872c4653472f75e4d34b44400936af5725c638e92c00ac6ea638bfb41139f81b`；同值由
`PROTOTYPE.sha256` 保存并由构建更新。

## 测试接缝修正

旧 `test.mjs` 的 source no-op 直接调用 `controller.beginSource()/applySource()`，绕过浏览器把 CRLF
归一化成 LF 的 textarea；旧 `prototype.nativeType()` 也直接调用 `controller.nativeType()`，所以“每次
视觉编辑都经 view.dispatch”的注释并不成立。本轮改为：source 回归点击真实按钮并发送 textarea
`input`，页面复用生产 `TextAreaEditorKernel`；视觉输入/替换经真实 `EditorView.dispatch`，Enter/
Backspace 继续经真实 key handler。控制器直调只保留为明确的数据层控制，不再冒充页面证据。

管理者只读 `review.cjs` 在修复前连续两次稳定得到三个 FAIL，修复后连续两次全部 PASS；完整红绿记录、
冻结文件哈希与假设验证见 `RED-GREEN.md`。

## scratch 与 Save 的证据层级

| 层级 | 本次结果 | 能证明什么 |
| --- | --- | --- |
| 冻结数据 oracle | PASS | JSON/UTF-16/UTF-8 预期与固定哈希一致 |
| jsdom + 真实 EditorView | PASS | 真实 PM transaction/key handler、公开控制器、投影/选区/history 状态机 |
| Node scratch 文件 | PASS | 隔离临时 `INK-PROT-030-PROTOTYPE-scratch.md` 的真实 UTF-8 写读与新 epoch 重开 |
| HTML 内存 Save | PASS | Save 只更新同一原文保存点，投影/caret/version/history 不变 |
| 真实 WKWebView 普通输入 | 未执行 | 不能从 jsdom 外推 DOMObserver/WebKit 时序 |
| 物理搜狗 IME | 未执行 | synthetic/replay 不是候选窗、marked text 或物理键盘证据 |
| NSDocument / App Sandbox | 范围外 | scratch 不是用户文件、NSDocument、冲突处理或安全作用域验证 |
| macOS 14 实机 | 未执行 | 当前自动层不证明最低系统行为 |

## 旧冻结控制组

本轮限定修正另外实际重跑了与复用接缝直接相关的窄控制，均退出码 0：

- `vitest run src/editor-kernel.test.ts`：7/7；
- `selection-check.mjs`：15/15；
- `source-composition-guard-check.mjs`：4/4 synthetic signal guard；
- `source-ledger-check.mjs`：17/17；
- `native-transaction-stage-check.mjs`：4/4。

临时 `editor/node_modules` 链接在命令退出时已删除；没有安装依赖，也没有重建/修改旧 fidelity HTML。

以下为原 030 成果已经记录的更宽旧控制组；本轮未重复无关项，也未修改 `fidelity/`、
`fidelity-cases/` 与 native-host：

- `python3 editor/prototypes/fidelity-cases/verify.py`：582/582；
- `node prototypes/fidelity/selection-check.mjs`：15/15；
- `node prototypes/fidelity/source-ledger-check.mjs`：17/17；
- `node prototypes/fidelity/native-transaction-stage-check.mjs`：4/4；
- `node prototypes/fidelity/ime-history-check.mjs`：6/6 synthetic/replay；
- `node prototypes/fidelity/history-save-readiness-check.mjs`：5/5；
- `node prototypes/fidelity/trailing-whitespace-check.mjs`：旧控制组 14/14。

旧 trailing-whitespace 控制组中的“键入尾随空格后 `staged` 且禁 Save/Source”是旧 027 设计状态，
不适用于新契约，因此没有笼统声称旧矩阵直接验证新核心。新原型用更强的同意图断言替代：同一编辑
立即进入唯一 `currentRaw`，停住即可 Save 和 source no-op；Save 不改投影/caret/revision/history；
scratch 重开后 raw caret 映射到真实 view，续写与 Backspace 均保持同一边界。旧控制组仍只作为未改动
对照基线。

## 未覆盖与风险

- projection comparator 与单尾随空格 shadow→raw 表是冻结范围内的有界实现，不是完整 Markdown
  语法映射；复杂表格、完整输入规则、跨块任意事务和性能未验。
- 隐藏字节 Backspace 由真实 EditorView key handler 调用公开控制器的 raw-boundary 删除；仍需固定
  WK bundle 检查浏览器原生 beforeinput/DOMObserver 时序。
- composition history 保留了 025 的完整分组、取消/no-op 与 future 行为，但这里只执行 synthetic/replay。
- 保护片段、过期事务和非法边界会保留内容与未解决意图；诊断/修复入口已验证，产品级交互未设计。
- 未修改生产代码，也未把结果接入 INK-008；后续管理者仍需固定单一 bundle 集中跑真实 WK、物理搜狗
  和整体用户审阅。
