# 保真路线基线刷新：保护块、预览与原文序列化

研究日期：2026-11-08。比较旧产品基线 `3bc978e68ba63f48d4e743481be0fe5316ae17eb` 与新产品基线 `57aeaac18e41c7191b1be851b284aae8c1b1bbae`。本分支从新基线建立，仅提交本文；结论不依赖后续主干变化。本文只刷新新增实现对保真路线的影响，不重新选择内核或设计完整架构。

输入为旧研究 `INK-PLAN-001-R2/.scratch/typora-parity/research/02-fidelity-feasibility.md` 与已解决的范围票 `INK-PLAN-003/.scratch/typora-parity/issues/03-first-milestone.md`。后者明确：高级语法不能导致整篇自动退出可视编辑；稳定边界可显示受保护原文片段；边界含混时标明问题、保留当前视图和原文、阻止不安全结构化保存，由用户主动进入源码修复。旧研究中“未知边界整篇自动回退”不再是可接受目标体验。

## 增量结论

**保护块已从候选变成可复用实现，但局部字节保真仍未完成。** 相比旧基线，优先验证“现有 PM + 保护块 + 原文范围/最小补丁”的增量路线更有现实基础；是否采用仍须经过范围、空白和历史原型验证，不能以新增节点、预览或现有测试通过替代路线门。

