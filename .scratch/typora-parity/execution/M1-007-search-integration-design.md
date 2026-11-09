# INK-M1-007：查找界面接入契约

基于task/INK-M1-005-panel-runtime-review的daec0f6，独立研究/设计任务，不实施产品代码。允许新增docs/design/source-search-integration.md和docs/tasks/INK-M1-007.md两文件；可只读检查main/runtime/kernel/session/Bridge/现有source-search及测试，不读取/修改006并行工作树。不创建子Agent、不运行GUI、不安装依赖、不网络研究。

目标：为下一任务形成可直接实施的当前文档查找面板契约，明确查询/大小写/计数/上下一处/回绕/关闭/键盘行为，模块原文匹配与可视显示的差别，以及当前生产接口确实缺什么。不要假装生产已有实验source ledger。给出固定基线+源码行号证据、简明接口草案(非代码改动)、范围/失败码/状态归属、测试矩阵、任务拆分与依赖。

重点：raw/revision/documentID绑定、快速编辑过期与同revision异文档、composition时焦点/选区安全、source CRLF/BOM/字素边界映射、PM可视匹配与语法/href/保护片段的不可映射情况、当前只读bareCR、导航不改dirty/history、truncated显式提示。不得使用text首次find或全量serialize/setText替代位置映射。

明确分开可先交付的查找UI/结果列表与下一步安全替换；单/全部替换必须在一个事务原子应用完整计划，重验raw+revision+文档，失败保留用户意图且不部分应用。不能为了可视查找或替换自动整篇切源码。未找到可靠映射的结果应明确不可定位/替换，不渲染虚假按钮；若这导致达不到产品目标，清楚列为前置接口任务而非宣布功能完成。

输出有界推荐，不扩到跨文件/正则/云/原型迁移，不改变M0门槛。仅文档git diff --check及引用核准，不必跑产品测试；未运行如实说明。英文Conventional commit<=72，push同名分支核对origin/clean，回报文件/证据/未完成风险/完整SHA。不开PR、不合main、不改Issue；完成即管理者回收Agent/workspace。

## 调度指针

Agent 79e898f7-a957-4aef-80d0-8886f46a2eee，workspace wks_088d366288e2e630，host srv_MEqRNkRW6fSx，分支task/INK-M1-007-search-integration-design，cwd /Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-007-search-integration-design。profiles再次为空，provider核实OMP zhipu-coding-plan/glm-5.3，low/full；已取得running回执，notifyOnFinish=true，不轮询催促。
