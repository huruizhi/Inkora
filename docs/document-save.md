# Markdown 文档保存

Inkora 使用 AppKit 标准 `NSDocument` 保存入口。File 菜单的 Save（`Cmd+S`）与 Save As（`Cmd+Shift+S`）分别调用当前文档的 `save` 与 `saveAs`，覆盖确认、路径选择和取消由系统面板处理。

## 保存流水线

1. 保存请求进入文档级 FIFO 队列；
2. 通过 Bridge Save Barrier 取得不可变的 revisioned Markdown snapshot；
3. `NSDocument` 执行 safe save，底层 writer 使用原子替换；
4. 成功后发送 `markSaved`，将实际落盘 snapshot 设置为编辑器 saved baseline；
5. 完成当前请求后再处理下一次保存。

任何 snapshot、权限或磁盘错误都会终止本次保存，不会确认 saved baseline。失败前存在的文件保持完整，文档仍为 edited，用户可以修复问题后重试或 Save As 到其他位置。

## 验证边界

自动化测试覆盖正常保存、覆盖、Save As 后续保存、取消、权限失败、磁盘空间失败和连续保存。AppKit 系统面板本身不复制实现；Inkora 测试它的调用前后不变量，并验证 File 菜单暴露标准保存命令。
