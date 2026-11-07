import AppKit

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuItemValidation {
  static func main() {
    let application = NSApplication.shared
    let delegate = AppDelegate()
    application.delegate = delegate
    application.run()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApplication.shared.mainMenu = makeMainMenu()
  }

  func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool {
    true
  }

  func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    true
  }

  private func makeMainMenu() -> NSMenu {
    let mainMenu = NSMenu()

    let applicationItem = NSMenuItem(title: "Inkora", action: nil, keyEquivalent: "")
    mainMenu.addItem(applicationItem)
    let applicationMenu = NSMenu()
    applicationMenu.addItem(
      withTitle: "About Inkora",
      action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
      keyEquivalent: ""
    )
    applicationMenu.addItem(.separator())
    applicationMenu.addItem(
      withTitle: "Quit Inkora",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q"
    )
    applicationItem.submenu = applicationMenu

    let fileItem = NSMenuItem(title: "File", action: nil, keyEquivalent: "")
    mainMenu.addItem(fileItem)
    let fileMenu = NSMenu(title: "File")
    let newItem = fileMenu.addItem(
      withTitle: "New",
      action: #selector(NSDocumentController.newDocument(_:)),
      keyEquivalent: "n"
    )
    newItem.target = NSDocumentController.shared
    let openItem = fileMenu.addItem(
      withTitle: "Open…",
      action: #selector(NSDocumentController.openDocument(_:)),
      keyEquivalent: "o"
    )
    openItem.target = NSDocumentController.shared
    fileMenu.addItem(.separator())
    fileMenu.addItem(
      withTitle: "Close",
      action: #selector(NSWindow.performClose(_:)),
      keyEquivalent: "w"
    )
    let saveItem = fileMenu.addItem(
      withTitle: "Save",
      action: #selector(saveCurrentDocument(_:)),
      keyEquivalent: "s"
    )
    saveItem.target = self
    let saveAsItem = fileMenu.addItem(
      withTitle: "Save As…",
      action: #selector(saveCurrentDocumentAs(_:)),
      keyEquivalent: "S"
    )
    saveAsItem.target = self
    fileItem.submenu = fileMenu

    let editItem = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
    mainMenu.addItem(editItem)
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(
      withTitle: "Undo",
      action: #selector(EditorViewController.inkoraUndo(_:)),
      keyEquivalent: "z"
    )
    editMenu.addItem(
      withTitle: "Redo",
      action: #selector(EditorViewController.inkoraRedo(_:)),
      keyEquivalent: "Z"
    )
    editMenu.addItem(.separator())
    editMenu.addItem(
      withTitle: "Cut",
      action: #selector(NSText.cut(_:)),
      keyEquivalent: "x"
    )
    editMenu.addItem(
      withTitle: "Copy",
      action: #selector(NSText.copy(_:)),
      keyEquivalent: "c"
    )
    editMenu.addItem(
      withTitle: "Paste",
      action: #selector(NSText.paste(_:)),
      keyEquivalent: "v"
    )
    editMenu.addItem(
      withTitle: "Select All",
      action: #selector(NSText.selectAll(_:)),
      keyEquivalent: "a"
    )
    editItem.submenu = editMenu

    return mainMenu
  }

  func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
    switch menuItem.action {
    case #selector(saveCurrentDocument(_:)), #selector(saveCurrentDocumentAs(_:)):
      NSDocumentController.shared.currentDocument != nil
    default:
      true
    }
  }

  @objc private func saveCurrentDocument(_ sender: Any?) {
    NSDocumentController.shared.currentDocument?.save(nil)
  }

  @objc private func saveCurrentDocumentAs(_ sender: Any?) {
    NSDocumentController.shared.currentDocument?.saveAs(nil)
  }
}
