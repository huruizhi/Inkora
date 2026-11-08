# M0 固定产物集成与验收交接

任务：INK-PROT-008。分支：`task/INK-PROT-008-m0-integration`。这是隔离原型的集成工作区，不是产品主干或最终架构采纳。

## 已接入固定产物

| 产物 | 固定来源 | 范围 |
| --- | --- | --- |
| EOL/no-op 修正版原型 | 692493508d4b5ac78f0b212045aae32a8b59b90e | fidelity/ |
| 审计后的独立样稿 | 484ee81d924efd2a1038e8421b146f4ae5d5b743 | fidelity-cases/，11 例 47 步 |
| 隔离 WKWebView 宿主 | 952d5713d2fd9c147e289382417ae1976fe964af | fidelity/native-host/ |
| 保护边界与含混缓冲 | 6b0c33e43a0f40603faf6c06937d99c98b6be57b | fidelity/ |
| 双向选区纯模块 | 598312093ffef5413ae0a45c36ce24008c94b50e | fidelity/ 三个新增文件 |
| 源码选区/跨模式历史接线与空文档修正 | 713e9227a242da3a6dae04c98f74160d1b4eb9a3 | fidelity/，含010两次交付 |
| 真实引用链接与图片原文占位 | 70bc4da914bf2e42b86ea5c3b1d3b3004f27c80b | fidelity/，含62c73cc真实链接语义 |
| 审计后语义重放 driver | 70597e0697cbaeb3df60680496c71213353cbd98 | fidelity/ 三个新增文件 |

通过 git merge 保留来源历史，未改独立样稿的字节预期。005/006/009/010/012 已接入。009 首次整段字面化方案 `d3c15c7` 已被后续 `62c73cc` 的真实 link marks 与 `70bc4da` 的精确图片占位取代，不能把旧方案当最终行为。

## 管理者实际检查（2026-11-08）

- 接入样稿时，fidelity/ 的 Git tree 与 6924935 相同，fidelity-cases/ 的 tree 与 484ee81 相同，汇合未修改原产物。
- `python3 editor/prototypes/fidelity-cases/verify.py`：557 项数据检查通过；只证明样稿完整性，不证明原型支持这些动作。
- 宿主接入后的构建提交为 `82731d26fd57226abc681d45dd13c8a578c86e5a`。`make -C editor/prototypes/fidelity/native-host verify`：Swift 编译、ad-hoc/Hardened Runtime 签名、codesign strict、Sandbox entitlements 与资源检查通过；Info.plist 与 manifest 均记录该提交。
- 源 HTML SHA256 为 `61281bd14ad8432e508a2cfeeabeb100cf1fcdfd386e824c41caa86b30f082e1`，CSP 副本 SHA256 为 `0d31a2dfe422f7ec45ff2152317ab41ebc9aec10ac0dd84afbe6bad3466cb4a4`，脚本字节前后一致。
- 本轮未重跑不变的 15 项原型检查/111 项生产编辑器测试；未启动 App、执行 WKWebView 运行时、真实 IME 或磁盘保存。

后续接入 005/006 后，管理者实际复跑：原型构建/严格类型与21项检查通过；以本工作区审计后样稿运行crossval，02/10三条变体的字节与状态检查通过；selection-check 15项通过。09目前crossval只证明字节，选区接线尚未完成。06/11的旧driver仍使用审计前动作，不能作为审计后矩阵的结论；03仍无法载入，05仍失败。

接入后重新构建宿主，`make ... verify` exit 0，Info/manifest基线均为 `7fe11b36c0981f2d57d9866320702a966c47866a`；源HTML SHA为 `488084aefabf4c4ae082daefe1d2ad2d339541edcc5617ed5b4ee25363a2a4b4`，副本SHA为 `17ce89bca22c690030fb5239234609846346bcbf4a11d666b0cc098776a48198`，脚本字节相同。以上替代首轮82731d2的旧资源构建记录，仍未运行App。

## 接入顺序与剩余工作

