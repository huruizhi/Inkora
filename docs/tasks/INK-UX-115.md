# INK-UX-115：离线公式、Mermaid 与脚注显示

用户已确认这三项纳入 Typora 对齐目标，排版后继续实施。基于 INK-UX-112 的生产布局；此任务只增加可编辑投影的显示能力，不改变原文/schema/语法所有权、保存屏障或图片策略。

## 明确依赖与接缝

- 新增精确锁定的 KaTeX 0.19.1，用受限 MathML 输出交给 WebKit 原生排版，不加载外部字体/CDN。
- 新增精确锁定的 Mermaid 11.17.2，使用 strict 安全配置、本地 SVG 输出；不启用文档内配置/网络图片/交互脚本。当前 Mermaid 12 文档声明 Safari 17.4+，本任务不因此提升 macOS 14 部署目标，先选择维护的 11.x 并核对实际代码。
- 仅消费 canonical parser 已接受的 math/footnote 节点及 Mermaid code_block；不增加独立语法扫描真值。
- 通过现有 production runtime/EditorView 与真实 WK 接缝验证显示、失败状态、精确快照、编辑切换及历史。原文卡片只保留为错误/源码回退，不作为正常呈现。
- 打包保留新增生产依赖许可，App 继续离线；不修改 CSP 以允许网络或任意脚本。

资料： [KaTeX options](https://katex.org/docs/options)、[Mermaid usage](https://mermaid.js.org/config/usage)、[Mermaid config](https://mermaid.js.org/config/schema-docs/config)。实际实现、验证和限制在完成后追加，当前不宣称通过。

## 实现与边界

- 现有 `SYN-D003` 块公式输出原生 MathML，带宏展开、尺寸和长度上限；非法 TeX 显示简短诊断及完整原文。行内 `$...$` 仍按 canonical `SYN-U005` 处理，此显示任务不放宽其语法/保存契约。
- Mermaid 使用精确锁定的本地 classic vendor，进入可见区域才加载；默认 strict、禁 HTML label 和文档级配置，限制 20,000 字符/300 段/200 边，完成后剥离可执行、外部资源与跳转元素。原文仍是代码块，可点击图或“编辑图表”返回真实代码编辑；编辑/失焦不写入额外历史。
- accepted 脚注引用呈上标入口，定义呈格式化说明和返回入口；只滚动当前投影内匹配目标，composition 中不导航。定义仍为只读保护原文，主动源码可修改；预览不成为 owner 或保存源。
- 异步图表工作按文档排队；更新、源码切换和 destroy 会取消旧节点发布，失败保留代码，不阻断其他写作。
- build/dev 入口准备 vendor 与生产依赖许可；Mermaid 单独约 3.4 MiB 按需加载，主 bundle 约 928.53 kB / gzip 297.50 kB。CSP 未放宽，未加载 CDN/外部字体。
- 原有 inline atom 的 `contenteditable=false` 属性被完整保留；显示结构变化的有效测试改为核对 exact raw attr、只读性与新预览内容，未删除安全断言。

## 验证与诊断

- 新 production runtime 回归 5/5，含 BOM/CRLF、source no-op、失败回退、恶意字面、脚注 composition 守卫、配置拒绝与取消发布。
- 完整 editor：40 files / 772 passed；lint 与 Debug build 通过。
- 真实 WK renderer 已验证 MathML、中文 flowchart SVG、脚注格式、同源资源、CSP、原文快照与 source no-op。首次脚本错误地点击禁用的 no-op 提交按钮，后改用真实“可视”返回；没有改产品保存逻辑。
- “编辑图表” WK 红环定位：已接受选区 selected=1、activeElement=editor，但 ProseMirror-focused=0，CSS 仍 display=none；排除选区拒绝与异步覆盖。改为 accepted selection 驱动编辑，并调整 CSS specificity，定向真实 WK 1/1 通过。探针保留为外部行为断言消息，不含生产调试日志。
- `make test-non-ui` 实际 exit 0：editor 758 + Bridge Web 14；Native 190 total / 182 passed / 0 failed / 8 既有性能 skip；Bridge Swift 15/15；CI 入口检查通过。xcresult 均为 Passed。

## 状态

用户明确暂无 Developer ID/公证凭据，现阶段先准备 Release 候选；不发布未经签名公证的正式包。最终 Debug App 已重建，但 desktop preflight 实测 exit 78（屏幕已锁定），因此新增渲染目前只有真实 hostless WK 图形/布局/行为证据，最终桌面视觉仍待解锁后查看。候选包结构与独立审查在本轮继续收束，不宣告完整 Typora 功能或 macOS 14 实测通过。
