# 行内格式行为

## Marks 与选择区

| 操作 | 空选区 | 非空或跨段落选区 |
| --- | --- | --- |
| 粗体、斜体、删除线、行内代码 | 切换 stored mark，影响随后输入 | 对所有可应用的行内文本切换 mark |
| 设置链接 | 保存 `href` / `title` stored mark，不改写已有文本 | 先移除选区内旧链接，再应用新链接 |
| 移除链接 | 只清除 stored link | 移除选区内链接 |

行内代码使用排他 mark，不能与其他格式叠加。链接允许相对路径、片段和绝对 URL；空 `href` 与非字符串 `title` 在 JSON 加载时被拒绝。

## 快捷键

- `Cmd+B`：粗体；
- `Cmd+I`：斜体；
- `Cmd+Shift+X`：删除线；
- `Cmd+E`：行内代码；
- `Cmd+K`：通过宿主注入的链接获取回调设置链接；取消回调不会修改文档；
- `Cmd+Shift+K`：移除链接；
- `Backspace`：最近一次输入规则转换存在时先撤销该转换，否则交回默认删除行为。

## 输入与粘贴

输入规则支持 `**strong**`、`__strong__`、`*em*`、`_em_`、`~~strike~~`、`` `code` `` 与 `[label](href "title")`。规则不在 code mark 内触发；ProseMirror input-rules 插件在 composition 期间返回 `false`，composition 结束后才重新检查，避免中文输入产生重复 transaction。

富文本粘贴通过 schema DOM 规则识别 `<strong>/<b>`、`<em>/<i>`、`<del>/<s>/<strike>`、`<code>` 与 `<a href>`。未知行内容器只保留文本，不产生非法 mark。Markdown parser、完整 clipboard 策略与全局 history 分别由 Issue #9 和 #11 完成。
