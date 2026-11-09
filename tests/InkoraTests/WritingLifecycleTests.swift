import ImageIO
import WebKit
import XCTest

final class WritingLifecycleTests: XCTestCase {
  private let markdownType = "net.daringfireball.markdown"

  @MainActor
  func testMixedArticleEditsMigrateFourImageFormatsAndReopenWithExactBytes() async throws {
    let scratch = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: scratch) }
    let sourceDirectory = scratch.appendingPathComponent("Source")
    let targetDirectory = scratch.appendingPathComponent("Target")
    let assetsDirectory = sourceDirectory.appendingPathComponent("Article.assets")
    try FileManager.default.createDirectory(at: assetsDirectory, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: true)
    let sourceURL = sourceDirectory.appendingPathComponent("技术文章.md")
    let targetURL = targetDirectory.appendingPathComponent("迁移文章.md")
    let images = try imageFixtures()
    for (name, bytes) in images {
      try bytes.write(to: assetsDirectory.appendingPathComponent(name))
    }
    let body = """
      ---
      title: 保留元数据
      ---

      # 技术文章

      写作原文 👩‍💻 é。

      - [ ] 验证任务

      | 项目  | 结果 |
      | :--- | ---: |
      | 单元格 | 正常 |

      ```ts
      const value = 1;
      ```

      [链接](https://example.com "保留标题")

      Before [[目标]] after.

      > [!NOTE] 提示
      > 保护原文
      普通正文不属于 callout。

      <!-- ![fake](missing.png) -->

      ![PNG](Article.assets/image%20png.png)
      ![JPEG](Article.assets/image%20jpeg.jpg)
      ![GIF](Article.assets/image%20gif.gif)
      ![WebP](Article.assets/image%20webp.webp)

      脚注[^note]

      [^note]: 只读定义
      """.replacingOccurrences(of: "\n", with: "\r\n")
    let bom = Data([0xEF, 0xBB, 0xBF])
    let originalBytes = bom + Data(body.utf8)
    try originalBytes.write(to: sourceURL)
    let (document, controller, webView) = try await load(
      sourceURL, recoveryDirectory: scratch.appendingPathComponent("Recovery"))
    defer { document.close() }
    XCTAssertNil(webView.window, "This integration test must stay hostless")
    try await waitForImages(in: webView)
    let initial = try await snapshot(controller)
    XCTAssertEqual(initial.text, body)
    XCTAssertEqual(try initial.requireImageOwnership().imageURIs.count, 4)

    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor.ProseMirror');
        editor.focus();
        const p = Array.from(editor.querySelectorAll('p')).find(p => p.textContent.startsWith('写作原文'));
        const range = document.createRange(); range.setStart(p.firstChild, 0); range.collapse(true);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        return document.execCommand('insertText', false, '修改');
      })()
      """)
    var expected = body.replacingOccurrences(of: "写作原文", with: "修改写作原文")
    try await assertText(expected, controller: controller)

    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.inkora-task-checkbox').click()")
    expected = expected.replacingOccurrences(of: "- [ ] 验证任务", with: "- [x] 验证任务")
    try await assertText(expected, controller: controller)

    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const select = document.querySelector('.inkora-code-language');
        select.value = 'python'; select.dispatchEvent(new Event('change', { bubbles: true }));
      })()
      """)
    expected = expected.replacingOccurrences(of: "```ts", with: "```python")
    try await assertText(expected, controller: controller)

    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const editor = document.querySelector('#editor.ProseMirror'); editor.focus();
        const cell = editor.querySelector('tbody td');
        const range = document.createRange(); range.selectNodeContents(cell); range.collapse(false);
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        return document.execCommand('insertText', false, '新增');
      })()
      """)
    expected = expected.replacingOccurrences(of: "| 单元格 |", with: "| 单元格新增 |")
    try await assertText(expected, controller: controller)

    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        document.querySelector('.search-toggle').click();
        const query = document.querySelector('.search-panel-query');
        query.value = '原文'; query.dispatchEvent(new Event('input', { bubbles: true }));
      })()
      """)
    try await wait(
      in: webView, script: "document.querySelector('.search-panel-count')?.textContent === '1 处匹配'")
    _ = try await webView.evaluateJavaScript(
      """
      (() => {
        const replacement = document.querySelector('.search-panel-replacement');
        replacement.value = '正文'; replacement.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.search-panel-replace-all').click();
        document.querySelector('.search-panel-close').click();
      })()
      """)
    let beforeReplacement = expected
    expected = expected.replacingOccurrences(of: "修改写作原文", with: "修改写作正文")
    try await assertText(expected, controller: controller)
    controller.performEditorCommand(.undo)
    try await assertText(beforeReplacement, controller: controller)
    controller.performEditorCommand(.redo)
    try await assertText(expected, controller: controller)

    let beforeSource = try await snapshot(controller)
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.editor-mode-source').click()")
    try await wait(in: webView, script: "!!document.querySelector('textarea#editor')")
    _ = try await webView.evaluateJavaScript(
      "document.querySelector('.editor-mode-visual').click()")
    try await wait(in: webView, script: "!!document.querySelector('#editor.ProseMirror')")
    let afterSource = try await snapshot(controller)
    XCTAssertEqual(afterSource.text, beforeSource.text)
    XCTAssertEqual(afterSource.revision, beforeSource.revision)
    try await waitForImages(in: webView)

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      document.save(to: targetURL, ofType: markdownType, for: .saveAsOperation) { error in
        if let error { continuation.resume(throwing: error) } else { continuation.resume() }
      }
    }
    XCTAssertEqual(try Data(contentsOf: sourceURL), originalBytes)
    XCTAssertEqual(try Data(contentsOf: targetURL), bom + Data(expected.utf8))
    for (name, bytes) in images {
      XCTAssertEqual(try Data(contentsOf: assetsDirectory.appendingPathComponent(name)), bytes)
      XCTAssertEqual(
        try Data(contentsOf: targetDirectory.appendingPathComponent("Article.assets/" + name)),
        bytes)
    }
    XCTAssertFalse(
      FileManager.default.fileExists(
        atPath: targetDirectory.appendingPathComponent("missing.png").path))

    let (reopened, reopenedController, reopenedView) = try await load(
      targetURL, recoveryDirectory: scratch.appendingPathComponent("ReopenedRecovery"))
    defer { reopened.close() }
    try await waitForImages(in: reopenedView)
    let reopenedSnapshot = try await snapshot(reopenedController)
    XCTAssertEqual(reopenedSnapshot.text, expected)
    XCTAssertEqual(
      try reopenedSnapshot.requireImageOwnership().imageURIs,
      try afterSource.requireImageOwnership().imageURIs)
    let structure = try await reopenedView.evaluateJavaScript(
      """
      ({ task: document.querySelector('.inkora-task-checkbox').checked,
         cell: document.querySelector('tbody td').textContent,
         language: document.querySelector('.inkora-code-language').value,
         href: document.querySelector('#editor p a').getAttribute('href') })
      """)
    let values = try XCTUnwrap(structure as? [String: Any])
    XCTAssertEqual(values["task"] as? Bool, true)
    XCTAssertEqual(values["cell"] as? String, "单元格新增")
    XCTAssertEqual(values["language"] as? String, "python")
    XCTAssertEqual(values["href"] as? String, "https://example.com")
    XCTAssertFalse(reopened.isDocumentEdited)
    XCTAssertFalse(
      reopenedController.canPerformEditorCommand(.undo), "Reopen starts a new history epoch")
  }

  @MainActor
  private func load(_ url: URL, recoveryDirectory: URL) async throws
    -> (InkoraDocument, EditorViewController, WKWebView)
  {
    var controller: EditorViewController!
    let document = InkoraDocument(snapshotRequester: { completion in
      controller.requestSnapshot(completion: completion)
    })
    try document.read(from: url, ofType: markdownType)
    document.fileURL = url
    document.configureRecovery(store: RecoveryStore(directory: recoveryDirectory))
    // Inject only the OS directory-choice boundary. This is not Sandbox grant evidence.
    try document.rememberImageDirectory(
      url.deletingLastPathComponent(), for: url, role: "document-directory", access: .readWrite)
    controller = EditorViewController(
      document: document, resourceBundle: Bundle(for: Self.self),
      imageSaveDirectoryAuthorizer: { selectedURL, _, _, completion in
        completion(selectedURL.deletingLastPathComponent())
      })
    controller.loadViewIfNeeded()
    let webView = try XCTUnwrap(controller.view as? WKWebView)
    try await wait(in: webView, script: "!!document.querySelector('#editor.ProseMirror')")
    _ = try await snapshot(controller)
    return (document, controller, webView)
  }

  @MainActor
  private func waitForImages(in webView: WKWebView) async throws {
    try await wait(
      in: webView,
      script: """
        (() => {
          const images = Array.from(document.querySelectorAll('#editor .image-node img'));
          return images.length === 4 && images.every(image => image.complete && image.naturalWidth === 1 && image.naturalHeight === 1);
        })()
        """)
  }

  @MainActor
  private func assertText(_ expected: String, controller: EditorViewController) async throws {
    let actual = try await snapshot(controller)
    XCTAssertEqual(actual.text, expected)
  }

  @MainActor
  private func snapshot(_ controller: EditorViewController) async throws -> BridgeSnapshot {
    for _ in 0..<60 {
      do {
        return try await withCheckedThrowingContinuation { continuation in
          controller.requestSnapshot { continuation.resume(with: $0) }
        }
      } catch EditorBridgeError.editorNotReady {
        try await Task.sleep(for: .milliseconds(50))
      }
    }
    throw EditorBridgeError.editorNotReady
  }

  @MainActor
  private func wait(in webView: WKWebView, script: String) async throws {
    for _ in 0..<100 {
      if try await webView.evaluateJavaScript(script) as? Bool == true { return }
      try await Task.sleep(for: .milliseconds(50))
    }
    XCTFail("Timed out: " + script)
    throw EditorBridgeError.requestTimedOut
  }

  private func imageFixtures() throws -> [(String, Data)] {
    let png = Data(
      base64Encoded:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )!
    let source = try XCTUnwrap(CGImageSourceCreateWithData(png as CFData, nil))
    let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
    let jpeg = NSMutableData()
    let destination = try XCTUnwrap(
      CGImageDestinationCreateWithData(jpeg, "public.jpeg" as CFString, 1, nil))
    CGImageDestinationAddImage(destination, image, nil)
    XCTAssertTrue(CGImageDestinationFinalize(destination))
    return [
      ("image png.png", png), ("image jpeg.jpg", jpeg as Data),
      ("image gif.gif", Data(base64Encoded: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")!),
      (
        "image webp.webp",
        Data(base64Encoded: "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygA")!
      ),
    ]
  }
}
