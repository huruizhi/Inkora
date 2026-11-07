# 文件状态与冲突选择

INK-020 在 NSDocument 的 FIFO revisioned snapshot 保存流水线内校验磁盘状态；不启用自动覆盖或三方合并。

| 状态 | 检测 | 用户选择与转换 |
| --- | --- | --- |
| 正常 | 最近读入/成功提交的原始字节和修改时间一致 | Save → snapshot → coordinated safe save → atomic writer → markSaved |
| 只读 | 文件及父目录权限、immutable 锁定标志、只读卷、实际可写能力；检查失败也禁止写回 | 窗口副标题标示只读；Save 提示另存为或取消。权限恢复后可正常保存 |
| 外部修改 | NSFilePresenter 回调及保存前比较完整字节与修改时间，时间戳不变也能识别改写 | 无本地编辑也明确询问重新加载、另存当前内容、取消；有本地编辑时明确说明冲突与丢弃后果 |
| 移动/重命名 | presentedItemDidMove | 跟随 fileURL，系统更新标题，副标题说明已移动；保留编辑、history 和 dirty。移动期间已排队的旧路径保存失败，可在新路径重试 |
| 删除/废纸篓 | deletion 回调、路径不存在或移入 .Trash/.Trashes | 保留编辑器，强制保留 dirty，副标题提示删除；禁止重建原路径，只能另存或取消 |

取消不接受新的磁盘基线，再次 Save 仍会询问。保留编辑直接进入 Save As，不提供冲突后的一键覆盖；选择新路径仍由系统处理覆盖确认。另存回冲突原路径也会被状态检查拒绝。

重新加载先结束 IME 并等待 snapshot，再经原有 UTF-8/BOM 解码。成功后更换 Bridge document ID、revision 归零并调用 loadDocument，以新内容重建编辑器会话、history 和 saved baseline。旧会话的迟到状态因 ID 不符被忽略。取消、只读提示和移动不重建编辑器，不改变光标、选区和撤销历史。

保存在 snapshot 返回后再次校验，并在 NSDocument coordinated safe-save 调用 writer 时复核原路径。权限/磁盘/snapshot/冲突失败均不 markSaved，保留已有 dirty。只在成功文件的字节等于提交内容时更新磁盘基线，避免把提交后立即发生的外部修改误认为自身保存。

边界：文件协调依赖其他程序遵循 NSFileCoordinator；不配合协调的进程在最后检查与原子替换之间强行写入仍存在系统级竞态。未引入持续轮询；外部程序绕过 presenter 的改动最迟在下次保存检测。真实中文输入法、只读卷挂载和 Finder 废纸篓交互仍需人工验收。
