import AppKit

@MainActor
final class EditorCommandMenus: NSObject, NSMenuDelegate {
  func install(in mainMenu: NSMenu, editMenu: NSMenu) {
    editMenu.addItem(.separator())
    addEditorAction("查找…", .find, to: editMenu, key: "f")
    editMenu.delegate = self

    let insertMenu = NSMenu(title: "插入")
    addEditorAction("表格", .insertTable, to: insertMenu, key: "t", modifiers: [.command, .option])
    addEditorAction("图片…", .insertImage, to: insertMenu, key: "i", modifiers: [.command, .shift])
    let insertItem = NSMenuItem(title: "插入", action: nil, keyEquivalent: "")
    insertItem.submenu = insertMenu
    insertMenu.delegate = self
    mainMenu.addItem(insertItem)

    let viewMenu = NSMenu(title: "显示")
    addEditorAction(
      "可视模式", .visualMode, to: viewMenu, key: "1", modifiers: [.command, .option, .shift])
    addEditorAction(
      "源码模式", .sourceMode, to: viewMenu, key: "2", modifiers: [.command, .option, .shift])
    addEditorAction(
      "提交源码草稿", .applySource, to: viewMenu, key: "\r", modifiers: [.command, .option])
    addEditorAction("取消源码草稿", .cancelSource, to: viewMenu)
    viewMenu.addItem(.separator())
    addEditorAction(
      "显示/隐藏大纲", .toggleOutline, to: viewMenu, key: "o", modifiers: [.command, .shift])
    viewMenu.addItem(.separator())
    addEditorAction("阅读宽度 760 px", .readingWidth760, to: viewMenu)
    addEditorAction("阅读宽度 900 px（对照）", .readingWidth900, to: viewMenu)
    let viewItem = NSMenuItem(title: "显示", action: nil, keyEquivalent: "")
    viewItem.submenu = viewMenu
    viewMenu.delegate = self
    mainMenu.addItem(viewItem)

  }

  private func addEditorAction(
    _ title: String, _ command: BridgeEditorCommand, to menu: NSMenu,
    key: String = "", modifiers: NSEvent.ModifierFlags = [.command]
  ) {
    let item = menu.addItem(
      withTitle: title,
      action: #selector(EditorViewController.inkoraEditorAction(_:)), keyEquivalent: key)
    item.keyEquivalentModifierMask = modifiers
    item.representedObject = command.rawValue
    // A nil target follows the active document window's responder chain.
  }

  func menuWillOpen(_ menu: NSMenu) {
    guard
      let controller = NSApplication.shared.target(
        forAction: #selector(EditorViewController.inkoraEditorAction(_:))) as? EditorViewController
    else { return }
    controller.refreshEditorCommands { [weak menu] in menu?.update() }
  }

}