1. 005 已接入并复跑02/10。仍有行内公式/普通文本两个美元符号被过度保守阻断的问题；本次局部门槛通过不表示通用语法边界完成。
2. 006/010 已接入。源码往返已用内容锚点与方向验证09，映射失败保留草稿与原可视选区；纯保护块owner用明确NodeSelection，不能算精确文本映射。源码草稿内文本级撤销尚未实现，当前拒绝会丢稿的跨模式Undo/Redo操作并保留草稿；不得据此宣称完整源码撤销体验已交付。
3. 用审计后样稿重放真实用户动作，记录字节、模式、选区、dirty、revision、Undo/Redo 与保存状态。旧 crossval 报告基于旧样稿，不能直接沿用为新矩阵。
4. 引用链接/图片混排、marks/attrs、结构拆分合并、混合 EOL、composition 历史分组等缺口仍需修正或比较替代架构，不能缩减 M0 判据。
5. 重建最新 HTML 后再构建宿主，核对版本与 hash，取得 UI 锁/preflight 后安排真实 WKWebView、系统中文 IME、光标选区与撤销验收。该宿主无 NSDocument，不证明生产磁盘保存。

009 从集成提交 7c497a7 独立修正引用链接/图片混排；010 先汇入。INK-PROT-015 已按语义手工处理 main/crossval/check/HTML/文档冲突并复跑组合场景，没有整文件覆盖任一方。按真实 diff，010 未修改 `model.ts`；最终 main 统一使用 009 导出的 prototype schema 与带 `side` 的映射，避免 schema identity 混用。

## 010接收后的实际复核

集成提交 `698dbdb9fa10a7d246a1ff36259e5beec17f69ec`：管理者实际执行原型构建/严格类型/29项检查、15项纯模块检查，以本工作区审计后样稿重放02/09/10全部变体通过；另经jsdom真实actions+input补验空、仅空白、仅引用定义、BOM无正文四类缓冲的提交和Undo/Redo，全部返回合法空段落插入点且无半提交报错。未重跑不变的111项生产回归。

同提交重新运行宿主verify通过，源HTML SHA `182fceeaae5daecf3b9d4e160d4c2f336090e58b5b81e1458471e356832382a9`，加载副本SHA `123726e72175c8e110addfa0bb4244f66a930c493a4a43cfa2f8d365337c0c7a`，Info/manifest与698dbdb一致，脚本字节不变。仅构建/签名/资源检查，未启动WKWebView/系统IME/磁盘保存。

总门槛未通过。不得据本工作区已合并、构建成功或样稿数据检查通过关闭 M0、锁定架构或宣告 M1 可交付。

## 015 组合接收后的实际复核

固定来源为 009 `70bc4da914bf2e42b86ea5c3b1d3b3004f27c80b` 与 012 `70597e0697cbaeb3df60680496c71213353cbd98`，均通过 merge commit 保留历史。最终 `PROTOTYPE.html` 由组合后的 shell/main/model 重建，SHA-256 为 `f37dd72cd8c665b2224eda3a23b702445a170843f65c029319396dbf1c3b7cf4`。

- fidelity build + 严格类型 + 37 项组合检查通过；新增单一路径覆盖 link/image/邻近 marks、源码显示文字修改、后向选区、Undo/Redo、no-op 与 Cancel，DOM 无 `img`。
- selection-check 15/15 通过；重复叶检查按 009 顺序叶映射更新，model 与 selection 模块均映射到第二个真实叶。
- 以本工作区审计样稿指定最终 bundle 运行 crossval：02、03、09、10-open、10-create 全链通过；05/06/11 的旧 driver 差异不作为审计后 oracle。
- audited-crossval 指定本工作区审计样稿与最终 bundle：`NOT_PASS`、rc=1、runnerErrors=0；4 个 source 步骤 PASS，05 四步仅 `EXPLICIT_PATCH_DEMO`，结构/空文档 visual 仍 FAIL，11 保留 `ORACLE_ACTION_AMBIGUITY`。该 NOT_PASS 是已知产品原型缺口，不阻塞 015 的来源集成，但也绝不能被写成 M0 通过。
- 全量生产 editor `pnpm --dir editor lint` 与 `pnpm --dir editor test` 通过，后者为 10 文件/122 项（含 `src/bridge.test.ts`）。这与 `make test-editor` 排除 bridge 的 9 文件/111 项是命令覆盖层不同，不能解释为新增 11 项；本轮未重复运行 111 口径。

