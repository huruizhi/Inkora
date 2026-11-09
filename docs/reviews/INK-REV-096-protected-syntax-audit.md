# 首阶段 V2 保护片段生产接缝核查

固定生产main `15687430b7f2e5272975cc469e9c6ff30f0324f9`。本轮不是新一轮全面双轴审查，仅按已确认首阶段范围/ADR-0004/markdown-support的公共行为追踪剩余V2缺口；不修改生产实现。

## 实证发现

1. `SYN-D002`与优先级§4要求合法脚注定义优先于CommonMark引用定义，并作为不透明原始片段显示。公共会话打开`Before.\n\n[^note]: definition\n    continuation\n\nAfter.\n`，实际没有任何protected_block，定义被引用定义gap吸收。文件字节尚在，但用户不可见该片段。
2. `SYN-D007`明确不接受lazy continuation，callout止于首个不以`>`起始的行。输入`> [!NOTE]\n> opaque\nlazy continuation\n\nAfter.\n`，实际protected raw包含`lazy continuation`，冻结了不属于callout的正文。
3. 首阶段用户要求“受保护原文片段与正文混排，其余正文继续可视编辑”，`SYN-D006`范围是完整Wiki词法片段。输入`Before [[target]] after.\n`，实际整段变为protected_block，`setRawSelection(0)`拒绝，无法在Before前直接输入。

控制：未闭合front matter `---\ntitle: bad\n\nBody.\n`实际saveEligible=false、源码入口可达，补闭合围栏后可保存。本轮不把它列为缺陷。这些均非物理输入、最低系统或UI待验的替代发现。

## 证据

真实`SourceAuthoritySession`公共接缝，原始测试与RED.txt冻结于`docs/evidence/INK-REV-096/`。命令：将测试原样复制到editor/src后执行`pnpm --dir editor exec vitest run src/protected-production-audit.test.ts`，实际4项中3红1绿；测试结束后移回证据目录，避免未修复断言污染生产测试入口。未改旧测试/fixtures，未用私有方法或DOM文本冒充原文权威。

## 下一步

V2须显式定义块级/行内opaque范围与异常候选归属，由同一canonical边界供parser/ledger/保护atom/保存闸门消费。脚注与callout先锁定外层，再进入CommonMark；行内Wiki等需真正行内atom，不能整段保护。保持原文/anchor/selection/history、source repair、链接/代码/HTML内部边界优先级。先冻结有限oracle，再按垂直切片实现并重新执行完整自动矩阵；不降低canonical目标或宣告首阶段通过。
