# 显式源码保存独立双轴审查

固定 `11773c66a6beef63b40f1f9191c7ef8656a27ad2...a526136ebd8cbd05ad4e20a9755c54041457b711`，Standards与Spec新上下文独立执行，不跨轴重评。

# Standards

## 书面标准

未发现硬性背离。仓库未找到 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`；`AGENTS.md` 要求的中文文档、英文 Conventional Commit、独立 `task/<TASK-ID>-<slug>` 分支、任务范围内修改及不新增依赖，均未见 diff 证据违反。未运行产品测试，符合本票“仅 Standards 轴、无需跑产品测试”的范围。

## Fowler smell（均为判断性意见）

- **Duplicated Code**：`editor/src/source-authority.ts:1578-1580` 的 no-op 成功路径与 `:1607-1610` 的变更成功路径，都直接构造 `this.sourceCommit = { raw: this.currentRaw, doc: this.state.doc, epoch: this.epoch }`。这是同一保存来源证明逻辑在同一方法两个 hunk 中重复；可提取私有的 `recordSourceCommit()`，减少未来字段变更时的分叉风险。

未观察到其余基线 smell 的可靠证据；书面标准优先，且不重复报告工具可直接检查的格式问题。

# Spec

固定基线 `11773c66a6beef63b40f1f9191c7ef8656a27ad2`，受检 HEAD `a526136ebd8cbd05ad4e20a9755c54041457b711`；仅审 Spec 轴。

## (a) 缺失或 partial

未发现。`docs/design/protected-syntax-production-v2.md:15` 与 `docs/save-barrier.md:55-61` 要求来源证明绑定 currentRaw、不可变 doc identity、epoch，并随 history 恢复、在可视内容变化或 load 后失效；`editor/src/source-authority.ts:595-600,621-659,1566-1669` 对应实现。composition、dirty draft、unresolved intent 仍先行阻断，issues 未清除；UTF-8 与 bare CR 在建立证明前拒绝。

## (b) scope creep

未发现。生产改动只落在 SourceAuthoritySession、main 的源码确认/提示及对应测试；未改 Swift/Bridge schema、依赖或冻结 golden。099 的契约与 18 oracle 属上游冻结提交，不把脚注、callout、inline atom 或统一 parser boundary 后续项误算为 100 缺失。

## (c) 看似实现但 wrong

未发现。`editor/src/main.test.ts:213-258` 覆盖真实 textarea→Apply→Bridge snapshot/markSaved、BOM/CRLF、Undo/Redo 与 no-op revision/history；`editor/src/source-explicit-save.test.ts:4-103` 覆盖 proof 历史迁移、可视编辑/load 失效、composition/draft/unresolved 阻断及 Unicode/bare CR。定向实跑分别 5/5、2/2 通过。

结论：Spec 轴 0 项；外部 720/720、lint/build 证据仅核读，未冒充本轮实跑。

## 管理者处理

101 hard0/judgement1（同一方法两处sourceCommit构造重复），尚未把判断项列为代码缺陷。远端与本地SHA2b33fbe一致、clean；518文件tar/bundle核验备份，tar SHA `6bc619cacddc0549e0f1fea7595e32d2179b2ce758d843c0241399910fa69e08`，随后两层回收。managed累计87；Spec不借Standards结论关闭。

102最终494fe67，518文件tar/Git bundle核验，tar SHA `72c6f811d11e977fe519b07ad9dc94c0b918cde800300498a45eb5f5c5365c02`；两层回收成功，managed累计88。Standards原judgement由root提取recordSourceCommit收敛，0b64d62定向17绿、lint/build通过；Spec仍0，不重写原报告，最终精确head CI尚待。
