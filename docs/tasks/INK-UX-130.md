# INK-UX-130：原生授权目录与搜索

契约 A，基线 `bf8f7e5d45292223d7f26db209639384ba31728b`。只修改原生目录、侧栏 Bridge 与同域测试/证据；没有改 C/B 文件。

## 完成行为

- 授权根目录固定设备号/inode，目录刷新拒绝换根；descriptor 相对逐段 `openat`、`O_NOFOLLOW`、非阻塞普通文件校验，拒绝文件/祖先/根符号链接替换。
- 限制文件数、文件字节、总字节、深度、目录条目、扫描时间、搜索时间、查询长度与命中数。编码/尺寸跳过显式累计，搜索 `truncated` 包含未读取文件，取消/超时不返回部分成功。
- 文件名自然排序；支持大小写、整词、正则，平铺命中包含 fileID 供 Web 分组。正则 UTF-16 命中即使位于组合字符内部也保留，不因 Swift Character 边界丢失。
- SHA-256 精确绑定原始字节，包含 leading BOM、CRLF 与内部 BOM；每个命中有不透明 hitID、fileVersion、原文 utf16Location/utf16Length。Native 只接受本次成功搜索实际签发的 hitID，目录/查询改变立即失效。
- `openFile` 重验根/文件身份与 exact bytes，返回同一次 descriptor 读取的 data、version、location 和 fstat modified；读取前后 size/mtime/ctime 不一致拒绝。C 的生产回调必须消费 verified data 并建立保存基线，不能把 URL 当作再次读取授权。
- 新增可选 `openVerifiedFile` 回调保留旧 init 接缝。原 `openFile` URL 回调仅兼容旧卡片调用，不支持精确命中；生产安全导航依赖 C 接线。
- Bridge 验证 WK 主 frame、WebView 身份、scheme 与 host，验证 document/revision/context/catalog；异步 scan/search/navigation 各有代际，ready/换目录/刷新/销毁取消旧任务，迟到错误不能串入新上下文。侧栏错误仅发送局部 `error`，不进入编辑器保存错误通道。
- FolderAccess 持有作用域到后台读取完成；销毁取消计时器和任务。每 2 秒后台有界扫描探测嵌套成员和内容变化；变化发送带 catalogID 的 `invalidated`，B 收到后刷新。探测不重叠；等待刷新时停止重复失效通知。
- Context 可选 fileURL 只在 Native 映射 `SidebarFile.isCurrent`，Web 不收到任意原生路径读取接口。

## 实跑验证

- `tests/InkoraTests/SidebarHostless.sh`：14 项 XCTest 全绿（9 Catalog + 5 Bridge），编译真实两个生产 Swift 源码，无依赖安装、无 GUI/WebView 实例。临时 Swift Package 仅替代外部 scheme/maxSafeRevision 常量；不替代实现。测试 target 为 macOS 14，实际主机为当前 macOS，并非物理 macOS 14 验收。
- `xcrun swiftc -swift-version 6 -typecheck app/Sources/*.swift`：退出 0；存在基线 InkoraDocument actor/canClose 警告，详见证据。
- `xcrun swift-format lint --strict app/Sources/SidebarCatalog.swift app/Sources/SidebarWorkspaceBridge.swift tests/InkoraTests/SidebarCatalogTests.swift tests/InkoraTests/SidebarWorkspaceBridgeTests.swift`：退出 0。
- `git diff --check`：通过。

先红后绿：原始 BOM 搜索偏移实测少 1，保留断言后改为验证 UTF-8 再按原始码元解码；另在实际 emit 编译暴露 Swift 6 非隔离 deinit 不能触及 Timer，改成可跨线程取消的生命周期包装。没有绕过或删除测试。

证据：[完整专项](../evidence/INK-UX-130/hostless-green.txt)、[BOM 失败](../evidence/INK-UX-130/bom-offset-red.txt)、[应用源级检查](../evidence/INK-UX-130/app-typecheck.txt)。

## 边界与待集成

- 无 NSOpenPanel/NSAlert 展示、无真实 Sandbox 授权对话框、无 GUI/IME/XCU/App/Release/全量 Native/CI。Foundation lease 测试注入 start/stop，覆盖销毁中的扫描取消；真实沙盒授权由主会话统一验收。
- C 必须采用 `openVerifiedFile`、安全 modified 与 exact-byte 磁盘基线，原文坐标转换只扣文件首 BOM；B 必须采用 hitID 和 invalidated。已向双方发出接口提交并获得确认，组合后的导航/保存验收仍由主会话负责。
- 轮询开销上界是每轮 50 MiB/10 秒；大目录会显示不完整/跳过。目录更换或销毁取消轮询，变化后等待 Web 刷新。没有 FSEvents 常驻全盘读取。
- 工作树保留等待主会话验收、备份和两层回收；本分支不 PR、不 merge、不安装应用。
