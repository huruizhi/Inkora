import AppKit

@MainActor
final class RecoveryCoordinator {
  static let shared = RecoveryCoordinator()

  func reviewDrafts() {
    guard let store = RecoveryStore.applicationStore() else { return }
    let found = store.discover()
    if found.corruptCount > 0 {
      let alert = NSAlert()
      alert.messageText = "部分恢复草稿已损坏"
      alert.informativeText = "无法验证的草稿不会被加载，原始草稿仍保留在恢复目录中。"
      alert.runModal()
    }
    for draft in found.drafts {
      let alert = NSAlert()
      alert.messageText =
        draft.sourceChanged
        ? "恢复草稿：\(DocumentFileState.externalChange.localizedDescription)" : "发现未保存的恢复草稿"
      alert.informativeText =
        "\(draft.sourceURL?.lastPathComponent ?? "未命名文档")：恢复为未命名副本并保留为未保存状态。源文件不会被自动覆盖。"
      alert.addButton(withTitle: "恢复")
      alert.addButton(withTitle: "放弃草稿")
      alert.addButton(withTitle: "另存为…")
      alert.window.setAccessibilityIdentifier("RecoveryDialog")
      for (index, button) in alert.buttons.enumerated() {
        button.setAccessibilityIdentifier("RecoveryButton\(index)")
      }
      let response = alert.runModal()
      do {
        if response == .alertSecondButtonReturn {
          try store.retire(draft.id)
        } else {
          let document = try InkoraDocument(recoveryDraft: draft, recoveryStore: store)
          NSDocumentController.shared.addDocument(document)
          document.makeWindowControllers()
          document.showWindows()
          if response == .alertThirdButtonReturn { document.saveAs(nil) }
        }
      } catch { NSApplication.shared.presentError(error) }
    }
  }
}
