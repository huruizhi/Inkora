# Standards

## INK-REV-091 任务记录

### 任务边界

- 评审轴：Standards；不作 Spec 判定。
- 固定比较：`git diff d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14...HEAD`。
- 固定 HEAD：`49440e1b3bd7ea70974a5d671680c34f5b5c75d1`。
- 提交列表：仅 `49440e1 fix(editor): preserve multiline reference definitions`。
- 分支：`task/INK-REV-091-reference-standards`。

### 已完成

完成 AGENTS、GLOSSARY、ADR-0004、Markdown 支持矩阵、Bridge 协议、编辑会话、保存屏障、测试、本地图片、INK-M1-087 任务与 CommonMark fixture README 的逐行核对；确认仓库不存在 `CODING_STANDARDS.md`、`CONTRIBUTING.md`（0 个）。按指定 Fowler baseline 审阅产品 diff、测试、fixture、证据与许可。

### 结论

- Hard violations：0。
- Judgement smells：0。
- 书面规则符合点：accepted parser provenance 与全局 first-wins 复用；字段级原文范围与局部 patch；空 destination 的 schema 表示与创建/导入安全边界分离；离线 CommonMark oracle 的来源、SHA、署名与 CC BY-SA 4.0 记录。
- 未发现需要在 Standards 轴提出的修复项。

### 验证与限制

本次只执行了只读审查命令、`git diff --check` 与文件/提交/分支状态核对；未重复全量测试。root 提供的证据（不转称为本次自跑）为 editor 32 files/679 passed、Web Bridge 14/14、Native 169 passed/0 failed/8 existing performance skips、lint 通过。未启动 App/window/NSAlert/系统面板/CUA/browser/XCUITest/bench-full/物理输入；未运行 `make setup`。

### 交付文件

- `docs/reviews/INK-REV-091-reference-standards.md`
- `docs/tasks/INK-REV-091.md`

后续提交、推送、远端 SHA 与 clean 状态将在完成后补记于本任务交付消息；不修改产品代码、已有证据或 fixtures。
