# INK-PROT-027 连续空格输入缺口

Status: deterministic red regression; genuine WK ordinary-input rejection observed

基线ea63941a6ca320c5aa888eb18263c870fb361846。管理者在修复后真实WK输入普通X再按Space，revision/past/source保持不变且保存因重解析doc.eq失败被阻断；这不是系统IME验收。026修复的直接Undo/Redo与pending保存恢复均通过，但普通空格输入本身仍被拒绝。

随后用当前真实HTML/EditorView/dispatch，先通过真实TextSelection把光标放到默认样稿末段，再按原生事务依次插入alpha、空格、beta。实际source末段为alphabeta，期望alpha beta；空格被拒后下一合法输入清诊断但分隔空格已经丢失。命令 node editor/prototypes/fidelity/trailing-whitespace-check.mjs，实际exit1，断言continuous typing lost the separating space。TRAILING-WHITESPACE-RED.txt冻结这次有效红输出。准备脚本初稿没有先移动选区，已在捕获前纠正并断言光标为tail+5；冻结输出来自纠正后的真实输入路径，不拿错误光标的失败当通过证据。

目标是普通连续写作能逐字输入单/多空格、继续下一词、撤销重做和源码往返，原始字节精确；不是把正常空格当不可支持语法。必须区分源语法空白/可视投影与正在编辑的尾随空白，保留EOL/BOM、双空格hardbreak/反斜线换行、代码空白/保护块及选区历史；不能删空格、把它当no-op、整篇源码化或削弱重解析/等价检查。安全保存资格要由可审计状态决定。

本次不是再扩大渲染功能：英文技术文档最基本的word+space+word在既有原型实际失败，属于已授权核心写作闭环。若现内核状态模型无法清楚表达这条合法输入，报告设计阻力并按路线比较原文主数据投影方案，不堆叠不可审计特例或宣告M0通过。
