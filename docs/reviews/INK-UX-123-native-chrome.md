# INK-UX-123 两轴复核

固定基线`27ba9e07e7229fe13a2374c8c15be3f0c166e1c1`；首次产品HEAD`6c5453423a892728f4552150c785a918260eb2b1`，资格补正`bd8b9eb7d01406a007e383e5be986cb5308b681e`，最后封口补正`a4bb8359873d341c34ac0e91c0684239904ca80e`。每次使用三点diff，均非空。两名fresh-context审查者分别只读Standards与Spec；下述自跑/外部证据边界分别保留。

## Standards

首次审查已读AGENTS、GLOSSARY、ADR-0004、Bridge、editor-session、save-barrier、testing、quiet-chrome；未找到CODING_STANDARDS/CONTRIBUTING。

- Hard：0。
- Judgement/P3：`.history(command)`同时承载源码、查找、阅读宽度等新动作，命名无法揭示职责，容易误判严格版本绑定/重试行为。建议更名，属于维护风险，没有实证功能错误。
- bd8b9eb后验：已更名`.editorCommand`；显式订阅、独立资格事件、旧客户端保留入口、模式焦点、图片面板owner复验、快捷键避让均未发现新hard或可行动smell。
- a4bb835后验：无新增hard/judgement；取消组合的无内容稳定封口仅通知status，不改原文/历史；测试检查公共行为，保留synthetic边界。

该轴全程只读，没有运行测试或修改文件。

## Spec

规格来源：[quiet-chrome](../design/quiet-chrome.md)及用户确认的[第二轮计划](../design/typora-ui-round2-plan.md)。未发现可行动scope creep。

1. **P2，草稿输入后快捷键资格滞后。** 首稿中源码输入仅产生runtime status，而main直接return；Native仅缓存`availableCommands`，刷新只在展开菜单。直接⌘⌥Return会因缓存不含applySource被禁用；可见取消按钮回可视也可能遗留sourceMode禁用。审查者实际运行临时main公共接缝用例1/1，确认只有显式queryState才恢复资格，之后删除临时副本。
2. **P2，正文composition无内容取消后资格未恢复。** bd8b9eb在DOM end的microtask仍读到24ms settling，得到空资格；实际settle仅在logical revision变化时通知main，取消无通知。该后验为只读代码链证据。根另建main RED，实际观测取消后仍`[]`，再补runtime真实settle的无内容status通知；不改quiet window、历史或解析。

补正采用Native显式`observeCommands`协商，Web用`commandsChanged`单独同步资格，不冒充正文状态。Native不把资格更新送入NSDocument正文/恢复路径。进入模式后焦点交还编辑面；新Native确认菜单可用后Web才收旧入口。

a4bb835限定后验确认：两个P2均已关闭，新增main及真实WK用例覆盖无需展开菜单的资格恢复；未发现新增可行动风险。除首稿最小main用例外，该轴未运行根的全量门禁，后验不冒称自跑结果。

## 主会话验证边界

实跑命令、红绿与最终计数见[任务记录](../tasks/INK-UX-123.md)。主会话另外自检并避免了模式快捷键占用现有标题1/2命令；这不是两轴审查者的新发现。

目前无未关闭的两轴finding。没有进行桌面菜单/真实双窗口响应者链、系统文件面板、物理键盘、输入法或改后视觉验收；hostless WK、编译和静态复核不替代这些结果。没有据此宣称与Typora整体一致。
