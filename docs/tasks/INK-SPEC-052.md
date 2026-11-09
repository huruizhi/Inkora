# INK-SPEC-052：图片生产实施规格

基线 b80a968268dde1eb03bacc1f561dc14f269a2294。范围只新增 V4 规格与本记录，未修改产品。

已读当前生产 image_ref mark、原文 parser/ledger、Bridge v1、EditorViewController、InkoraDocument 保存队列、RecoveryStore、bundle scheme/CSP 和既定图片政策 06；对照 021/037/040 最终机制证据，并实际读取 Apple 官方 Markdown。

明确实际图片插入/显示/拖放/粘贴、未命名恢复、首次保存路径内容事务、资源先发布 Markdown 最后提交、Save As 原引用不改、最小权限 broker、失败与跨进程恢复矩阵。没有把原型整体搬运或纯模块当产品交付。

验证：git diff --check。文档任务未运行产品测试、GUI 或平台实验；此前证据保持各自层级，不因规格形成而宣告 V4/首阶段通过。
