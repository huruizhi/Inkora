# INK-SPEC-041：V3功能规格与独立样稿

完成：在V1实现前明确表格/任务直接编辑、结构操作、空格/行尾保真、原文位置和单步历史、IME/键盘/辅助功能及其他写作辅助互通要求；保留首阶段既有SYN-S009/SYN-S014目标，未降级范围。

新增docs/design/tables-tasks-production-v3.md和docs/acceptance/tables-tasks/（12组前后文件、manifest、Python字节验证、锁定markdown-it语义对照、README）。全部为实现前规范/独立oracle，不是生产代码或新功能验收。

实际执行：verify.py → 12用例100项PASS；verify-tables.cjs → 8个表格语义对照PASS，使用主仓既有markdown-it14.3.3；git diff --check。未运行产品315回归，因为未修改产品；未开GUI/WK/IME/磁盘产品测试，不冒称通过。官方GFM只用于少量语法边界核对，交互与原文字节策略为项目决定。

依赖/风险：V1公共会话/位置接口尚在实施；少格/额外格、容器、中文组合和正式保存仍需真实实现验证，不能以静态文档化解。后续实施禁止手供patch/改oracle假通过。

持久性核验：逐一读取HEAD的24个Git blob，与manifest SHA完全一致；为golden Markdown声明-text，禁止其他checkout配置归一化CRLF或尾换行。
