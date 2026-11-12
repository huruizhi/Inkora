# 代码语言与行号

用户“继续推进”，按既有审计顺序进入代码块批次，基线1d07702，分支task/INK-UX-186-code-language-tools。[正式规格](../design/typora-code-tools.md)。复用锁定依赖的自建软链，不安装新依赖。

按公共highlighter→真实runtime语言选择→行号显示的垂直切片实施，保留red/green。测试接缝沿用审计和既有代码块测试，不新增测试专用产品入口。尚未运行的Native/CI/物理验收不能宣称完成。

## 完成内容与文件

- `code-highlighting.ts`使用锁定包193项注册语法及别名，保留原13样例与全部颜色/偏移断言，新增Java/C++/VB.NET/VHDL/Kotlin代表。实际语言清单见[覆盖表](../evidence/INK-UX-186/languages.json)。不自动猜语言；Velocity不在锁定库内，不冒称支持。
- `code-language-picker.ts`提供中文combobox/listbox、前缀/别名/名称过滤、精确别名优先、键盘/鼠标/取消及生命周期/状态/query lease守卫；保留原生select及Mermaid选项。
- `code-view-preferences.ts`与NodeView行号：同窗口同步及可用时本地持久化，无storage时内存回退；显示切换不改原文或历史，不重建正文code。gutter在contentDOM外，代码独立横滚，Mermaid读/编样式同步调整。
- `editor-runtime.ts`按owner跟踪辅助查询composition和焦点；正文session不写查询。100ms静默收口前保持Native命令/快照屏障，尾input重置计时；main阻断query焦点下文档Undo。新增公共runtime/DOM与main回归，新增Native/WK专项/脚本。

## 实际验证

- `make lint test-editor test-ci`最终退出0，55文件 **1015项通过**；生产Web构建成功（含tsc），仅既有chunk提示。既有Bridge独立16项由最终精确HEAD CI再执行，不冒称已本轮单独运行。
- `tests/InkoraTests/CodeToolsHostless.sh`最终 **3/3通过**：实际Native语言确认、UndoRedo、保存精确BOM/CRLF字节、新InkoraDocument.read重开；900/360实际viewport、行号/首行文本垂直对齐、局部横滚、候选真实命中及code DOM身份；query组合期间Native sourceMode拒绝，结束稳定后正常取消；通过既有公开“显示图表”按钮真实绘制Mermaid并核对读/编样式。窗口始终不可见、未运行AppDelegate。
- 参数/语言注册/补全/行号及两个审查反例真实red均保留；首个Native测试误把文件BOM metadata也作为Bridge decoded text比较，和未点击隐藏WK的显式Mermaid惰性入口，属于本人夹具错误。原red保留，改为decoded快照+完整磁盘字节及新文档重开，不把夹具问题称产品修复。
- 冻结9d9dca5双轴发现Standards1项P1、Spec旧候选P2与重开验证P2；e8e9760限定补正并独立复验闭合。报告原文与追加分开，见[Standards](../reviews/INK-REV-187-code-tools-standards.md)和[Spec](../reviews/INK-REV-188-code-tools-spec.md)。
- 本轮没有删除有效回归。原“13个已打包语言”的样例循环改成显式13样例迭代，保留每个样例断言；registry另精确assert193和唯一性及新增代表，不以193注册数假称193语法全人工测试。

## 风险、未验与交付

所有JavaScript打包量相对上一批增加约0.85MB（gzip约0.28MB），见[bundles](../evidence/INK-UX-186/bundles.json)；没有新增依赖、自动猜语言或运行时联网。未单独测启动预算，不能用专项时长代替性能预算。完整Native/离线Release与默认轻量性能CI由根对精确HEAD结算。

物理IME/VoiceOver/可见paint/macOS14实机未验，不把JSDOM/隐藏WK合成事件当物理结果。193项是锁定库注册清单，除代表样例外未做每个语法的完整一致性测试。原表格物理验收仍待验。未修改Native生产代码、Bridge协议、App版本、安装或公开Release。

产品固定e8e9760，分支task/INK-UX-186-code-language-tools。所有终端输出以JSON字符串无损保存，SHA256核对；ignored原日志与临时探针保留。自建依赖软链最终仅unlink，不动共享依赖。审查worktree与产物保留待双层备份。
