# 编辑会话、历史与粘贴语义

`InkoraEditorSession` 是 ProseMirror `EditorState` 的状态边界，负责组合现有 schema、输入规则、快捷键、history 与粘贴插件。原生菜单和 NSDocument 只消费它的状态，不自行推断编辑器历史。

`onStateChange` 同时报告文档 revision 和保存状态变化；selection-only transaction 不发布事件。

## 保存点与历史

- `dirty` 始终通过 `currentDoc.eq(savedDoc)` 计算，不依赖递增计数；
- `markSaved()` 保存当前文档引用，并使用 `closeHistory` 切断前后编辑分组；
- `canUndo` / `canRedo` 来自 ProseMirror history 的真实深度；
- Undo 精确回到保存文档时，`dirty` 自动恢复为 `false`；Redo 后重新计算，不缓存旧值。

## 图片 owner proof

图片 owner 只来自当前 accepted `EditorState.doc`，不得由 Native 对 Markdown 再做语法扫描。会话在一个同步读点返回 `{ raw: currentRaw, imageURIs }`：`raw` 是对应投影的唯一原文，URI 按图片节点的文档顺序收集并保留重复使用。proof 再由 Bridge 与当前 `(documentID, revision)` 绑定；代码、数学、普通链接或保护块中的相同字串不取得 owner。

源码草稿未提交、composition 未稳定、projection 无法证明或 proof 的 raw 与 snapshot 不一致时，资源流程必须拒绝或重试，不能把未知解释为空数组。bare-CR 只读 runtime 用同一生产 canonical parser 解析规范化 LF 的语义副本，但 proof 的 `raw` 与 snapshot 仍保留原始 CR 字节对应字符串。

## 中文输入法组合

组合期间的 transaction 会正常应用到 `EditorState`，因此光标和候选文本始终以 ProseMirror 为准；会话层暂缓对外发布文档变化。DOM `compositionend` 只表示 UI 候选会话结束，不等于最终 PM transaction 已排空。生产 runtime 进入 `settling`，继续接受同一 `composition` meta 的 post-end final，并以每次已接受事务重置 24ms quiet window；quiet window 到达且公开 `EditorView.composing` 为 false 后，才同时封口原文、投影、selection、history、逻辑 revision 与唯一文档发布。

该窗口依据锁定的 `prosemirror-view@1.42.9` 在 `compositionend` 后的 microtask DOM observer flush 与 20ms composition cleanup，并保留余量；不读取或强刷私有 `domObserver`。等待稳定的调用方最多等待 120ms，超时明确得到可重试拒绝，当前原文、投影和历史保持不变；quiet window 后仍会自动恢复保存资格。重复结束事件、最终无变化的组合和取消不会产生 revision 或清空既有 future；新 composition、不同 meta 或下一普通事务是显式封口边界。

真实 macOS 验收时需检查：

1. 使用系统简体拼音连续输入“中文输入法”；
2. 选词、翻页、回删候选，确认候选窗不消失且光标不跳动；
3. 稳定边界后只出现一次文档变化上报，正文是最终上屏值而非中间拼音；
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