| 新增事实与固定证据 | 可以复用 | 不代表什么 |
| --- | --- | --- |
| [保护解析器](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/protected-markdown.ts#L11-L48)识别文首 metadata、顶层 GFM 表格、含 Wiki link 的顶层段落/标题/列表/引用；其余 gap/tail 再过安全检测 | 识别稳定边界、抽取块原文、混排普通正文的起点 | 尚未普遍覆盖公式、脚注；Mermaid 仍沿用普通围栏代码。不存在任意高级语法均可混排的保证 |
| [schema](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/schema.ts#L217-L229)新增 atom/isolating 节点，保存 raw/kind，并通过 DOM 属性往返 | 不透明原文载体及同一 PM 文档内的整块选择/删除/撤销基础 | 表格单元格或 Wiki 所在块内部可编辑；节点也不是不能被删除的只读文档 |
| [preview](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/protected-preview.ts#L5-L33)禁用块内编辑，metadata 显示原文，表格/Wiki 用关闭输入 HTML 的 markdown-it 渲染 | 将展示与保存来源分离，不从预览 DOM 反推 Markdown | 通用渲染器、完整高级语法体验或真实 WKWebView/IME 验收 |
| [serializer](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/markdown-codec.ts#L179-L188)直接写 raw，然后 closeBlock；[runtime](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/editor-runtime.ts#L72-L82)在 clean 时返回 savedText、dirty 时仍整篇序列化 | 保护节点内部原文回写和未编辑快照捷径 | 局部补丁 serializer 或全文所有未修改字节均保持不变 |

旧基线 [codec](https://github.com/huruizhi/Inkora/blob/3bc978e68ba63f48d4e743481be0fe5316ae17eb/editor/src/markdown-codec.ts)、[runtime](https://github.com/huruizhi/Inkora/blob/3bc978e68ba63f48d4e743481be0fe5316ae17eb/editor/src/editor-runtime.ts)没有上述保护路径。因此旧研究“没有不透明节点”的事实需要更新，而“dirty 时整篇输出、缺完整原文映射”的结论继续成立。

## 范围、词法与历史缺口

以下是从固定源码得到的边界判断；没有额外运行反例，不将风险推断写成已复现缺陷。

- **范围不是完整 source map。** 解析器的 start/end 只在本次解析过程中用于切取保护块，未进入节点 attrs，也未形成覆盖普通正文、空白、定界符与引用定义的持久账本；没有与 PM 位置及 transaction 对应的补丁生成机制。行偏移基于 JS 字符串与规范化输入，不能当作原文件 UTF-8 字节映射。新增实现没有消除中文、emoji、CRLF 等坐标转换验证需求。[范围抽取](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/protected-markdown.ts#L13-L46)
- **保护块内 raw 与块外空白是两件事。** token 片段会去掉末尾一个 LF；纯空白 gap/tail 经 trim 判断后不生成节点，正文 gap 交普通 parser。块间分隔由 serializer 重新生成。因此保护块内部可原样不等于其前后空行、正文空白也保真。仓库新 [codec 文档](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/docs/markdown-codec.md#L37-L47)已明确不承诺块间空行源范围保真。
- **词法保存仍局部。** 普通 parser 保留部分列表/标题/围栏风格，但未增加完整原文拼写、强调定界符、引用定义关系与 trivia 账本；dirty 时普通正文继续经过原 serializer。因而单块 raw 缓存不能直接满足块内编辑及所有无关范围的 FID-002。[普通 codec](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/markdown-codec.ts#L72-L137)
- **准入与保存体验仍有差距。** runtime 对 CRLF 做整篇往返相等检查，LF 没有相同准入检查；保护解析失败或残留风险仍最终创建源码 runtime。混合换行与 bare CR 也沿用既有处理。这些是当前实现事实，不能作为已满足“含混边界保留视图并阻止保存”的证据；需要另外验证保存闸门、可信原文与主动源码入口。[runtime 准入](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/editor-runtime.ts#L231-L268)
- **当前 history 只证明同一结构化会话的场景。** 保护节点可以参与 PM history，新测试覆盖正文编辑、Undo/Redo、markSaved 后 dirty；但接口未增加同文档源码切换、双向 selection 映射或原文缓冲与 PM steps 联合历史。原 session 仍以 doc.eq 判断 dirty，源码仅改格式而语义相同时的 baseline 仍须验证。[runtime 接口](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/editor-runtime.ts#L15-L24)、[session](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/editor-session.ts#L101-L135)

## 本次实际检查

在新基线 worktree 运行：

```sh
make lint test-editor PNPM=/Users/rayhu/Documents/projects/Inkora/.tools/node_modules/.bin/pnpm
```

结果：退出码 0；swift-format lint、TypeScript 检查、Vite 编辑器构建通过；排除 `src/bridge.test.ts` 的 Vitest 共 **9 个测试文件、111 项测试全部通过**。原始本地日志：`artifacts/logs/editor.log`。仅临时链接本 worktree 的 `editor/node_modules` 到主仓库已有依赖，运行后移除该链接；未运行 setup、未安装依赖、未修改测试或产品文件。

本次执行包含 [新增 runtime 用例](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/editor-runtime.test.ts#L44-L73)：LF/CRLF metadata + 表格 + Wiki 与正文混排、DOM raw 往返、特定正文编辑与历史；以及 [保护解析器用例](https://github.com/huruizhi/Inkora/blob/57aeaac18e41c7191b1be851b284aae8c1b1bbae/editor/src/protected-markdown.test.ts)，包括残留风险拒绝、围栏示例不误认和 metadata 特殊字符。通过结果只支持这些输入与操作。原生、Bridge 专项、UI、真实系统中文输入法、完整跨模式历史以及全域空白/范围验证均**未执行**；新增原生测试的存在不计为本票验收结果。

## 对下一步验证的影响

建议先复用已有保护载体和 preview，验证新增原文范围/最小补丁能否满足同一份混排文档的未编辑字节约束；先覆盖保护块前后非规范空白、普通正文行内编辑和 split/join、mark/attrs 修改、Undo/Redo 与主动源码往返。须同时验证含混边界时“视图保留 + 保存阻断 + 主动修复”，不能靠扩大自动源码回退通过。

若范围或历史原型失败，再比较原文权威投影路线；本刷新既未证明该路线必须替换现内核，也未证明增量路线已经可交付。表格直接编辑、任务单字符切换、本地资源生命周期及公式/脚注保护范围仍有各自的实现与验收工作，不因本次保护预览通过而完成。
