# INK-M1-066 可视查找替换证据

## 红绿反馈环

冻结文件保持只读，SHA-256 分别为：

- `visual-replacement-red.test.ts`：`b186eb430753206332745a7578c722479f4cfc53332379eda65a4499a1471648`
- `RED.log`：`cc49a8fe2c741fb6439b7fa44c36a0c16a42eb2007ca7787d1fa06f8eb80dbe4`

锁定命令 `pnpm --dir editor exec vitest run src/visual-search-runtime.test.ts -t 'root066:'` 在固定 HEAD 首次实跑为 `5 failed / 2 passed / 28 skipped`：inline-code caret 为 3 而非 13，三种跨 marks/link 操作被拒，Markdown 标点 replacement 被拒。完成后同一命令为 `7 passed / 28 skipped`，两个原有控制例始终为绿。

另建立源码列表截断 RED：140 处源码匹配的 Replace All 按钮原先被禁用并显示“当前结果已截断”；修正后对当前稳定 raw 完整重搜，单次计划和提交 140 项。

## Production 动作覆盖

- `main.test.ts` 从 SearchPanel 输入 query/replacement，点击结果、单个/全部替换按钮，并经 Bridge `createSnapshot`、`executeCommand undo/redo` 读取结果；冻结 1–11 不读取 derivation 作为产品 patch。
- 冻结 1–11：exact expected bytes、一次 stateChanged/revision、dirty/history、Undo 回 input、Redo 回 expected。
- 冻结 12：先建立并 Undo 一个真实替换，再执行 no-op，revision/stateChanged 不变、dirty 仍为 false、future 可 Redo、replacement 意图保留。
- 冻结 13：部分 ZWJ 查询为 0 个安全匹配，按钮禁用且 snapshot/raw/history 不变。
- 冻结 14：相同 documentID/revision/raw 的新 load 增加 epoch；旧 detached Replace All 与结果按钮均不改变新文档。
- 额外覆盖：单个重复命中与源码 caret、部分 mark owner 两侧、inline/reference/autolink、literal punctuation、inline code delimiter growth、BOM/CRLF/no-tail、表格/任务、保护邻接、无效 Unicode 批次失败、query/replacement/body/link composition 与 10,001 硬上限。

## 自动化结果

最终交付前执行：

| 命令 | 结果 |
| --- | --- |
| `pnpm --dir editor test` | 27 files，545 tests passed（包含 Bridge） |
| `make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` | Swift format strict 与 `tsc --noEmit` 通过 |
| `make editor-build PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` | production build 通过；JS 613.65 kB，保留既有 >500 kB chunk warning |
| `python3 docs/acceptance/visual-search/verify.py` | 14 cases，132 checks passed；只证明冻结 oracle 完整 |

规模实测使用 production runtime + Node/jsdom：2,000 个同段落匹配完整替换为 2,000 项，单文件 verbose 用例约 `4029ms`；常驻回归使用 1,000 项。此结果只用于确认批次复用一次位置表后的当前规模行为，不声称最坏复杂度、真实 WKWebView 延迟或实际可见性。

## 未运行与风险

- 按任务明确禁令未运行 GUI/App/CUA/浏览器、XCUITest、物理输入法或 NSDocument 系统面板。
- 未运行 Native 测试：没有 Swift 或 Bridge schema 字段变更；editor 全套已包含 JS Bridge 测试。
- autolink label 发生变化时必须改写为显式 inline link 才能同时保留独立显示文字与原 href；这是可审计 owner 内改写，不保持尖括号表面形式。
- 普通 replacement 对 CommonMark 可转义 ASCII 标点使用反斜杠字面编码，未编辑 owner 外的原始字节不变。
