# INK-SPEC-033：首阶段基础功能生产化草案

状态：draft（草案已产出，待 M0 收尾与架构票 12 决策后转 to-spec/to-tickets）

- 分支：`task/INK-SPEC-033-first-stage-production-draft`（基线 main `48258a93b3fc4a75df21a22ac0d175e01943b744`）
- 产物：`docs/design/first-stage-production-draft.md`（唯一设计产物，本文件为任务记录）
- 范围：只新增上述两份中文文档；不改代码、ADR、冻结资料；不合 main。

## 完成内容

1. 核验基线 HEAD 与分支一致、工作区干净；读 AGENTS 与全部必读规划指针（03/04/06/07/12、M0-CLOSURE-CHECKLIST、M0-source-authority-consensus、M1-014-integration-ci）。
2. `git show` 读取冻结契约 `6e6e2b8`（CONTRACT.md/ORACLES.json 摘要）与原型产物 `493e2b7`（RESULTS.md、core.ts API 面），未恢复原型目录。
3. 对照生产 `48258a9` 实读 `editor/src`（main/editor-session/editor-runtime/bridge/source-search/search-panel/source-replacement/document-analysis/protected-markdown/schema）与 `app/Sources`（InkoraDocument/EditorViewController/DocumentDataWriter）及 `docs/save-barrier.md`。
4. 产出草案：状态契约对照表（生产现状 vs 原型证据 vs 待实现）、原型生产化风险（禁止整目录搬运、禁止混用内存保存点与 NSDocument）、首阶段能力清单、验证接缝分层、V1–V5 纵向切分与 blocking edges、逐功能状态矩阵与退出条件/风险、SHA 绑定的源码附录。

## 关键事实修正

- 任务指称的 "Swift SaveBarrier" 无同名类型；实际机制为 `docs/save-barrier.md` 概念 + `InkoraDocument` PendingSave/processNextSave/persist 回路，草案已按实名记录。
- 生产 schema 无表格/任务列表/图片/公式节点；表格当前为 protected_block 原子块，非直接编辑——首阶段最大待实现面。
- 生产 dirty 是语义 `doc.eq`，非字节级；与原型 currentRaw/savedRaw 契约的差距是 V1 核心。

## 未解决依赖

- 架构票 12 open（blocked by 11）；05 依赖 12。草案中依赖统一权威模型的条目全部标注待决。
- M0 剩余 H1/H2/H3 物理证据在用户验收中，本文未推断结果。
- 图片平台票 14 的拖放/粘贴/书签/真实 WK 未验项为 V4 外部依赖。
- UI 层零启动证据（exit 78 锁屏）覆盖所有已合 main 功能。

## 验证

- 文档任务：`git diff --check` 通过；未运行产品 315 项测试（未改产品代码，按任务约定不跑）。

## 风险

见草案 §6.2（票 12 否决增量路线、H1–H3 反例、表格映射失败转向、票 14 阻塞、UI 零证据、性能未测）。
