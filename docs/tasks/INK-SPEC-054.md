# INK-SPEC-054：可视查找替换验收准备

固定起点 00cce96489fb50558ca014c3a4d74e112ea22b52。只新增 V6 实施契约、独立冻结字节样稿/manifest/校验器及本记录；不修改生产或表格实施分支。

从当前 source-ledger 的 text/link-label/image-alt/code/hidden/protected 位置角色、source-authority/history、已有源码替换验证和查找面板接缝确定范围。可视匹配与 raw 匹配分开，全部替换单事务、截断不冒充全部、跨 marks/链接与 Unicode 有明确判据。

已冻结 14 个 input/expected 对，覆盖 BOM/CRLF、链接目标同字碰撞、原格式定界符、跨 marks、实体/转义、inline-code 定界符增长、代码 info 与正文分离、完整字素、表格/任务、保护片段邻接、140 项完整替换、no-op/future、字素内部与旧 epoch。

实际验证：`python3 docs/acceptance/visual-search/verify.py` 为 14 例、132 项通过；暂存后的 28 个 Markdown Git blob SHA 与 manifest 一致。常规暂存差异检查把冻结 CRLF 的 CR 标为 trailing whitespace；保留原字节，以仅作用本命令的 `git -c core.whitespace=cr-at-eol diff --cached --check` 核对通过，没有改全局 Git 配置或归一化 fixture。没有执行产品查找/替换、GUI 或真实 IME，未运行未修改的产品全套；标准库 oracle 校验不代表可视功能已经实现。
