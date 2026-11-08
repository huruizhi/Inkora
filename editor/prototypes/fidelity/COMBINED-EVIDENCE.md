# COMBINED-EVIDENCE：INK-PROT-015 链接语义 × 源码选区集成

日期：2026-11-08。分支：`task/INK-PROT-015-link-selection-integration`。基线：`def2002cd281f567de9adea192c25b1b1673d4a1`。

## 固定来源与合并方式

- INK-PROT-009：`70bc4da914bf2e42b86ea5c3b1d3b3004f27c80b`，包含 `62c73cc` 的真实 link marks；旧 `d3c15c7` 整段字面化行为已被后续提交取代。
- INK-PROT-012：`70597e0697cbaeb3df60680496c71213353cbd98`，只新增 `audited-crossval.mjs`、`audited-crossval-results.json`、`DRIVER-AUDIT.md`。

两者均以 `git merge --no-ff` 保留来源。009 的 main/crossval/HTML/README/CROSS-VALIDATION 冲突按语义手工处理；最终 HTML 由源码重建。按真实 diff，010 未修改 `model.ts`；最终 `main.ts` 使用 009 导出的同一 prototype schema、`sourcePosition(..., side)` 与 010 的双向 selection mapping，没有混用生产 schema identity。

## 最终产物

- `PROTOTYPE.html` SHA-256：`f37dd72cd8c665b2224eda3a23b702445a170843f65c029319396dbf1c3b7cf4`。
- `audited-crossval-results.json` SHA-256：`d8654c0d4952a9f14dda7755065cbf3c869af84ef1aa0173e0ca618a33b31c82`。
- HTML 不含外部脚本、样式、字体或图片资源；图片只生成 `span.image-ref` 原文占位，组合检查断言 DOM 中无 `img`。

## 组合语义

- reference/full/collapsed/shortcut/尖括号链接为真实 PM `link` marks 和 DOM anchors；heading/list/blockquote 与相邻 strong/em/code 保留。
- 图片 alt 为 `image_ref` mark，只显示自身精确源码范围，不吞邻近正文/marks/link，不请求资源。
- 顺序叶匹配与 `side` 区分共享边界；完整替换同一叶继承 `inclusive:false` marks。
- 可视选区进入源码与源码选区返回新文档均保留 anchor/head 方向；no-op、Cancel、Undo/Redo 与未提交草稿守卫保留。
- 空/仅空白/仅引用定义提交到唯一空段落 `TextSelection@1`；纯保护块落 owner `NodeSelection`，明确不算精确 text mapping。

新增的组合场景从同一真实 bundle 执行：文档含 link、image placeholder、邻近 strong/em/code；以 backward selection 进入源码，修改链接显示文字与图片 alt 后返回；随后验证 Undo/Redo、no-op、Cancel、引用定义保留、DOM mark 结构和无 `img`。

## 实际命令与结果

```sh
make -C editor/prototypes/fidelity test
# PASS：重建最终 HTML + prototype strict tsc + 37 reproducible checks

node editor/prototypes/fidelity/selection-check.mjs \
  editor/prototypes/fidelity-cases
# PASS：15/15；模块临时产物已清除

python3 editor/prototypes/fidelity-cases/verify.py
# PASS：11 例 / 47 步 / 557 项，0 失败；仅证明冻结样稿完整性

node editor/prototypes/fidelity/crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html
# exit 0；02、03、09、10-open、10-create 全链 PASS/OBSERVED
# 03：真实 link/image 语义 + 4 步 SHA exact，refsKept=true
# 09：内容锚点、方向、后向选区、Undo/Redo、Cancel 通过
# 10：磁盘只以内存保存点模拟

node --check editor/prototypes/fidelity/audited-crossval.mjs
# exit 0

node editor/prototypes/fidelity/audited-crossval.mjs \
  editor/prototypes/fidelity-cases \
  editor/prototypes/fidelity/PROTOTYPE.html \
  editor/prototypes/fidelity/audited-crossval-results.json
# 预期且实际 exit 1：status NOT_PASS，runnerErrors=0
# 4 PASS（source kernel），4 EXPLICIT_PATCH_DEMO（05）
# 2 FAIL + 4 BLOCKED_BY_PREVIOUS（结构累计链）
# 3 isolated FAIL，1 empty visual probe FAIL，1 ORACLE_ACTION_AMBIGUITY（11）

/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor lint
# PASS：tsc --noEmit

/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm --dir editor test
# PASS：10 files / 122 tests，包含 src/bridge.test.ts
```

未重复执行 `make test-editor` 的 9 文件/111 项口径；它排除 `src/bridge.test.ts`，与全量 122/10 文件的差异是命令覆盖层不同，不表示新增了 11 项测试或旧基线过时。

## 保留反例与未完成项

- `[a](later)later` 的目标/正文碰撞与转义显示文字仍安全拒绝，可信 source/state 不变并阻断保存；不宣称通用 inline map 完成。
- audited driver 的 `NOT_PASS` 是真实产品原型缺口：原生结构 split/join、空文档 visual 普通输入、原生 marks/attrs 尚未实现；05 的 `EXPLICIT_PATCH_DEMO` 不算 native pass。
- 11 visual 动作仍由独立 INK-PROT-016 审计；本任务未改冻结 oracle。
- 未执行桌面 App、真实 WKWebView、系统中文 IME/composition、App Sandbox、用户文件写盘/重开/冲突或 HITL。
- 未修改 `fidelity/native-host/`；未用本次新 bundle 验证宿主，也未覆盖管理者独立接收的 014 observer/WK 证据。

结论：009 链接/图片语义、010 源码选区接线和 012 审计驱动已在同一最终 bundle 中完成集成与可复现验证；M0 总门槛仍未通过。
