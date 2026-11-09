# 可视查找替换冻结样稿

14 个 input/expected 对由管理者在实现前独立制定，绑定 00cce964 的上游契约。UTF-8 原始字节、BOM/CRLF/无尾换行均冻结，`.gitattributes -text` 避免 Git 自动归一化。

`cases.json` 的 visibleBefore/safeVisibleMatches 是**规定的可视内容口径**，不是从当前尚不支持的产品导出的通过结果。02/07 区分相同文字的正文、链接 label、href/title 和代码 info；04 要求跨 marks 的真实选择语义；09 等待实际 V3，10 的保护原文使用另一结果类别；11 的 140 个匹配必须整体替换；12–14 为 no-op/字素/epoch 安全状态判据。

标准库执行 `python3 docs/acceptance/visual-search/verify.py` 只验证文件 SHA、字节、独立操作推导和清单完整性。derivation 使用逐步字节坐标记录允许改变处，供审计使用；实施测试不能把这些 patch 直接交给产品冒充 SearchPanel/UI 实现。

实际验收必须通过生产查找输入、大小写、真实导航/替换入口读取结果和当前 raw，并逐例核对 PM/marks、方向/内容锚点、dirty/revision/保存点、Undo/Redo、原子失败与新会话重开。字素边界依产品 Intl.Segmenter/位置契约验证；Python 校验器不声称证明 Unicode 分段或真实 WK/IME/布局。
