# 文本格式边界：编码、换行符、Unicode 与文件名

- 来源：GitHub Issue #22（INK-022）
- 规范来源：`docs/markdown-support.md` 第 2.2 / 2.3 节（ENC / EOL / WSP 规则）与第 6.1 节 fixture 清单。本文不复制规则，只记录实现位置、行为与 fixture 映射；两者冲突时以规范为准，差异列在「已知边界」。

## 读入与写盘（`app/Sources/InkoraDocument.swift`）

- 只接受 UTF-8（`ENC-001`）。读取时显式剥离前导 UTF-8 BOM 并记录其存在；`data(ofType:)` 与 `write(to:)` 统一通过 `encodedDocumentData()` 在每次写盘时恢复 BOM。BOM 的有无在未修改保存、编辑后保存（Bridge snapshot 流程）和 Save As 中均保持不变（`FID-001`、`F-ENC-002`）。仅含 BOM 的文件解析为空文本并原样写回。
- UTF-16 / UTF-32 BOM（FF FE、FE FF、FF FE 00 00、00 00 FE FF）与所有非法 UTF-8（含 GBK 等传统编码）不会猜测转换：文档以**只读错误状态**打开（INK-053 落地 `ENC-002`）。正文不解码、不显示乱码；窗口正文为 `EditorEncodingErrorView`（原因 + 转换建议），副标题为 `DocumentFileState.unsupportedEncoding`，复用 INK-020 的文件状态管道。Save / Save As / `data(ofType:)` / `write(to:)` 一律以对应 `InkoraDocumentError`（`utf16Detected` / `utf32Detected` / `invalidUTF8`）失败，原字节永不写回；dirty 恒为 false，关闭无保存确认，不产生崩溃恢复草稿；该文件不进入 Open Recent（AppKit 在 `makeWindowControllers` 之前自动记录最近文件，随后立即撤销），也不更新“重启恢复”的最后打开记录。
- 文件中间的 U+FEFF 是正文数据，按普通文本原样保留；只有文件开头的 BOM 参与上述剥离/恢复。
- 文件名按调用方给定的字节透传（APFS 保留创建时的形式），窗口标题取 `displayName`，不做任何归一化；测试覆盖 emoji、ZWJ 序列、组合字符、CJK、空格文件名的打开、Save As 与重新读取。

## 换行符与尾部换行（`editor/src/editor-kernel.ts`、`editor/src/editor-runtime.ts`）

- 未修改文档的保存逐字节一致：未编辑时 snapshot 返回原始文本，不经过 codec（`FID-001`，`EOL-001`）。
- 源码模式（textarea）：内核记录每个原始换行边界（LF / CRLF / bare CR）。textarea 的值按 HTML 规范归一化为 LF，`getText()` 逐行恢复原边界；新插入的换行按 `EOL-002` 继承插入点所在行的样式，当前行无样式时回退最近前一行、文档首个换行样式，空文档使用 LF。
- 模式选择（INK-052）：`line-endings.ts` 区分 LF、纯 CRLF、混合 LF/CRLF 和 bare CR。纯 CRLF 在语法安全且 LF codec 往返不会改写其他内容时进入结构化模式；解析前转为 LF，snapshot 输出时整篇恢复 CRLF（包括代码块内部），保留基线全部尾部换行。若 codec 会改写未编辑空白，则回退源码模式（`FID-005`）。混合 LF/CRLF 继续进入源码模式，逐边界保留；bare CR 独立分类并优先进入只读源码视图（INK-054）。
- 结构化模式（LF 文档）：编辑后 `getText()` 序列化并按 `EOL-004` 恢复基线的尾部换行——原文以 `\n` 结尾则输出保持结尾，原文没有则不添加。codec 本身从不添加尾部换行（见 `docs/markdown-codec.md`）。
- bare CR 文档整篇只读（`EOL-003`）：正文可选择/复制，snapshot 保留原文；Save、Save As、直接写盘均拒绝，dirty 恒为 false，不产生草稿。窗口副标题复用 `DocumentFileState.bareCR`；按钮 `ConvertBareCRToLF` 或 Command-Option-L 显式把整篇 CRLF / CR / LF 统一为 LF，保留 BOM、Unicode 和尾部换行数量。转换立即 dirty、可编辑，不自动保存。转换是不可撤销的会话边界（界面明确说明），后续正文编辑保留 Undo/Redo；撤销到转换基线仍 dirty，成功保存后才清除。bare CR 文档正文可读且可转换，视为成功打开，保留 Open Recent 与重启恢复记录。

## Unicode（`ENC-003` / `ENC-004` / `ENC-005`）

