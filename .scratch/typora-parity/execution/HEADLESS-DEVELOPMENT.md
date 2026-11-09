# 锁屏期间可并行推进的开发

用户确认暂时无法打开屏幕，并询问继续后续开发；按既有自主推进授权，启动两项与M0架构选择无关的纯模块实施。真实WK/搜狗仍暂缓，不更改11/12、05、08、15的依赖，不写采纳ADR，不改030/031冻结产物。

这两项是M1写作辅助的数据与操作基础，不宣称完整M1功能或UI已交付。均从生产主线固定提交 `36e636578798510d240b23520122c88578cf3fe5` 独立分支，只新增模块、必要测试与说明；不引用实验内核，不写文件、不发网络请求、不调用DOM/PM/Bridge/NSDocument。模块交付须独立审核，当前不自动合入main或连接UI。

## INK-M1-001：文档大纲与统计

允许文件：`editor/src/document-analysis.ts`、对应`.test.ts`、`docs/document-analysis.md`、`docs/tasks/INK-M1-001.md`。

- 公开输入为不可变快照 `{raw: string, revision: number}`；返回相同revision、章节索引和统计，不修改原文或会话。范围都是原文UTF-16半开区间，保留BOM、LF/CRLF/混合EOL的正确偏移；不归一化文件。
- 大纲复用已锁定markdown-it的CommonMark解析，识别ATX1–6和Setext；正确处理重复标题、嵌套引用/列表中的标题、代码围栏与缩进代码。显示文本来自inline token（链接显示label、代码显示内容、图片显示alt），不执行HTML，不生成或改写slug/文件。
- 接受调用方提供的`excludedRanges`，供已识别的高级原文/元数据排除；在解析副本上保持UTF-16长度及换行边界后屏蔽，不改变原文。范围非法、重叠或切断CRLF/字素时明确拒绝。没有提供范围时只承诺CommonMark，不假装理解所有公式/元数据方言。
- 同时给出原文统计与可读内容统计，明确不是Typora所有语言计数的精确复刻。字符以字素簇计，空白不计；emoji组合/组合重音各一个字符。写作单元：每个Han字素一个；其他Unicode字母/数字连续串一个，附着组合符不拆；标点、emoji及下划线/连字符分隔单元，不计作单元。需文档和独立预期冻结，不能含糊写“字数”。原文统计包括Markdown符号；内容统计只计可读文本和代码，链接目标/引用定义/格式定界符不计，排除范围不计内容。
- 至少覆盖中文/英文/emoji/组合重音、BOM/CRLF/混合EOL/无尾换行、空文档、代码假标题、Setext与分隔线区别、重复标题、链接/图片alt、代码文本、排除范围及无修改保证。较大样本仅做有界规模烟测，不宣称真实WK性能预算通过。
- 独立纯函数，不新增UI/插件/菜单/主题/新依赖；不修改现有parser、schema、runtime或有效测试。

## INK-M1-002：当前原文的查找替换

允许文件：`editor/src/source-search.ts`、对应`.test.ts`、`docs/source-search.md`、`docs/tasks/INK-M1-002.md`。

- 快照同形 `{raw, revision}`。字面查找，非正则模式；支持大小写敏感及ECMAScript Unicode简单大小写匹配，明确不做规范化/多字符折叠。查询里的正则特殊符号按普通字面值；空查询得到明确有限结果。默认非重叠，支持从原文选区定位前后匹配和回绕。
- 搜索整个当前原文（含代码/保护片段），此模块是源码工具，不冒充可视模式所有区域可编辑。返回准确UTF-16半开区间和与搜索绑定的原文/revision。匹配不得切断surrogate/字素/CRLF；BOM不作为可替换正文。选择或筛去非法边界须显式可解释。
- 单个替换/全部替换只返回纯计划：精确原文patch、结果原文、计数及有向选区建议。每次计划验证调用时原文与revision均与搜索一致，过期或同revision异原文都拒绝。无匹配/no-op不制造变更；替换文本按字面（`$&`/`$1`等不插值），不改无关范围/EOL/BOM。新文本非法Unicode或建议落点位于新字素/CRLF内部时明确拒绝，不静默吸附。
- 默认结果上限10000，可显式传更小正整数；截断必须显式，全部替换禁止拿截断结果当完整结果。计划不修改输入，禁止自动写磁盘、改PM、dirty/history/保存点。未来适配器必须把全计划作为单个编辑历史事务，并落实composition、保护片段与文档安全守卫；本次不实现适配器或承诺其验收。
- 覆盖中文、重复/重叠查询、emoji/ZWJ/重音、BOM/CRLF/混合EOL、引用/代码字面搜索、敏感/不敏感及Unicode长度变化反例、空查询、替换特殊符号、单个/全部、no-op、过期计划、截断、方向/回绕、恶意边界和原输入不变。通过局部patch重推导结果，不用期望文件反哺实现。

