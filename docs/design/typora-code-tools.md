# 代码语言补全与行号

范围为审计后续首批 TP-CODE-02/03/04，基线main@1d07702。TP-CODE-01既有围栏输入和保真规则继续有效。本批不并入公式、Emoji或其他路线；不替换本机安装。

## 实施路径

1. 使用已锁定highlight.js11.12.0的193项内置注册语法（含plaintext），替换13项静态子集；不新增依赖。不启用自动猜语言。导出实际覆盖表和别名，保留未知语言原值与纯文本回退；193不表示每个语言所有语法均经过人工验收。
2. 保留已有中文语言select与未知/别名保持项，新增搜索combobox。前缀、别名和名称可过滤，方向键/Enter确认，Esc关闭并返回编辑位置，点击亦可选。输入查询不修改正文，只有确认改首info token，保留其他选项和空白，Undo/Redo一次。列表最多呈现30项且可滚动；空查询显示首批，完整select仍可访问全部。已打开动作绑定当前EditorState及节点生命周期，过期/销毁/不允许编辑/正文composition或settling时拒绝。
3. 代码工具“行号”作为本机显示偏好，默认关闭；同一Web会话代码块同步，localStorage可用时持久化，不可用则仅内存。无源码标记/dirty/revision/历史变化，不恢复代码节点、光标或选区。行号在contentDOM以外，aria-hidden/user-select:none，代码正文仍由PM拥有。空代码1行，尾换行保留末空行；LF/CRLF都正确计数。横向滚动仅代码区域，行号留在左侧。Mermaid阅读预览不显示代码行号，进入代码编辑时显示。

语言查询本身的组合输入是本地UI输入，不冒充正文composition；期间不确认/取消/重建该输入。完成后的候选确认Enter与紧随compositionend的同一次Enter区分，避免误选。所有动作检查连接和存活资格。

## 验证接缝与边界

沿用用户审计已指定的真实runtime/EditorView/正式代码语言命令，以及既有highlighter公共接口：覆盖清单/代表语法、raw/BOM/CRLF/围栏选项、正反向选区与历史、过期动作和composition。真实隐藏WK核对900/360px语言列表与行号滚动几何及Native快照保存重开；不等同物理IME、VoiceOver或可见paint。

官网v示例曾含Velocity；锁定库实际不含Velocity，本批不虚构该语法支持。v类实际包含VB.NET/vb、VBScript、Verilog、VHDL、Vala、Vim等，选择器按已打包覆盖提供。后续可单独评估Velocity语法。

参考：[官网代码块](https://typora.io/#function)、[highlight.js公共接口](https://highlightjs.readthedocs.io/en/latest/api.html)。实际版本/语言表以本机锁定依赖核对为准，在线API文档标识11.9不能冒称11.12完整验收。
