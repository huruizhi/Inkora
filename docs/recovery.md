# 崩溃恢复草稿

INK-021 不启用 NSDocument 就地自动保存，草稿与源文件分离。存储位置为 App Sandbox 容器内 `Library/Application Support/Inkora/Recovery`。无网络请求，无新依赖。按 [Apple 的 security-scoped bookmark 说明](https://developer.apple.com/documentation/professional-video-applications/enabling-security-scoped-bookmark-and-url-access)，启用 app-scope bookmark entitlement；恢复草稿中的 bookmark 仅请求持久化读取权限，用于重启后的源指纹检查，保存仍走用户选择路径。

## 采集与保存

- editor 的已提交 dirty 状态触发 1 秒 debounce，连续编辑重新计时；内容未变化不重写。
- 后台调用 Bridge 的 revisioned snapshot，不切换 first responder、不结束 IME。Web runtime 在 composition 期间拒绝 snapshot；下一次 compositionend 的已提交状态重新调度；若组合取消且没有产生新 revision，也会延迟重试，以保存更早的已提交编辑。拒绝、超时和失效响应不写草稿。
- 保存/关闭/重新加载使后台请求的 epoch 失效；迟到结果不能复活已经清理的草稿。关闭后禁止调度新的恢复写入。
- JSON 草稿经现有 atomic writer 替换，包含 schema、UUID、editor revision、原始 UTF-8 字节和 SHA-256、源文件 URL/security-scoped bookmark、源文件修改时间/大小/SHA-256、BOM、换行样式、写入时间和 App 版本。
- 正文保留 BOM、逐行换行及 Unicode 字节，不经过 Markdown 重新序列化或归一化。换行元数据仅用于描述，正文 bytes 才是恢复依据。
- 草稿失败不触碰原文件、不确认 saved baseline，窗口副标题提示手动保存。

## 启动与恢复

启动后扫描本目录的草稿；截断、非法 JSON、版本不兼容、非法 UTF-8、非本地源 URL、正文哈希/BOM 不符的记录不会被加载，保留原始记录并提示损坏。源文件内容已等于草稿正文时不提示恢复，涵盖保存成功后尚未来得及清理就崩溃的窗口。

每份有效草稿提示「恢复 / 放弃草稿 / 另存为」。若源文件指纹变化、已删除或无法访问，明确使用 INK-020 的「文件已在应用外修改」冲突提示。默认策略始终恢复成新的未命名 dirty 副本；原文件即使未变化也不自动写回。用户保存必须通过 Save As 选择路径，系统负责覆盖确认。

恢复保留草稿 UUID 和 revision，使用新的 Bridge document ID、新编辑会话和空 history。编辑器初始化的 clean 状态不能清除原生的恢复 dirty 标记；首次成功保存后恢复正常 dirty 投影。Web Content 进程重启重放未保存 snapshot 时也保留 dirty 和磁盘草稿，避免同 revision 的初始化 clean 被当作已保存。恢复过程中源文件和草稿均保持原样；选择另存后取消面板仍保留 dirty 窗口和草稿。

## 清理与故障

成功保存（含 Save As）、Undo 回到 clean、明确放弃草稿、正常关闭，以及确认退出后清理。取消关闭或退出不清理。正常退出在全部文档审阅成功后执行清理。

先原子写入含 revision 和 payload hash 的 `.resolved` 凭据，再尝试删除 JSON。删除失败时，重启也不会再次提示这代草稿；后续新 revision 不受旧凭据影响。删除成功后尽力删除凭据。磁盘空间不足导致凭据写入失败时退回直接删除；两者同时失败会报告清理错误并保留原始草稿，不能伪称持久化清理成功。硬件持续拒绝所有写入/删除时无法保证落盘状态改变。

不提供版本历史，不自动合并草稿与源文件，不恢复崩溃前尚未完成的 IME 组合或最近一次 debounce/snapshot 后未持久化的编辑。真实 macOS 中文输入法仍需人工验收。

## 测试隔离

Hostless XCTest 默认禁用生产草稿目录，只使用注入的临时目录。XCUITest 和 Debug/Release 启动烟测传入 UUID session，使用 `Recovery/UITests/<UUID>` 子目录，扫描不会进入用户根目录。Debug 异常退出注入仅在该隔离 session 中、真实 snapshot 原子落盘后生效。它不调用正常关闭/退出清理。