015 未改 `fidelity/native-host/`，也未用新 bundle 验证宿主。管理者已在后续 008 状态独立接收 014 的只读 observer/WK 证据；接回 015 时应做 merge 并保留该 native-host 历史，不应以本分支旧基线覆盖。

## 018 原生事务原型结果（待管理者接收）

INK-PROT-018 基于管理者准备的 `30b73530af2e8dac37399a0dc9df64f8a9689eb3`，只修改 `fidelity/` 与本交接文档，未修改冻结 `fidelity-cases/`、`native-host/`、生产代码或依赖。

- 新增受限 transaction→source patch bridge；普通文字、空文档、paragraph/list split/join、05 的四种 marks/attrs 操作均由真实 PM transaction/command 自动生成局部 patch，并以 source 重解析与目标 PM doc 等价守卫。
- audited driver 当前 16/16 累计步骤 PASS，explicit patch demo、FAIL、UNSUPPORTED、BLOCKED、runner error 均为 0；三个 isolated 结构分支和三个补充 probe PASS。
- 新 016 的 visual-split 与 single-enter 已各自按明确动作执行，不再对新 fixture 报旧 484 `ORACLE_ACTION_AMBIGUITY`；旧报告保留在 `DRIVER-AUDIT.md` 历史段。
- 空结构 Enter 只有暂存态：不提交 source 字节，但 staged 快照计入 dirty/revision/history 并阻断 save/source mode；Undo/Redo 恢复完整 stage，后续选择/输入更新一致候选，重解析等价后才提交 source。该机制是原型证据，不是 production history/composition 设计。
- 通用 inline ledger、复杂嵌套结构、过度保守 math 边界、真实 WKWebView/IME 和磁盘保存仍未完成；当前 audited PASS 不能升级为 M0 总门槛通过或架构采纳。

管理者组合 019 时，应保留其新增 `source-ledger*` 文件与本任务 `native-transaction*` 文件，分别处理冲突；018 未自行接入 019。详细结果见 `fidelity/NATIVE-TRANSACTION-EVIDENCE.md`。

4afe4ca 独立复核后发现 staged 未进入 dirty/history 且固定 source caret 会在移动选区后错配 candidate，因此首轮提交未接收。后续修正将 stage 纳入完整 past/future 快照，并以显式空块 anchor、顺序文本映射和 PM/source 双重 mapping 支持任意已验证 selection；stage 自身 dirty=true、保存阻断，Undo/Redo 可恢复完整状态。新增四条真实 EditorView 回归覆盖两条原反例、分支失效和未知事务原子拒绝；重新接收应以修正提交为准。

## 022 source-ledger 真实接线结果（待管理者接收）

INK-PROT-022 基于准备提交 `fc1cdff0facf3c5b409a6c83aeb1269142f95f97`，其中已组合 018 修正版 `511709f11de81ac866800b0a31a9513f4a0de536` 与 020 `aa6c04f1c546dcf69bf837c2c51fb4ad24f69be8`。本轮只修改 `fidelity/` 与本文档；未修改冻结 fixture、`native-host/`、生产代码或依赖。

