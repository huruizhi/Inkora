# INK-REV-074 图片整合 Standards 轴审查

- 分支：`task/INK-REV-074-image-integration-standards`
- 对比：`c9e247defa790db399f6286f8e83086b736bfd4d` → `a58b8ba1edddb7863856214b9c36f0893030bf11`（40 文件 +5706/−88，无新依赖/lock/entitlement）。
- 方法：纯静态。核对 HEAD/clean/refs 与唯一 diff 命令；必读文档全读；不运行测试、不装依赖、不 spawn agent、不做 GUI/系统面板操作。

## 结论

- `CODING_STANDARDS.md`/`CONTRIBUTING.md` 全仓不存在（glob 证实），规则基线为 AGENTS.md + docs/。
- 未发现书面规则硬违反；Bridge selection 契约、source-authority 原文/历史边界、保存屏障顺序、授权/离线 CSP、非 UI 测试路径均有代码证据对应。
- Fowler smell 按文件/hunk 报告于 `docs/reviews/INK-REV-074-image-integration-standards.md`，全部标注 judgement；最显著为安全读文件循环 4 份重复且 EOF 语义漂移，其次 selectionAnchor/Head 数据团、role 字符串原始类型化、EditorViewController 发散变更。
- 真实 WK/拖放/剪贴板/书签/面板/IME/关闭重开/macOS 14 属 root 已声明物理验收门槛，未验不另计缺陷。

## 执行与未验

实际执行：git diff 逐块静态审查（Bridge Swift/Web、source-authority/ledger/transaction、EditorViewController、InkoraDocument、DocumentAssetBroker、LocalImageStore/Migration、AssetBookmarkStore、image-view/runtime/CSP）、必读文档对照、两份交付文档、commit+push。
未执行：任何测试/构建（root 证据不重复）；产品代码、依赖、权限未改动。
