# 030 首轮独立验收：退回限定修正

固定交付：`6658185fd87ab3d23adbed0c5934fd852acd8f2b`，本地与 origin 一致、工作区干净。与029契约基线 `6e6e2b8` 的差异仅新增 `editor/prototypes/source-authority/` 11个文件。原实现Agent已归档（closed，archivedAt=2026-11-08T20:00:09.038Z）。

## 实际重跑

管理者执行 `make -C editor/prototypes/source-authority test`，退出0：PRIMARY8、repeat13、paragraph3及其余6组通过，oracle SHA仍为 `c53b2f9c54357a624c7ccd7a1e4a7d1ccf272f665d871de96f686bc46e031d08`。该绿结果不足以验收：源码测试直接调用控制器，未覆盖真实textarea转换；视觉输入 helper也在控制器内部dispatch，而非全部经过EditorView.dispatch。

独立脚本：`/Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-030-checks/review.cjs`，冻结输出同目录 `RED.txt`。脚本读取真实离线HTML，实际运行exit1，3项断言全部红：

| 路径 | 预期 | 实际 |
| --- | --- | --- |
| BOM+CRLF文档，页面源码入口后直接Apply | 原字节、dirty=false、无新增历史 | textarea归一LF，Apply写回LF、dirty=true、past=1 |
| a后输入b，页面源码草稿ab DRAFT，再Undo | 草稿及原文完整保留或明确拒绝旅行 | 原文回a，draft=null，但页面仍sourceMode=true |
| abc先访问raw3，再raw1输入X；实际PM光标4（b后）输入Y | aXbYc+LF | aXbcY+LF |

第三项与旧projection anchor未随PM mapping移动有关；通用语义重投影分支还会接受与目标PM不符的补丁，掩盖错位。需通过可审计语义操作证明hardbreak/输入规则，不能任意差异全放行。根因候选已报告，须以先红后绿回归验证。

## 限定接续

仍用 `wks_aa63ecfcc29de8fa`、原030分支和工作目录，不新建侧栏工作区。Agent `d4617e58-8cee-4af9-bad6-fdecdc55a43c`，host `srv_MEqRNkRW6fSx`；profiles为空后inspect_provider核实GPT-5.6-Sol可用，high/default/full-access，notifyOnFinish=true。范围只允许新原型目录，冻结契约、旧控制、生产及依赖均不改。

要求补真实EditorView/DOM按钮/textarea接缝、CRLF与混合EOL偏移保真、草稿Undo/Redo守卫、所有anchors映射和不安全语义差异拒绝；不可删除有效断言或用预期patch反哺模型。若公共投影契约无法满足则报告表示失败，不继续堆叠staged特例。

030首轮未验收，未合008/main；已接收旧集成仍ea63941，M0和架构采纳均未通过。真实WK/物理搜狗待修正后固定单一bundle再验证，不以新自动矩阵替代。当前工作区仍有在做修正任务，暂保留；任务结束独立验收并核对备份后回收workspace层。

## 7cedafc 补正复核与末次 composition 缺口

7cedafc29880f19a6f2b1e093157130d65b8266b 已推送且工作区干净。管理者实际重跑原只读 review.cjs，CRLF 源码 no-op、草稿旅行守卫、编辑锚点三项全绿；新增页面回归11/11及原9域、PRIMARY8、repeat13、paragraph3全过。改动仅新原型目录。原Agent d4617e58-8cee-4af9-bad6-fdecdc55a43c 已归档，closed，archivedAt=2026-11-08T20:23:54.268Z。

新增独立真实EditorView synthetic/replay：a+Space+LF raw2 → compositionstart → marked zhongwen (meta71) → compositionend → final中文 (同meta71) → Undo，实际恢复 a+Space+zhongwen+LF，预期应会话前a+Space+LF。root-030-checks/composition-late.cjs 实际exit1，冻结输出 COMPOSITION-LATE-RED.txt；不是物理IME新证据。endComposition立即封账与同ID末次事务需统一处理，不能以Undo前past计数1误判通过。

因此原三项补正局部接受，030仍未整体验收。Agent adb05108-b6a8-42df-bb49-516f67e07b07 在同030工作区限定接续（GPT-5.6-Sol/medium/default，profiles为空后provider核实，notifyOnFinish=true），只修历史分组时序并保持oracle和旧对照冻结。真实WK/搜狗验收暂未开始，008/main未合，不新建侧栏工作区。

## 493e2b7 自动层接收与031运行时准备

030最终提交 `493e2b7cdbe982da02f4747e89a0cf52df3a770f`。管理者独立重跑原review.cjs三项和composition-late.cjs一项均通过，最终Undo回 `a+Space+LF`；完整新原型页面11组、集成10域通过。冻结oracle SHA未变。仅接受冻结范围内自动层结果，不声称完整Markdown映射、M0或架构采纳。

完成Agent adb05108-b6a8-42df-bb49-516f67e07b07 已归档。030工作区 `wks_aa63ecfcc29de8fa` 经328文件逐字节归档校验、交付Git bundle verify和分支远端核对后归档，owned目录已删除，workspace列表已无该行；备份总数34。原脚本中的旧工作区路径现为历史证据路径，后续复核应使用031本地验证目录或备份恢复，不能误认旧路径仍存在。

本地验证分支 `task/INK-PROT-031-source-authority-wk`，目录 `/Users/rayhu/Documents/projects/Inkora/.worktrees/INK-PROT-031`，不登记新Paseo侧栏行。只读宿主observer兼容新textarea并记录唯一原文状态，新旧observer检查通过。宿主构建基线 `1c586967039c2b03b2584a901a3afa077ee17fa7`，代码未修改030核心；源HTML SHA `4b8a2a3d51071ce6a5e6456f48c86f65f88d0786253f4959c768bddfc2ceca99`，bundle SHA `7aaa2e7f7ff79104c01bf378dd79c959a084ba7a14ce480f82a978e26c23c807`，签名及Info/manifest/文件哈希核对通过。

desktop preflight实际退出78，屏幕锁定；未启动App或取得UI锁。已请求用户解锁与物理搜狗配合，等待明确回复。031证据与复现步骤在native-host/SOURCE-AUTHORITY-RUNTIME.md、INK-PROT-031-evidence.json；普通WK和物理IME均尚未执行，旧008仍ea63941，11/12门槛不解除。

用户随后明确选择“稍后再做，先保留当前进度”。031真机/物理搜狗验收暂缓，保留本地构建、证据和分支，不启动窗口或派新Agent。恢复前须重新检查desktop preflight、固定产物哈希和用户即时可配合状态；自动层已通过，M0仍未通过。
