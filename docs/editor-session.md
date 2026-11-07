# 编辑会话、历史与粘贴语义

`InkoraEditorSession` 是 ProseMirror `EditorState` 的状态边界，负责组合现有 schema、输入规则、快捷键、history 与粘贴插件。原生菜单和 NSDocument 只消费它的状态，不自行推断编辑器历史。

`onStateChange` 同时报告文档 revision 和保存状态变化；selection-only transaction 不发布事件。

## 保存点与历史

- `dirty` 始终通过 `currentDoc.eq(savedDoc)` 计算，不依赖递增计数；
- `markSaved()` 保存当前文档引用，并使用 `closeHistory` 切断前后编辑分组；
- `canUndo` / `canRedo` 来自 ProseMirror history 的真实深度；
- Undo 精确回到保存文档时，`dirty` 自动恢复为 `false`；Redo 后重新计算，不缓存旧值。

## 中文输入法组合

组合期间的 transaction 会正常应用到 `EditorState`，因此光标和候选文本始终以 ProseMirror 为准；会话层暂缓对外发布文档变化。在 `compositionend` 后，仅当最终文档与组合前不同，发布一次逻辑 revision。重复的结束事件和最终无变化的组合不会产生重复通知。

真实 macOS 验收时需检查：

1. 使用系统简体拼音连续输入“中文输入法”；
2. 选词、翻页、回删候选，确认候选窗不消失且光标不跳动；
3. 结束组合后只出现一次文档变化上报；
4. 一次 Undo 撤销整次组合，一次 Redo 恢复；
5. 在粗体、列表、链接边界重复以上操作。

自动化只能验证组合 transaction 的聚合和历史边界，不能替代真实输入法验收。

## 粘贴

- `text/plain`：按换行生成合法段落；代码块中保留为纯文本；
- `text/markdown`：通过 Inkora Markdown codec 解析；
- `text/html`：在 inert document 中解析，只保留 schema 支持的节点和 marks；
- 所有 paste transaction 在 dispatch 前执行 `doc.check()`，非法结构不会进入会话。

插件按 Markdown、HTML、纯文本的顺序选择剪贴板格式。未知 HTML 标签只保留可表达的文本内容，脚本内容不会进入文档。

## 原生 dirty 投影与关闭

原生不按 revision 累加第二套历史：clean → dirty 对应一次 `updateChangeCount(.changeDone)`，dirty → clean 对应 `.changeCleared`。同 revision 的 `markSaved` 状态也必须处理。窗口 edited 标记由 NSDocument 同步。

关闭与退出在检查 dirty 前先提交原生输入法组合，并通过 snapshot 屏障等待最终状态；组合未结束则拒绝保存/关闭，不读取中间态。
