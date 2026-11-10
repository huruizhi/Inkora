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

先红后绿：原始 BOM 搜索偏移实测少 1，保留断言后改为验证 UTF-8 再按原始码元解码；另在实际 emit 编译暴露 Swift 6 非隔离 deinit 不能触及 Timer，初版通过包装消除了编译错误，但仍有后台直接 invalidate 的 SDK 约束缺陷；已按下述补正修复。没有绕过或删除测试。

证据：[完整专项](../evidence/INK-UX-130/hostless-green.txt)、[BOM 失败](../evidence/INK-UX-130/bom-offset-red.txt)、[应用源级检查](../evidence/INK-UX-130/app-typecheck.txt)。

## 边界与待集成

- 无 NSOpenPanel/NSAlert 展示、无真实 Sandbox 授权对话框、无 GUI/IME/XCU/App/Release/全量 Native/CI。Foundation lease 测试注入 start/stop，覆盖销毁中的扫描取消；真实沙盒授权由主会话统一验收。
- C 必须采用 `openVerifiedFile`、安全 modified 与 exact-byte 磁盘基线，原文坐标转换只扣文件首 BOM；B 必须采用 hitID 和 invalidated。已向双方发出接口提交并获得确认，组合后的导航/保存验收仍由主会话负责。
- 轮询开销上界是每轮 50 MiB/10 秒；大目录会显示不完整/跳过。目录更换或销毁取消轮询，变化后等待 Web 刷新。没有 FSEvents 常驻全盘读取。
- 工作树保留等待主会话验收、备份和两层回收；本分支不 PR、不 merge、不安装应用。


## 管理者审查补正：Timer 安装线程

