# INK-UX-115 两轴独立审查

固定首稿：`e490bb0...a61dee1`，仅 `a61dee1 feat(editor): render local math diagrams and footnotes`，17 文件。两位 fresh-context 审查者在独立 clean worktree 只读审查，未改产品、安装依赖、启动 GUI 或复跑根全量。外部执行结果不作为审查者自跑。

## Standards

Hard 0，未发现足以要求修改的 Fowler judgement。依赖已在任务中说明，CSP 未放宽，build/dev 准备精确 vendor 与生产依赖许可，Vite/public→build/editor→App 路径覆盖新增资源。保护 raw 属性和只读边界保留，预览 DOM 未成为保存源；异步边界检查取消及节点连接状态。

## Spec

P2 1 项：引用/列表内 canonical 已接受的 SYN-D003 公式，raw 含物理容器前缀；首稿仅检查 raw 首尾 `$$`，导致正常内容仍回退源码卡片。反例分别为 `> $$\n> E=mc^2\n> $$\n` 与 `- $$\n  E=mc^2\n  $$\n`。不报告行内数学冻结或延期的桌面视觉为缺陷；scope creep 0。

## 限定补正

- canonical math rule 由同次 block state 的 getLines 生成显示正文，放在独立 token metadata；完整物理 raw、source ranges 与语义 token.content 保持原含义。
- SourceAuthority 提供只读显示内容访问，缓存严格绑定 full raw 与 PM doc identity；节点位置、math 次序及 expected raw 核对后才提供正文。runtime NodeView 消费此事实，不增加 schema attrs，不重解析切片，不另设语法扫描器。
- 新公共 runtime 回归先 3/3 红，再覆盖引用、列表、BOM/CRLF，以及源码编辑/Undo/Redo 的内容更新。
- 发现固定 a61 基线已有独立资格遗漏：仅嵌套保护 atom 的容器已映射 canonical token，却被“没有 inline token”检查拒绝。首稿和补正前同样为 false，原因一致。修正为同时计入已接受 opaque block action，后续逐 atom 的完整类型/raw/attrs 匹配继续执行；不绕过 doc.eq 或放宽不明差异。
- 增加反向控制：同一 canonical 范围下，伪造不同 raw 的保护 atom 仍被账本拒绝。未删除既有测试或冻结资料。

最后实际门禁：Web 763 + Bridge Web 14 = 777；Native 190 total / 182 passed / 0 failed / 8 既有性能 skip；Bridge Swift 15/15；make lint 与 make test-non-ui exit 0。真实 WK 同时验证顶层/引用/列表 MathML、flowchart、脚注、代码编辑与原文往返。

固定补正 `2e0be9f` 后验已完成：Spec 原 P2 关闭，有限范围无新增 finding；Standards 有限补正无新增 hard。两者均通过固定 git show 核对，不读动态根文件。Spec 另以只读探针验证三类容器 MathML；完整 777/182 等仍明确为根执行证据，未转称审查者自跑。
