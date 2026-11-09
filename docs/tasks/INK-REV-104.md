# INK-REV-104

状态：WIP；仅完成 Standards 轴独立审查，不宣告产品任务完成。

## 范围

- HEAD：`47c0d54735c70b9e55268ad43f9f085f08ff4dd6`
- 基线：`acf33923081e066812603269da6a332b7c8e02e3`
- 唯一 diff：`git diff acf33923081e066812603269da6a332b7c8e02e3...HEAD`
- 已全文核对 AGENTS.md、GLOSSARY.md、ADR-0004、Markdown 支持、Bridge、editor session、save barrier、testing、document analysis、protected syntax V2；全仓确认无 CODING_STANDARDS.md/CONTRIBUTING.md。

## 结果

- 初稿曾记录 1 项书面标准背离，后经公开接缝自校核明确撤回：BOM 已在归一化 parser 输入上正确命中 front matter，原始 raw offset 映射也正确。
- Fowler smells：Duplicated Code、Primitive Obsession/Mysterious Name、Divergent Change，均为 judgement。
- 自校核命令：`pnpm exec vitest run src/protected-source-runtime.test.ts -t 'BOM-prefixed metadata'` → 1/1 通过；日志 `/tmp/ink103-bom-review-control.txt`。
- 未修改产品代码、已有证据或冻结 oracle；仅新增审查报告与本任务记录。

## 验证与限制

使用临时 symlink 指向既有 `editor/node_modules` 与 `.tools`，运行：

`pnpm exec vitest run src/protected-source-runtime.test.ts` → 1 file passed，20 tests passed。

symlink 已解除。未运行 make setup、完整 lint/test、UI、Native、Release、perf、App/GUI/CUA/browser/XCUITest；根任务既有 760/760+lint 结果未作为本次自验据。

## 交付

分支：`task/INK-REV-104-protected-parser-standards`。提交与远端 SHA、clean 状态由本任务结束前核对并回报。
