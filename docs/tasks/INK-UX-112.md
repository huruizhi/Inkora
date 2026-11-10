# INK-UX-112：正文排版与低干扰界面

## 范围与来源

用户已确认 [Typora 写作体验对齐](../design/typora-writing-experience.md) 的界面方向，并要求完成显示优化及发布 Release。此任务交付第一批排版和界面；公式、Mermaid、脚注真实渲染继续在后续切片实施。固定起点为 `4e8da31a91324c88b2a18d7eb223e910af17eb07`（产品基线 main `a2b6211…`），独立分支 `task/INK-UX-112-writing-experience`。

## 完成内容

- 正文 760px 最大阅读宽度按实际编辑容器计算；统一标题、段落、列表、引用、链接、行内代码、表格和代码块的呈现。
- 左侧大纲默认收起，收起宽度为零；窄窗从左侧覆盖展开，不再使用底部大纲条带。
- 内容字数/字符数置于底栏；计数规则按需展开，原有统计口径不变。
- 顶部查找和模式/插入控件合为一行；为原生图片按钮预留空间。真实 App 首次检查发现重叠，修正后再次确认分离。
- 表格/代码工具由 PM 选区派生装饰与焦点控制显示，工具持焦期间保留，浮动显隐不推移正文。
- 大纲 pointerdown 保留正文焦点；正文/查找/链接组合输入中不切换大纲。
- 当前原文、schema、Bridge 字段、保存屏障、图片策略、语法与依赖均未改变。

## 修改范围

Web：正文新样式、上下文装饰；面板/顶栏接线；表格滚动容器与工具可访问名称；对应面板/main/runtime 测试。

Native：只新增现有 EditorWebViewTests 的真实 WK 布局回归，检查 900/480px、零宽侧栏、底栏、顶端图片预留、页面无溢出与原文快照；没有修改 Swift 产品实现。

文档：本任务、确认后的体验规格、原始事实记录追加决定，以及大纲面板当前行为说明。

## 实际验证

- editor 全量（含 Bridge）：39 files / 767 passed。
- 专项面板/main/context：3 files / 112 passed。
- `make lint`：Swift strict 与 tsc 通过。
- `make build APP_BUNDLE_IDENTIFIER=com.huruizhi.Inkora.UITesting`：Debug 构建通过，保留既有 Swift actor/chunk-size 警告。
- 真实桌面：在独立候选 App 使用自有 Typora-Comparison.md，确认正文/左侧大纲/底部统计、表格与代码工具独立切换，以及顶部原生图片控件不重叠。只读操作，未重做物理 IME。已退出本次候选并释放 UI lock。
- 真实桌面未完成窄窗缩放和深色外观检查；不能将 CSS 或 jsdom 说成真实视觉证据。窄窗另由 WK 集成接缝验证。
- 原始 Markdown SHA 保持 `90885c3f2a22d54303c037cbd58e511bebbc192fdb2f41635709b146434c6293`。

WK 定向实际 xcresult 为 Passed：2/2，通过 900/480px 布局及长文单滚动所有者。独立 Standards 无 hard，1 个非阻断 judgement；Spec 发现表格键盘工具入口 P2，已增加 Option+F10 进入与 Esc 返回，含组合标志守卫及原文/历史不变回归。详见 [两轴报告](../reviews/INK-UX-112-writing-experience.md)。

## 发布与剩余工作

当前环境 `security find-identity -v -p codesigning` 返回 0 valid identities，三个 INKORA 发布配置均未设置。尚不能完成 Developer ID 签名、公证或对外发布；不会将 dry-run 包伪装为正式分发包。继续准备完整显示优化候选和发行记录，待发布凭据齐备后执行正式入口。

公式、Mermaid、脚注仍待后续实现；本任务不宣告整体 Typora 对齐或 Release 已完成。未改变 macOS 14 部署目标，也不重新要求其专项实机验收。