- 全链路（Swift `String`、JSON Bridge、ProseMirror 文本节点、markdown-it）不执行 NFC / NFD / NFKC / NFKD 归一化；组合字符、变体选择符（U+FE0F）、ZWJ 序列、区域指示符、零宽空格、NBSP、全角空格与 RTL 文本的码点序列由 fixtures 字节级锁定。
- `ENC-005`：当前 Bridge v1 只交换完整文本，没有偏移 API；未来引入偏移交换时必须区分字节 / Unicode 标量 / UTF-16 code unit 偏移（规则保留，尚未有实现面）。

## Fixture 映射

| Fixture ID | 实现位置 | 状态 |
| --- | --- | --- |
| `F-ENC-001`（无 BOM Unicode roundtrip） | `tests/fixtures/unicode.md`（InkoraDocumentTests + EditorWebViewTests Bridge 保存）；`editor/test/fixtures/markdown/unicode.*.md`（codec 字节级往返） | 已覆盖 |
| `F-ENC-002`（UTF-8 BOM roundtrip / edit） | `tests/fixtures/utf8-bom.md`；`testUTF8BOMIsStrippedFromTextAndPreservedInEveryWrite`、`testBOMOnlyFileRoundTripsToTheBOMBytes`、`testEditedSnapshotSaveKeepsTheOriginalBOM`、Bridge 保存测试 | 已覆盖 |
| `F-ENC-003`（非法 UTF-8） | `testInvalidUTF8OpensInReadOnlyErrorState`、`testGBKEncodedFileOpensReadOnlyAsInvalidUTF8`、`testUTF16AndUTF32OpenReadOnlyWithExplicitReasons`、`testUnsupportedEncodingDocumentCannotSaveAnywhere`、`testUnsupportedEncodingWindowShowsReadOnlyStateWithoutEditor`、`testUnsupportedEncodingDocumentProducesNoRecoveryDraft`；`DocumentOpenUITests.testUTF16ReadOnlyErrorWindowBlocksSaveAndClosesWithoutReview` | 已覆盖 |
| `F-ENC-004`（跨 Swift/JS 偏移换算） | 无对应 API | 未实现（无偏移交换面） |
| `F-EOL-001`（LF + 尾部换行） | `tests/fixtures/utf8-bom.md`（LF 内容含尾部换行）与既有 no-final-newline 对照；结构化编辑保留尾部换行由 editor-runtime 测试覆盖 | 已覆盖 |
| `F-EOL-002`（全 CRLF 无尾部换行） | `tests/fixtures/crlf.md` roundtrip；`testEditedSnapshotKeepsCRLFLineEndingsAndUnicode`（编辑后仍不添加尾部换行）；`editor/test/fixtures/markdown/crlf.*.md`（codec 归一化行为）；`tests/fixtures/crlf-structured{,-final}.{input,expected}.md`（Vitest 结构化编辑和 WKWebView snapshot / BOM 写盘，含尾部空行对照） | 已覆盖 |
| `F-EOL-003`（LF/CRLF 混合插入继承） | `tests/fixtures/mixed-eol.md`（含 bare CR 对照）；editor-kernel 混合换行测试（逐边界保留 + `EOL-002` 继承） | 已覆盖 |
| `F-EOL-004`（bare CR 只读） | `bare-cr{,-lf,-crlf}.{input,expected}.md`；Vitest 只读/转换后编辑历史；XCTest 保存闸门、无草稿、BOM golden、转换 dirty 与 Bridge Undo | 已覆盖；UI 未验证 |
| `F-WSP-001` / `F-WSP-002`（空白保真） | 既有 codec fixtures（basic/nested/code）与 no-final-newline 覆盖部分空白；专项混合空白 fixture 未建 | 部分 |
| 文件名边界（issue 范围） | `testFilenamesWithEmojiZWJAndCombiningCharactersRoundTrip`、`testFileURLLoadsMarkdownAndUsesFilenameForTheWindowTitle` | 已覆盖 |

## 已知边界（与规范的差异）

1. ~~`ENC-002` 的「文档以只读错误状态打开」未实现~~：INK-053 已实现只读错误状态；上一差异消除。剩余边界：只读错误窗口不提供“文件已在外部转换为 UTF-8”的自动重载，用户需关闭后重新打开。
2. INK-054 已落地 `EOL-003` / `SYN-D008` 只读与显式 LF 转换。转换本身不可撤销：现有 Bridge 只管理单会话正文历史，避免跨只读边界导致权限、dirty 与历史不同步；保存前原文件保持不变。只读期间不自动重载外部修改，需关闭重开；转换后保存仍执行磁盘冲突校验。
3. `ENC-005` 偏移换算没有实现面（Bridge 只传完整文本）。
4. `FID-002` 的完整原始范围映射（结构化局部编辑的字节切片证明）不属于本任务；codec 的结构保留能力与边界见 `docs/markdown-codec.md`。
