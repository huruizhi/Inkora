# INK-UX-137 测量证据

`before-after-candidate.json` 为未改生产 CSS 的基线与同 DOM 候选样式；`production-after.json` 为落地生产 CSS 并重新构建后，新进程/新 WK 的结果，无候选样式注入。每个 JSON 记录 viewport、列宽配置、浅深色、实际 rect/computed margin、原生 dirty/revision、DOM identity、windowVisible 和滚动数据。最终资源 URL 与 SHA 见 JSON 和 `bundle.sha256`。

原对照样稿 SHA256 为 `90885c3f2a22d54303c037cbd58e511bebbc192fdb2f41635709b146434c6293`，复制后核对一致。`fixture.md` 在原稿后追加明确的相邻标题、引用链接、长代码/表格压力样本；`raw-before.md`、`raw-after.md` 与该 fixture 字节相同。未向 DOM 反写 Markdown。

| 项目 | before | production after |
| --- | --- | --- |
| h1→p border-box gap | 25.5px | 17px |
| h2→相邻h3 gap | 34px | 21.25px |
| 后续 h3→列表 gap | 15.9375px | 15.9375px |
| h2→表格 gap | 30.59375px | 30.59375px |
| h2→后续段落 gap | 23.796875px | 23.796875px |

以上在8种 viewport/配置/主题组合一致。1200 viewport 实际内容宽 883/743px；480 viewport 两档均415px（包含经典滚动条占位影响）。editor scrollWidth == clientWidth，页面 scrollWidth == viewport；长代码 scrollWidth 6963px、表格2994px，分别在 overflow:auto 容器自行横滚。正文17px、line-height30.6px，h1 34px、h2 25.5px、h3 21.25px，层级保留。

执行路径：`zsh build/artifacts/INK-UX-137/run.sh`，Swift6 编译所有当前生产 Swift（排除 AppDelegate），以仅含 build/editor 的资源 Bundle 构造 InkoraDocument + EditorViewController。通过生产 bridge requestRecoverySnapshot 等待并核对真实原文、revision；不请求保存、不写偏好。脚本及 Runner.swift 保留在临时目录，未改已有测试文件。

CSS 修改只有两个局部 selector（3行新增含注释），不是将 CSS 统计或 jsdom 当作几何证明。未尝试离屏 takeSnapshot，未获得 paint 层级证据；上述主题覆盖以最终 JSON 中 darkMedia 与 computed color 为准。