## 验收与调度

沿用项目AGENTS，Conventional Commits，真实运行新专项及editor lint/完整editor非UI测试；不运行UI或make run。工具只复用主仓锁定pnpm/依赖，临时自建链接结束移除。源码与测试不允许安装依赖或改冻结031。完成回报文件、命令/实际结果、未完成、风险、分支与完整SHA；提交推送核对远端/clean。管理者随后独立复核并备份、回收Agent和workspace两层。

模型profiles当前为空，经provider探测后使用OMP GLM-5.3/medium承担索引统计，Codex GPT-5.6-Sol/medium承担查找替换；默认速度。最多两执行任务，避免大量侧栏窗口。以上只是启动配置与授权范围，不是实现完成。

## 执行指针

Host均为 `srv_MEqRNkRW6fSx`，任务工作区均从固定36e6365创建，未启动UI。已调用create_agent并取得running回执，等待notifyOnFinish，不轮询或催促。

| 任务 | Agent | Workspace | 分支 | 模型 |
| --- | --- | --- | --- | --- |
| INK-M1-001 | 2ae7d24f-ea93-4ef3-9d0a-bf3402e4d013 | wks_d8f1f1a6cdbf1238 | task/INK-M1-001-document-analysis | OMP GLM-5.3 / medium / full |
| INK-M1-002 | 87c4178e-305e-4029-ab3b-1bc78da6accb | wks_ac09438964adb924 | task/INK-M1-002-source-search | Codex GPT-5.6-Sol / medium / default / full-access |

工作目录分别为 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-001-document-analysis` 和 `/Users/rayhu/.paseo/worktrees/2cfxxe4z/ink-m1-002-source-search`。二者只改各自四个新文件，不共享可写文件。模块当前状态均为执行中，尚无验收或合并结论；完成后备份与回收遵循既有流程。

## 首轮交付与独立退回

001交付 `cd9cbaf85a70ccc41e8cec2e25cb424504d0680a`，002交付 `db736a90e02f9943664a1ef59cf698a3736eb9dc`；均只新增各自4文件、本地与origin一致。两位完成Agent已立即归档。管理者对001实际重跑editor lint和完整146项通过；002执行者报告19专项/141全量与make lint通过，管理者未把该报告当独立验收。

管理者另建只读公共API反例，均实际退出1：

- 001：5/5红。排除完整emoji导致后续UTF-16标题范围错位；emoji之后的排除范围未完整屏蔽标题；无尾换行的闭合围栏把3个反引号计入内容（4而非1）；引用内围栏计入容器和定界符（6而非1）；已承诺支持的孤立CR被包含在标题end范围。
- 002：2/2红。search.source与调用方快照同对象，调用方原位改raw/revision后旧搜索的绑定值跟着变，替换过期校验误过；同revision异原文也误过。例：先搜a，再原对象更新a a，replaceAll仅给b a却报告成功。

冻结根反例与输出在 `/Users/rayhu/.paseo/workspace-archives/inkora-20261109-completed/root-m1-checks/`，文件 `document-analysis-review.test.ts`、`DOCUMENT-ANALYSIS-RED.txt`、`source-search-review.test.ts`、`SOURCE-SEARCH-RED.txt`。复制到各自editor/test临时运行后已清理文件和自建依赖链接；不能改根预期反哺实现。

在原两个workspace限定补正，无新workspace：001由Agent `15f15ff7-0dcc-4528-b37c-6138ca5453d0`（GLM-5.3/medium/full），002由 `0462a096-5d52-41bd-96bb-760482cde0b6`（GPT-5.6-Sol/low/default/full-access）。profiles再次为空、provider实际核实，notifyOnFinish=true，均取得running回执。保持原4文件范围、无UI、无新依赖、不合main；模块尚未验收。

与此同时用户已解锁并恢复031真人验收，UI锁仅由管理者持有；以上执行者禁止GUI。后台修正不替代M0真机门槛，不干扰正在等待用户的选区替换/取消操作。
