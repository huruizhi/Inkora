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
