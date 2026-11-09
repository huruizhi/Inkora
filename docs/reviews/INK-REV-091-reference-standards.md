# Standards

## INK-REV-091 独立 Standards 评审

评审对象：固定 HEAD `49440e1b3bd7ea70974a5d671680c34f5b5c75d1`，基线
`d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14`；唯一审查命令为
`git diff d6c159bb2524a979c9ef95fc9cc3a5a5b2d0af14...HEAD`。提交列表仅含
`49440e1 fix(editor): preserve multiline reference definitions`。HEAD 与工作树在评审开始时均已核对；diff 非空。

### 核对的书面标准

- `AGENTS.md:3-10`：中文文档、独立任务分支、任务范围、如实报告测试、不得绕过测试/引入未说明依赖、原文/IME/历史约束、离线平台与统一入口。
- `GLOSSARY.md:7-20`：当前原文、可编辑投影、位置依据、保存点、源码草稿与组合输入术语。
- `docs/adr/0004-source-authoritative-editing.md:4-12`：原文唯一权威、PM 投影、字段/位置/历史原子更新、禁止第二内容权威与无审计重建。
- `docs/markdown-support.md:7-18,35-41,65-88,113-120`：独立任务与 golden fixture、SYN-S010、FID-001..005、CommonMark 基线及保存闸门。
- `docs/bridge-protocol.md:3-21,96-102,135-156`、`docs/editor-session.md:14-24,45-49`、`docs/save-barrier.md:1-16,18-35`：Bridge 不变式、owner proof、composition、snapshot 与保存边界。
- `docs/testing.md:12-48,50-60`：默认非 UI 测试路径、测试命令与证据边界。
- `editor/test/fixtures/commonmark-reference-definitions.README.md:1-9`：离线 oracle、CC BY-SA 署名/许可及投影适配边界。

仓库中未发现 `CODING_STANDARDS.md` 或 `CONTRIBUTING.md`（0 个）。

### Findings（核心结论）

#### Hard violations：0

未发现书面规则背离。变更沿用现有离线 markdown-it/ProseMirror 链路；`reference-context.ts:5-20,40-89,115-158` 将 parser 接受结果与字段范围封装为 provenance，符合 `ADR-0004:6,10` 与 `markdown-support.md:17,35-41`。`source-document.ts:32-42,61-80,126-145` 使用 accepted global first-wins 环境及遮蔽 gap，没有新增第二份定义语法或内容权威，符合 `ADR-0004:10`。`source-authority.ts:398-490` 只对变化字段生成 patch，并保留原 destination/title，符合 `FID-002/003`。schema 放宽空 href 的同时保留创建/导入守卫，符合 `markdown-support.md:17` 与任务说明 `docs/tasks/INK-M1-087.md:18-20`。

测试与 fixture 变更未删除或绕过有效测试；CommonMark fixture README 明确记录来源、SHA、署名、许可和离线运行（`editor/test/fixtures/commonmark-reference-definitions.README.md:3-9`）。提交 subject 为英文 Conventional Commit 且长度合规。root 提供的外部证据记录为：editor 32 files/679 passed、Web Bridge 14/14、Native 169 passed/0 failed/8 existing performance skips；本评审未将其冒充自跑。

#### Judgement smells：0

按固定 Fowler baseline 检查，未发现足以记录的 Mysterious Name、Duplicated Code、Feature Envy、Data Clumps、Primitive Obsession、Repeated Switches、Shotgun Surgery、Divergent Change、Speculative Generality、Message Chains、Middle Man 或 Refused Bequest。`ReferenceField` 与 `DefinitionProvenance` 是对领域概念的收敛，不是 primitive obsession；两个 owner 转换函数的字段复制遵循既有结构，不构成新增重复逻辑。

### 限定与风险

本报告只覆盖 Standards 轴，不作 Spec 判定。未重复 root 已完成的全量测试，也未启动 App、窗口、系统面板、CUA、XCUITest、bench-full 或物理输入。仅核对了静态 diff、书面标准、fixture README、提交与已有证据文件。
