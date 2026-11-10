# INK-REV-134：侧栏独立 Spec 审查

- 分支：`task/INK-REV-134-sidebar-spec`。
- 固定受检 HEAD：`d3edf8803c661d1fb2dbebf9e8abdd826720f69d`。
- 基线：`30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53`。
- 结果：[Spec报告](../reviews/INK-REV-134-sidebar-spec.md)，1项P1、3项P2，产品不得按本报告视为已完成。
- 仅新增本文件及报告，不修实现、不改测试/依赖、不建子Agent/PR/Issue、不合main、不操作其他worktree。

## 初始核对与固定审查范围

实际运行 `git status --short` 无输出，`git rev-parse HEAD` 与固定SHA相等，`git rev-parse --verify 30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53^{commit}` 成功；分支名正确。

唯一审查命令在初始HEAD执行一次：

```sh
git diff 30e2f5fae0e43b7c5ac5e879dd944a28d8b72c53...HEAD > /tmp/INK-REV-134-fixed.diff
```

非空3936行，解析捕获文件得36 files / +3314 / -27；SHA256：`e0e3c1878b482cc5e37ba1a0122989f4e43bb0e0e1c005b0688464bfb31dcbbb`。此后只阅读捕获内容及固定HEAD源文件，不重新生成受检diff，不混入审查报告。

初始 `git log base..HEAD --oneline`：

```text
d3edf88 docs: normalize sidebar integration evidence logs
c8216b9 feat(editor): integrate titlebar and verified document navigation
5f1d7dc docs: record independent sidebar module verification
d776cc1 feat(editor): complete sidebar controls and title chrome
ced630d test(sidebar): cover authorized roots and hostless bridge lifecycle
1f797e8 fix(sidebar): retain raw BOM offsets and verified file metadata
c3b130a feat(sidebar): verify native catalog bytes and search locations
ef6c184 docs: track delegated sidebar acceptance requirements
348d757 fix(editor): guard optional sidebar message handlers
bf8f7e5 docs: specify titlebar controls and sidebar animation
466d351 chore: checkpoint sidebar work for delegated implementation
```

正式依据为design/typora-sidebar全部条款与INK-UX-129矩阵；code-review skill仅采用固定diff与Spec核对流程，用户禁止子Agent的明确限制优先。作者任务记录及日志仅作为外部证据。本次未将149/185/136等任何作者/父会话历史测试数量当成自己通过。

## 独立自跑：有界 Foundation 反例

未显示任何窗口。只编译当前生产Catalog、WorkspaceBridge；外部常量与可变current closure来自既有hostless接缝。未放宽断言：断言捕获不良行为，退出0表示反例成立。

```sh
xcrun swiftc -swift-version 6 app/Sources/SidebarCatalog.swift app/Sources/SidebarWorkspaceBridge.swift /tmp/ink-rev-134-spec/Probe.swift -o /tmp/ink-rev-134-spec/probe
/tmp/ink-rev-134-spec/probe
```

输出（编译与执行均退出0）：

```text
scan after revision change: ["ready"]
explicit refresh without editing: catalog received
search after revision change: no search/error reply
```

500ms等待用于让完成任务进入MainActor；修改revision与请求在同一MainActor turn，完成不可能先于修改。显式refresh成功作为控制，排除目录读取本身失败。源码：

```swift
import Foundation

enum EditorResourceSchemeHandler { static let scheme = "inkora-editor" }
enum BridgeProtocolV1 { static let maxSafeRevision = 9_007_199_254_740_991 }
@main struct Probe {
  @MainActor static func main() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try Data("alpha\r\n".utf8).write(to: root.appendingPathComponent("a.md"))
    var revision = 0
    var replies: [[String: Any]] = []
    let bridge = SidebarWorkspaceBridge(current: { .init(documentID: "doc", revision: revision) }, chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in }, replySink: { replies.append(try! JSONSerialization.jsonObject(with: Data($0.utf8)) as! [String: Any]) })
    func request(_ action: String, context: String? = nil, extra: [String: Any] = [:]) -> String {
      var value: [String: Any] = ["action": action, "requestID": UUID().uuidString, "documentID": "doc", "revision": revision]
      value["contextID"] = context
      value.merge(extra) { _, new in new }
      return String(data: try! JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
    }
    bridge.useFolder(.init(root))
    bridge.receive(request("ready"), trustedMainFrame: true)
    revision = 1 // before yielding MainActor: scan completion cannot yet have run
    try await Task.sleep(for: .milliseconds(500))
    print("scan after revision change:", replies.map { $0["kind"] as! String })
    precondition(replies.count == 1 && replies[0]["kind"] as? String == "ready")
    let context = replies[0]["contextID"] as! String
    bridge.receive(request("refresh", context: context), trustedMainFrame: true)
    for _ in 0..<100 { if replies.last?["kind"] as? String == "catalog" { break }; try await Task.sleep(for: .milliseconds(10)) }
    precondition(replies.last?["kind"] as? String == "catalog")
    print("explicit refresh without editing: catalog received")
    let catalog = replies.last!["catalog"] as! [String: Any]
    let count = replies.count
    bridge.receive(request("search", context: context, extra: ["catalogID": catalog["id"]!, "query": "alpha", "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false]]), trustedMainFrame: true)
    revision = 2
    try await Task.sleep(for: .milliseconds(500))
    precondition(replies.count == count)
    print("search after revision change: no search/error reply")
  }
}

```