- 真实 `EditorView` transaction、源码进入/提交、link/image 占位与 staged/history 已统一消费词法 source-ledger。`selection-map.ts` 只保留 LF/raw textarea 转换；旧 `sourcePosition`/文本叶贪心不再参与真实 bundle 接线。
- 普通 ledger 缓存绑定同一 source/doc/ranges；staged ledger 在可重解析 candidate 上构建，再按逐块结构等价投影到 staged doc，只允许明确空结构/段首 softbreak 差异和显式 anchors。中段 Enter 后续块不再依赖全局 `indexOf`。
- href/title/正文同文、任务要求的 `&quot;` 拼写、escape/entity、同段重复 marks、完整/折叠/快捷引用均有真实事务回归。折叠/快捷引用编辑会局部展开为原定义键，不改 href/title/定义行。
- 引用定义不再由全文件 regex 收集；model 与 ledger 共享 CommonMark 块规则实际接受的定义范围。fence、缩进代码、HTML/保护块内同名定义不污染正文，合法重复定义仍 first-wins；code/link 混排的可视编辑和源码往返保持代码与定义原字节。
- 双向有向选区使用 ledger 内容锚点；语法内部返回明确 reason。ledger 默认不 nearest；UI 仅对块间空白、尾换行、引用定义 owner 显式 `adjacent-gap` 并记录 snapped。尾部定义 EOF 提交与 Undo/Redo 已覆盖，BOM 前 raw 0 仍拒绝。
- 018 的 stage Undo/Redo、移动首段再完成空段、future 分支失效、未知事务原子拒绝全部保留；新增 link + escape + staged 组合通过。
- 实际验证：fidelity `37 + 4 + 16` 全绿；source-ledger 17 组、legacy selection 15 项、audited `16 + 3 isolated + 3 probes`、02/03/09/10 交叉回归、fixture 582、生产 editor 11 files / 125 tests 与统一 lint 全部通过。
- 最终 `PROTOTYPE.html` 由当前源码重建，SHA-256 为 `e2e259f44b9a3cf372ba1de891da99d68b7a655dd39ab79073942105c6ffd3f6`（396964 bytes）。未构建/修改 native-host 副本，因此不能把该 hash 当宿主加载证明。

真实 WKWebView、系统 IME、物理键盘、磁盘保存/重开与 App Sandbox 未执行。复杂 lazy continuation、多行定义、复杂 delimiter、最坏 `O(n²)` 风险和数学过保守边界仍保留；不得据此宣告通用 map、M0 总门槛或架构采纳通过。详细分层证据见 `fidelity/LEDGER-INTEGRATION-EVIDENCE.md`。

## 024 源码 composition 守卫结果（待管理者接收）

INK-PROT-024 基于固定准备提交 `6360a2904cb07f9d94f1a9169fc709962f4f1a99`，只修改 fidelity 原型入口、检查、文档与重建证据；未修改 `native-host/`、模型/ledger、冻结 fixture、生产代码或依赖。

- 操作入口统一判断 ProseMirror visual 与生产 textarea kernel 的 composition 状态。任一正在组合时，apply/cancel/reset/Undo/Redo/模式切换及其它按钮动作均拒绝，不改草稿、模式、可信 model、选区、dirty、revision 或 history。
- compositionstart 与拒绝路径仅刷新诊断/按钮，不调用 `EditorView.updateState` 或 `sourceKernel.setText`，不强制 flush 或移动光标；compositionend 后仍由既有 PM/kernel 流程正常提交。
- 原型只读暴露 `sourceComposing` 与 combined `composing`，供后续 observer 可选读取；未暴露 kernel。
- 真实 HTML + jsdom 新增 4 组 `synthetic-signal-guard`，明确不是真实 IME。实际复跑 fidelity `37 + 4 + 16 + 4`、source-ledger 17、selection 15、audited `16 + 3 + 3`、fixture 582 全绿；legacy crossval 的既有 05/06/11 非 audited 失败保持，未改 oracle。
- 最终 `PROTOTYPE.html` SHA-256 为 `c86390037282e71e4187aaea46fe92354f12c669373f3d4c1be69d2287c81090`（397611 bytes）。未修改/重建 native-host，因此旧 022/014 runtime 不能外推。

真实 WKWebView、系统中文 IME、候选窗、焦点/事件顺序、composition 撤销分组与磁盘保存均未执行。详细守卫边界和命令见 `fidelity/SOURCE-COMPOSITION-GUARD-EVIDENCE.md`；本结果不能升级为 M0 总门槛或生产架构采纳通过。
