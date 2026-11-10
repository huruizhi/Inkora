# INK-UX-110：Typora 体验对齐事实与设计

状态：事实核对已完成；两个设计决策待用户答复。没有生产实现完成或验收通过结论。

## 来源与范围

用户指出 Inkora 与 Typora 的实际效果差距较大，要求转向 Typora 体验优化并调用 ask-matt；继续后，按其推荐进入 grill-with-docs。独立分支 `task/INK-UX-110-typora-experience-plan`，固定起点 main `a2b6211c387d2cd1b523b1c95bd088f55e6ede93`。

范围限于源码事实、真实同文档桌面对照、设计树和待定推进顺序。未改生产文件、依赖、锁文件、Canonical 语法矩阵或图片恢复政策。

## 产物

- `.scratch/typora-experience/README.md`：基线、事实、源码推断、限制、待定决策、拟议纵向顺序及验收原则。
- `.scratch/typora-experience/fixtures/Typora-Comparison.md` 与 `reference.png`：自有对照文档及素材。
- `.scratch/typora-experience/INK-UX-111-activity.json`：fresh-context 只读核对原始回报；代码块样式遗漏由主会话在 README 明确补充。

## 实际执行

- UI lock 与 desktop preflight 后，在 Typora 和独立 Inkora UITesting App 打开同一份自有 fixture；观察正文、控件、表格、代码及公式/图表/脚注差异。
- 未改用户的原有文档或 Typora 偏好；已关闭本次对照文档并释放自有 UI lock。
- 核对当前 CSS、NodeView、面板及 ADR 边界；完成 INK-UX-111 归档/bundle 校验及 Agent/workspace 两层回收。
- `git diff --check` 与 fixture SHA-256 检查；未运行产品测试、构建或新的物理输入验收。已有全量结果不冒充本轮执行。

## 未完成与风险

- 两个设计问题未回答：低干扰界面默认状态；公式/Mermaid/脚注是否纳入总体目标。
- 本次窗口尺寸不匹配，主题名未确认，未保存截图文件；只支持定性发现，不支持像素级对齐结论。
- Sandbox 图片未授权的占位不能据此记为渲染缺陷。
- 尚未产出已批准实施规格/任务，未改产品、未创建 PR、未合并 main。

下一步：收到用户方向答复后，收敛规格与完整纵向切片；先交付正文排版和低干扰界面的真实 App 效果，再按已确认范围推进技术内容渲染。
