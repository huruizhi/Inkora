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


## Post-fix：固定8e64424限定后验复核

按父会话后续限定指令执行；首稿内容不改写，仅追加本节及Spec报告后验段。自己的分支初始HEAD为`557d67f5417d619171ca073a8aaf5454450e890c`，工作区clean。`git rev-parse 8e64424^{commit}`得到固定产品`8e64424f2fd8b0c54faf449b418551d1761a8551`。

未从动态根工作树读产品文件；下列选定A/B文件全部来自固定commit。最初亦以git show固定SHA核读Bridge/CSS，然后建立archive冻结副本，所有复现编译均只使用archive源：

```sh
mkdir -p /tmp/ink-rev-134-post-8e64424
git archive 8e64424f2fd8b0c54faf449b418551d1761a8551 app/Sources/SidebarCatalog.swift app/Sources/SidebarWorkspaceBridge.swift editor/src/style.css editor/src/sidebar-chrome.ts editor/src/sidebar-chrome.test.ts tests/InkoraTests/SidebarWorkspaceBridgeTests.swift > /tmp/ink-rev-134-post-8e64424/fixed.tar
tar -xf /tmp/ink-rev-134-post-8e64424/fixed.tar -C /tmp/ink-rev-134-post-8e64424
```

archive SHA256：`246efb97fea9682975f656140f7f23dd33c84bc6a4b1f487b3f005b07757fc11`。没有生成新的产品审查diff，未改变首稿唯一diff范围。

### 自跑命令及结果

沿用首稿Bridge公开receive/current/replySink接缝；只有6个有限情形，没有运行归档内既有测试套件、全量门禁或C导航窗口反例。每个请求后同一MainActor turn立即更改绑定，避免完成先于更改；typing控制要求收到成功结果，负控制要求旧完成被拒且新ready能成功返回目录。跨doc控制还在发送新ready前等待250ms，验证仅document变更也足以拒旧回包。

```sh
xcrun swiftc -swift-version 6 /tmp/ink-rev-134-post-8e64424/app/Sources/SidebarCatalog.swift /tmp/ink-rev-134-post-8e64424/app/Sources/SidebarWorkspaceBridge.swift /tmp/ink-rev-134-post-8e64424/PostFixProbe.swift -o /tmp/ink-rev-134-post-8e64424/post-fix-probe
/tmp/ink-rev-134-post-8e64424/post-fix-probe
```

编译与运行退出0，实际输出：

```text
PASS scan typing: catalog delivered after revision 0 -> 1
PASS scan document: old completion rejected; rebound catalog delivered
PASS scan context: old completion rejected; rebound catalog delivered
PASS search typing: search delivered after revision 0 -> 1
PASS search document: old completion rejected; rebound catalog delivered
PASS search context: old completion rejected; rebound catalog delivered

```

完整probe源码保留如下；与首稿预期不同是因为它验证补正后的成功回包，同时保留跨doc/context拒绝要求，没有修改生产实现或有效测试：