## 独立自跑：延后关闭确认后的过期目标

只运行一个有限hostless可执行文件，编译生产App源（排除AppDelegate），不启动App；窗口始终不可见，无系统面板。注入reviewer只控制保存确认等待边界，实际readSidebarFile、文档注册、窗口转交、reload、source.close均为当前生产实现。此例证明晚确认后的过期消费；不声称已经证明真实Save/Discard/Cancel或dirty保存成功。

```zsh
platform=$(xcrun --show-sdk-platform-path)
sources=(app/Sources/*.swift)
sources=("${(@)sources:#*/AppDelegate.swift}")
xcrun swiftc -swift-version 6 -I "$platform/Developer/usr/lib" -L "$platform/Developer/usr/lib" -F "$platform/Developer/Library/Frameworks" -Xlinker -rpath -Xlinker "$platform/Developer/Library/Frameworks" -Xlinker -rpath -Xlinker "$platform/Developer/usr/lib" "${sources[@]}" /tmp/ink-rev-134-spec/NavigationProbe.swift -o /tmp/ink-rev-134-spec/navigation-probe
/tmp/ink-rev-134-spec/navigation-probe
```

输出（编译与执行均退出0）：

```text
navigation error: nil
target text: "old alpha\n"
disk text: "NEW external contents\n"
source windows: 0 target reused window: true visible: false
```

源码：

```swift
import AppKit
import Foundation
@main struct NavigationProbe {
  @MainActor static func main() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appendingPathComponent("target.md")
    try Data("old alpha\n".utf8).write(to: url)
    let catalog = try SidebarCatalog.scan(folder: root)
    let file = try catalog.openFile(id: catalog.files[0].id, catalogID: catalog.id)
    let source = InkoraDocument()
    try source.read(from: Data("source\n".utf8), ofType: "net.daringfireball.markdown")
    let documents = NSDocumentController.shared
    let editor = EditorViewController(document: source, sidebarDocumentController: documents, sidebarDocumentFactory: { _ in InkoraDocument() })
    let window = NSWindow(contentViewController: editor)
    let wc = NSWindowController(window: window)
    source.addWindowController(wc)
    var pending: ((Bool) -> Void)?
    source.navigationReviewer = { pending = $0 }
    var error: Error?
    editor.navigateSidebarFile(file, access: .init(root)) { error = $0 }
    precondition(pending != nil && editor.document === source && !window.isVisible)
    try Data("NEW external contents\n".utf8).write(to: url)
    pending?(true)
    let target = editor.document!
    print("navigation error:", error as Any)
    print("target text:", target.text.debugDescription)
    print("disk text:", try String(contentsOf: url, encoding: .utf8).debugDescription)
    print("source windows:", source.windowControllers.count, "target reused window:", target.windowControllers.first === wc, "visible:", window.isVisible)
    precondition(error == nil && target !== source && target.text == "old alpha\n" && source.windowControllers.isEmpty && !window.isVisible)
    target.removeWindowController(wc)
    documents.removeDocument(target)
    target.close()
    window.close()
  }
}

```

## 交付与限制

已通过Paseo `send_agent_prompt` 向父会话 `08ef1b06-4ec0-4486-bfcf-c3dfd3e624c6`提前报告可行动阻断及上述独立反例，收到排队送达回执；没有创建子Agent或对外发消息。

本次不重跑根会话负责的make lint/test、全量Native、Release、CI，不运行GUI/App/XCU/CUA/浏览器、实际保存或文件夹面板、物理IME。没有安装或借用依赖symlink。两段probe及其可执行文件留在本机`/tmp/ink-rev-134-spec`；完整源和输出已经随本任务记录保留，临时目录清理不影响评审证据。窄窗几何和已打开dirty目标卡片为静态推导，尚未独立运行对应窗口/布局反例。

未完成事项：四项发现的产品修复及相应回归、矩阵剩余证明，由父会话安排；只审不修意味着这些产品风险仍存在。审查本身完成，不声称整个Typora目标或main交付完成。工作树与分支保留作为验收备份。提交使用英文Conventional Commits，提交后push同名origin并核对origin=HEAD/clean；完整交付SHA见最终回报（本文件不能自引用自己的提交SHA）。
