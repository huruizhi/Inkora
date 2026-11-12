# INK-REV-191：IME 与列表输入 Standards 审查

固定 HEAD `c22e6841a3b5c69197a0556cfe457bd3dcdbb081`；base `3dac317feef5c3850c245c3b1ba634cfad6a58eb`。审查命令为 `git diff 3dac317feef5c3850c245c3b1ba634cfad6a58eb...c22e6841a3b5c69197a0556cfe457bd3dcdbb081`；唯一提交 `c22e684 fix(editor): preserve native IME ranges and list prefix input`，8 文件、234 行新增/17 行删除。

规范来源：`AGENTS.md`、`GLOSSARY.md`、`docs/adr/0004-source-authoritative-editing.md`、`docs/design/source-authority-production-v1.md`。独立 `rg --files --hidden` 核查未发现额外 AGENTS、CODING_STANDARDS 或 CONTRIBUTING 文件；任务规格仅辅助确定范围。

## 书面规范

未发现有证据的硬偏离。对照 AGENTS 的原文保真、composition/选区/历史保护及禁止绕过有效测试；GLOSSARY 的当前原文/位置依据；ADR-0004 的有据接受；V1 的组合会话、原子提交、锁定依赖与真实证据边界：新增路径仍核对精确原文、同次解析插入锚点与既有语义重投影证明，未增加依赖或运行期网络入口。测试数量由22调整为25对应三个新增方法，既有灰标记断言随DOM归属迁移，未见删除有效安全断言。

## 判断项

低优先级 **possible Mysterious Name**：`editor/src/source-authority.ts:165-191` 的 `literalWhitespaceProjection` 新增 `pendingBullet` 分支，实际也接受单独 `-`、`+`、`*` 的文字段落投影；名称仍只揭示空白，调用者容易漏看列表触发的职责。建议重命名为 `literalParagraphProjection`，并同步更新三处引用。属于可读性判断，不是规范硬违例，也不声称功能错误。

已对照其余11项 Fowler 基线；未发现足以报告的新增问题。工具可检查的格式/类型不重复列为发现。

## 证据与边界

本人实跑 `git diff --check <base>...<HEAD>`、`make lint PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm` 均退出0。定向 `pnpm --dir editor exec vitest run src/heading-entry-runtime.test.ts src/list-input-runtime.test.ts`：首次缺生成许可证文本，0测试；运行 `node editor/scripts/prepare-renderers.mjs` 后92项通过，均为synthetic DOM。原始输出保留 ignored `artifacts/INK-REV-191/`。仅创建并已unlink本树依赖软链。

未运行完整editor/build、Native/WK、App/GUI、物理IME、paint、VoiceOver或最低系统验收；作者125/Native25不是本人实跑。结论仅为Standards审查，无产品修复，无Spec裁定。总计：硬偏离0，判断项1（低）；真实输入与光标绘制风险仍待独立验收。

## 限定静态后验：a37ed683

首稿全文保留。冻结后验对象 `a37ed683237589e27a5212a1095de99bbdb36977`，只检查相对 `c22e6841a3b5c69197a0556cfe457bd3dcdbb081` 的新增 hunk；`87ad9b3` 是证据文档追加，不将其测试记录算作本人实跑。

原判断项已关闭：函数及两处调用改名为 `literalParagraphProjection`，名称现覆盖空白和裸列表标记段落投影。

新增书面硬偏离：0。依 ADR-0004 的有据位置/原文权威与 V1 的原子接受、拒绝未知事务要求，新增 `emptyTail` 仅接受比正式解析多一个尾部空 paragraph、原文以两次 LF/CRLF 换行结尾且存在已证明 `pendingBullet` 的投影；逐块验证仍在，裸标记后的额外原文只能是换行。EOF 的 `insertion-anchor` 显式绑定 `raw.length` 与尾段内容位置，未改写源换行或以整个文档的无条件重解析放行。未发现新增可报告的 Fowler 判断项。

新增 Native 方法与执行计数25→26对应；旧测试未删除。静态新增断言覆盖三种裸标记 Enter 后保存原文和继续输入，但不代表本人验证了运行时、历史或物理输入法。风险边界延续首稿。

本人此次仅实跑冻结增量 `git diff --check c22e6841a3b5c69197a0556cfe457bd3dcdbb081...a37ed683237589e27a5212a1095de99bbdb36977`（退出0）及静态 diff/提交范围核对。没有重复全量、DOM、Native/WK、GUI 或构建。限定后验结论：硬偏离0、开放判断项0；不作 Spec 裁定。