```swift
import Foundation

enum EditorResourceSchemeHandler { static let scheme = "inkora-editor" }
enum BridgeProtocolV1 { static let maxSafeRevision = 9_007_199_254_740_991 }
@main struct PostFixProbe {
  @MainActor static func main() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    try Data("alpha\r\n".utf8).write(to: root.appendingPathComponent("a.md"))
    for operation in ["scan", "search"] {
      for control in ["typing", "document", "context"] {
        var revision = 0
        var documentID = "doc-A"
        var replies: [[String: Any]] = []
        let bridge = SidebarWorkspaceBridge(current: { .init(documentID: documentID, revision: revision) }, chooseFolder: { _ in }, mayOpen: { _, done in done(true) }, openFile: { _, _, _ in }, replySink: { replies.append(try! JSONSerialization.jsonObject(with: Data($0.utf8)) as! [String: Any]) })
        func request(_ action: String, id: String, context: String? = nil, extra: [String: Any] = [:]) -> String {
          var value: [String: Any] = ["action": action, "requestID": id, "documentID": documentID, "revision": revision]
          value["contextID"] = context
          value.merge(extra) { _, new in new }
          return String(data: try! JSONSerialization.data(withJSONObject: value), encoding: .utf8)!
        }
        func waitFor(_ id: String, kind: String) async throws {
          for _ in 0..<100 {
            if replies.contains(where: { $0["requestID"] as? String == id && $0["kind"] as? String == kind }) { return }
            try await Task.sleep(for: .milliseconds(10))
          }
          preconditionFailure("missing \(kind) for \(id): \(replies)")
        }
        bridge.useFolder(.init(root))
        let pending = "pending-\(operation)-\(control)"
        if operation == "scan" {
          bridge.receive(request("ready", id: pending), trustedMainFrame: true)
        } else {
          bridge.receive(request("ready", id: "setup"), trustedMainFrame: true)
          try await waitFor("setup", kind: "catalog")
          let context = replies.first!["contextID"] as! String
          let catalog = replies.last!["catalog"] as! [String: Any]
          bridge.receive(request("search", id: pending, context: context, extra: ["catalogID": catalog["id"]!, "query": "alpha", "options": ["caseSensitive": false, "wholeWord": false, "regularExpression": false]]), trustedMainFrame: true)
        }
        let expected = operation == "scan" ? "catalog" : "search"
        // No await before changing binding: MainActor completion cannot win the race.
        if control == "typing" {
          revision += 1
          try await waitFor(pending, kind: expected)
          if operation == "search" {
            let result = replies.last!["result"] as! [String: Any]
            precondition((result["hits"] as! [[String: Any]]).count == 1)
          }
          print("PASS \(operation) typing: \(expected) delivered after revision 0 -> 1")
        } else {
          if control == "document" {
            documentID = "doc-B"
            try await Task.sleep(for: .milliseconds(250))
            precondition(!replies.contains { $0["requestID"] as? String == pending && $0["kind"] as? String != "ready" })
          }
          let oldContext = replies.first!["contextID"] as! String
          bridge.receive(request("ready", id: "rebind"), trustedMainFrame: true)
          try await waitFor("rebind", kind: "catalog")
          try await Task.sleep(for: .milliseconds(100))
          precondition(!replies.contains { $0["requestID"] as? String == pending && $0["kind"] as? String != "ready" })
          let ready = replies.first { $0["requestID"] as? String == "rebind" && $0["kind"] as? String == "ready" }!
          precondition(ready["contextID"] as! String != oldContext)
          precondition(ready["documentID"] as! String == documentID)
          print("PASS \(operation) \(control): old completion rejected; rebound catalog delivered")
        }
      }
    }
  }
}

```

### 后验结论与未完成事项

- 原发现2：在上述限定Foundation/Bridge公共接缝范围已关闭。冻结源码`SidebarWorkspaceBridge.swift:203–205,265–267,348,407–408`支持该结果；未外推为真实WK生产交互全通过。
- 原发现4：B共享`--sidebar-width`消除原静态600/640数值分歧；600与640的侧栏/正文让位均240px，480均216px。依据冻结`style.css:171,324,617,624,868–872`，仅为核读CSS数值，实际WK几何与动画仍待C及根验收。
- 原发现1/3：仍未关闭；没有重审未完成C文件或因旧C路径重报旧缺陷。A的`revalidatedForNavigation`及Bridge包装ticket只核读，不宣称C已接通，也未自跑ticket专项。
- 未运行App、显示窗口、真实系统面板、GUI、浏览器、XCU、物理IME、全量门禁；未创建Agent、安装依赖、修改其他worktree。仅追加自己的两份报告。
- 后验报告独立提交并push同名branch，核对远端SHA等于HEAD且clean，worktree继续保留；准确提交SHA见最终回报。产品剩余修复与WK证据由父会话继续整合。
