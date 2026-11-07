import AppKit

/// Builds and drives the File > Open Recent submenu. The recent list itself
/// is owned by NSDocumentController; this controller renders it, opens
/// entries, and prunes entries whose file disappeared.
///
/// Items deliberately use controller-owned selectors instead of
/// `openDocument:` / `clearRecentDocuments:` so AppKit's nib-era automatic
/// submenu population cannot race with this delegate-driven rebuild.
@MainActor
final class OpenRecentMenuController: NSObject, NSMenuDelegate, NSMenuItemValidation {
  typealias DocumentOpener = @MainActor (URL, @escaping (Error?) -> Void) -> Void

  private let list: RecentDocumentListManaging
  private let openDocument: DocumentOpener
  private let presentError: (Error) -> Void
  private let presentMissingFile: (URL) -> Void

  private let submenu = NSMenu(title: "Open Recent")
  init(
    list: RecentDocumentListManaging,
    openDocument: @escaping DocumentOpener,
    presentError: @escaping (Error) -> Void,
    presentMissingFile: @escaping (URL) -> Void
  ) {
    self.list = list
    self.openDocument = openDocument
    self.presentError = presentError
    self.presentMissingFile = presentMissingFile
    super.init()
    submenu.delegate = self
  }

  convenience init(list: RecentDocumentListManaging, openDocument: @escaping DocumentOpener) {
    self.init(
      list: list,
      openDocument: openDocument,
      presentError: { _ = NSApp.presentError($0) },
      presentMissingFile: { url in
        OpenRecentMenuController.showMissingFileAlert(for: url)
      }
    )
  }

  lazy var menuItem: NSMenuItem = {
    let item = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
    item.submenu = submenu
    return item
  }()

  func menuNeedsUpdate(_ menu: NSMenu) {
    rebuild()
  }

  /// Rebuilds the submenu from the current recent list. Recent entries come
  /// first (most recent on top), then a separator and Clear Menu.
  func rebuild() {
    submenu.removeAllItems()
    for url in list.recentDocumentURLs {
      let item = submenu.addItem(
        withTitle: url.lastPathComponent,
        action: #selector(openRecentDocument(_:)),
        keyEquivalent: ""
      )
      item.target = self
      item.representedObject = url
    }
    if !submenu.items.isEmpty {
      submenu.addItem(.separator())
    }
    let clearItem = submenu.addItem(
      withTitle: "Clear Menu",
      action: #selector(clearRecentDocuments(_:)),
      keyEquivalent: ""
    )
    clearItem.target = self
  }

  // MARK: - Actions

  @objc func openRecentDocument(_ sender: NSMenuItem) {
    guard let url = sender.representedObject as? URL else { return }
    openDocument(url) { [weak self] error in
      guard let self, let error else { return }
      if RecentDocumentList.isMissingFileError(error) {
        RecentDocumentList.remove(url, from: self.list)
        self.presentMissingFile(url)
      } else {
        self.presentError(error)
      }
    }
  }

  @objc func clearRecentDocuments(_ sender: NSMenuItem) {
    list.clearRecentDocuments()
    rebuild()
  }

  func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
    if menuItem.action == #selector(clearRecentDocuments(_:)) {
      return !list.recentDocumentURLs.isEmpty
    }
    return true
  }

  private static func showMissingFileAlert(for url: URL) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "Can’t Open “\(url.lastPathComponent)”"
    alert.informativeText =
      "The file no longer exists at its original location. It has been removed from Open Recent."
    alert.addButton(withTitle: "OK")
    _ = alert.runModal()
  }
}