管理者指出 Foundation Timer 必须在安装线程调用 invalidate，初版 WatchTimer 的线程安全注释和后台直接调用不成立，依据 [Apple Timer.invalidate 文档](https://developer.apple.com/documentation/foundation/timer/invalidate())。

本轮将 Timer 放在仅主 actor 可访问的 Registration 内；安装处及真正 invalidate 处均要求主线程。Sendable WatchTimer 的后台 invalidate/deinit 将不可变 Registration 引用交给 DispatchQueue.main，闭包不捕获正在析构的 WatchTimer/Bridge。主线程取消同步执行；注册对象内部去重，使显式取消加 deinit 只实际取消一次。移除了生产 wrapper 的 unchecked Sendable 声明。

新增 `testTimerReleasedOffMainInvalidatesOnInstallationThread`：真实 RunLoop Timer 在主线程安装，后台 Task 显式取消并释放最后 owner；核验后台执行、owner 真正销毁、实际取消回调在主线程、Timer.isValid 为 false、重复取消仅一次。等待有上限，无 GUI/WebView 实例或 App 启动。

实跑 `tests/InkoraTests/SidebarHostless.sh`：15/15 通过（9 Catalog + 6 Bridge）；`xcrun swift-format lint --strict app/Sources/SidebarWorkspaceBridge.swift tests/InkoraTests/SidebarWorkspaceBridgeTests.swift` 与 `git diff --check` 均通过。未跑全量 Native、GUI、Release 或 CI。证据：[安装线程专项](../evidence/INK-UX-130/timer-installation-thread-green.txt)。

## REV-134 补正：目录完成与转交前重新验证

固定组合参考 `140438ce321776ee3d4641f4cc4c700dc6b81488` 的两个 A 源文件与本分支补正前一致；仅阅读 REV-134 报告和组合 C 接线，未吸收/编辑 C/B 产品代码。

通过公共 `receive/current/replySink` 重现真实问题：ready 后同一 MainActor turn 将 revision 0→1，scan 只留下 ready；search 后同样递增 revision，收不到 search。新回归在修改生产前有 4 个失败断言，见 [red](../evidence/INK-UX-130/typing-completion-red.txt)，保留原断言并修复后通过。

目录 scan/search 的异步完成现在按 document/context 与各自 request 代际（search 另按 catalog）校验，不再比较正文 revision；目录选择返回同样不依赖正文 revision。入口接受不高于当前 revision 的目录请求，未来 revision 仍拒绝；open 分支继续要求即时 revision 完全一致，mayOpen 后仍比较完整绑定。保留跨 doc、ready/load context、catalog、查询和导航的拒绝边界。恢复后的 scan 会安装 watcher，普通 typing 后无需手工补救；回归还验证 queued 旧 revision 的刷新可完成。

给 C 的最小受限接口为 `@MainActor OpenedFile.revalidatedForNavigation() throws -> OpenedFile`：

- Catalog.openFile 签发 closure 只重开该 catalog/file/hit 的 descriptor-rooted capability，重验 root、inode、exact-byte SHA 与命中位置；返回同一次新读取的 data/modified。删除、替换、符号链接、原 mtime 被恢复的内容修改均拒绝。
- Bridge 在签发对象外包 document/context/catalog/navigation generation/original revision/access identity 校验；closure 持有 lease，弱持 Bridge。重新验证所得 fresh 对象仍带相同导航校验，经过后续 await 不能退化为长久可信 bytes。
- C 必须在 review 返回后、目标 snapshot 等异步阶段返回后、真正转交前调用，并消费 fresh 数据。仅手工构造的 OpenedFile 默认无验证 capability，方法保守拒绝；不能自行按 URL 重读代替。

实跑验证：

- `tests/InkoraTests/SidebarHostless.sh`：21/21 通过（10 Catalog + 11 Bridge）。新增同文 typing scan/watch、typing search、跨 doc scan/search、导航票据和 descriptor 重验回归；既有旧 context/search/open 回包测试保留。无 GUI/App/WebView 实例、面板或依赖安装。
- `xcrun swiftc -swift-version 6 -typecheck app/Sources/*.swift`：退出 0，既有 Document 警告见 [typecheck](../evidence/INK-UX-130/ticket-app-typecheck.txt)。这是本分支源级验证，不冒称组合 C 的构建。
- 四个 A Swift 文件的 `xcrun swift-format lint --strict` 与 `git diff --check`：通过。

[最终专项证据](../evidence/INK-UX-130/typing-ticket-green.txt)。仍由 C 接口接线、根会话组合后验收关闭等待中的目标外改/导航失效；本任务不启动窗口、不跑全量 Native/Release/CI。工作树保留。

## 正式取消意图：跨进程目标请求撤销

有限复核先在固定组合 `8e64424f2fd8b0c54faf449b418551d1761a8551` 的真实 SidebarConnection 捕获 transport，再将实际序列化 open 送生产 Native receive，延后 mayOpen。真实 Web 返回列表 cancelSearch 不发消息（2→2），Native 后续 mayOpen(true) 仍打开一次，且已发票据仍可重验；真实新 search 消息作为控制则会撤销旧票据。证据：[原缺口](../evidence/INK-UX-130/cancel-boundary-red.txt)。红 probe 源：[Swift](../evidence/INK-UX-130/CancelBoundaryProbe.swift)、[Web](../evidence/INK-UX-130/cancel-probe-web.cjs)。这些是反例成立，不是通过声明。

根授权后与 B 明确契约：`action=cancelSearch` 使用既有 requestID/documentID/revision/contextID/catalogID，加 targetSearchRequestID?/targetOpenRequestID?，至少一个非空且至多200 UTF-8字节目标。Native 保留当前 search 请求身份（完成后仍绑定 hit capabilities）及 open 身份。仅分别匹配当前目标时取消对应任务/代际并清旧 hits，目录 catalog/watch 不变。旧目标回 no-op，不撤销新请求；跨 context/catalog 忽略。成功/no-op 回 `kind=cancelled` 及 cancelledSearch/cancelledOpen 布尔，仅作 receipt，不改变正文或保存协议。open 仍即时 revision 相等，取消沿目录 UI 的 revision 规则。

新增公共 receive/延后 mayOpen 回归：cancel 后回调 true 不执行打开；已发票据取消后重验拒绝；旧取消不影响新 open/search；跨 context/catalog 不影响当前；已完成 search 取消后 hit 重放拒绝；watcher 仍可探测变化。实跑 `tests/InkoraTests/SidebarHostless.sh` 22/22 绿（10 Catalog+12 Bridge），[日志](../evidence/INK-UX-130/cancel-hostless-green.txt)。受影响两个 Swift 的 strict-format 与 git diff --check 通过，没有重跑全量检查。

跨层 green 使用 B 固定 `17995615637d1c6dd90c5cd77db9fcee50ef86c7` 的真实 Connection（只读提取进自身 build，无 cherry-pick B 产品代码），与本分支 Native 源码连接：真实 Native 完成 search 后，把真实 result 回送 Connection，再实际执行 open、取消。两种模式分别停在 Native mayOpen 等待、已签发票据等待，随后真实 Web 发取消，Native 两项 receipt 均 true；打开次数为0/票据重验拒绝，旧 hit 重放拒绝。[green日志](../evidence/INK-UX-130/cancel-cross-layer-green.txt)、[Swift源](../evidence/INK-UX-130/CancelBoundaryGreenProbe.swift)、[Web源](../evidence/INK-UX-130/cancel-probe-green-web.cjs)。未展示 review 系统面板；C 仍需验收实际关闭协调器中的取消结果。

精确复跑（目录仅限本工作树 build；红版本用固定8e的Connection、红两份源；green用上述B固定SHA和green源）：

```sh
mkdir -p build/sidebar-cancel-probe
# 将证据Swift/Web源分别复制为 build/sidebar-cancel-probe/Probe.swift 和 web.cjs
# 红用8e64424，green用下列SHA；只读外分支源码，不修改其工作树
 git show 17995615637d1c6dd90c5cd77db9fcee50ef86c7:editor/src/sidebar-connection.ts > build/sidebar-cancel-probe/sidebar-connection.ts
/Users/rayhu/Documents/projects/Inkora/editor/node_modules/.bin/tsc --noCheck --noResolve --module commonjs --target es2022 --outDir build/sidebar-cancel-probe/compiled build/sidebar-cancel-probe/sidebar-connection.ts
xcrun swiftc -swift-version 6 app/Sources/SidebarCatalog.swift app/Sources/SidebarWorkspaceBridge.swift build/sidebar-cancel-probe/Probe.swift -o build/sidebar-cancel-probe/probe
build/sidebar-cancel-probe/probe "$PWD/build/sidebar-cancel-probe" pending
build/sidebar-cancel-probe/probe "$PWD/build/sidebar-cancel-probe" ticket
```

转译仅为执行真实 Connection，不将 `--noCheck` 当类型验证。初次探针尝试旧 TypeScript JS API/Node transform 未能运行（本机是原生TS7、Node仅strip模式）；随后直接使用已有锁定 tsc 命令，无安装或依赖修改。一次探针 stdin EOF 等待已终止自有进程并改为显式关闭输入；最终两模式均退出0，无遗留 probe。没有 App/GUI/面板/全量 Native/Release/CI。
