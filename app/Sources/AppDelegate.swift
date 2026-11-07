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

  private let openRecentMenu = OpenRecentMenuController(
    list: DocumentControllerRecentDocumentList(),
    openDocument: AppDelegate.openDocumentFromURL
  )

  private lazy var restoreController = LastDocumentRestoreController(
    history: DocumentOpenHistory.shared,
    documentsAreOpen: { !NSDocumentController.shared.documents.isEmpty },
    openDocument: AppDelegate.openDocumentFromURL,
    openUntitledDocument: {
      _ = try? NSDocumentController.shared.openUntitledDocumentAndDisplay(true)
    }
  )

  func applicationWillFinishLaunching(_ notification: Notification) {
    DocumentOpenHistory.shared.configure(
      defaults: LaunchDefaultsResolver.defaults(arguments: ProcessInfo.processInfo.arguments)
    )
    RecentDocumentNoter.shared.configure(list: DocumentControllerRecentDocumentList())
    NSApplication.shared.mainMenu = makeMainMenu()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    DispatchQueue.main.async { RecoveryCoordinator.shared.reviewDrafts() }
  }

  func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool {
    if restoreController.restoreLastDocumentIfNeeded() {
      return false
    }
    return true
  }

  func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool {
    true
  }

  private var terminationReviewInProgress = false

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard !terminationReviewInProgress else { return .terminateLater }
    terminationReviewInProgress = true
    DispatchQueue.main.async { [self] in
      prepareDocumentsForTermination(NSDocumentController.shared.documents[...])
    }
    return .terminateLater
  }

  private func prepareDocumentsForTermination(_ documents: ArraySlice<NSDocument>) {
    guard let document = documents.first else {
      NSDocumentController.shared.reviewUnsavedDocuments(
        withAlertTitle: "Quit Inkora?", cancellable: true, delegate: self,
        didReviewAllSelector: #selector(didReviewDocuments(_:didReviewAll:contextInfo:)),
        contextInfo: nil
      )
      return
    }
    guard let document = document as? InkoraDocument else {
      prepareDocumentsForTermination(documents.dropFirst())
      return
    }
    document.prepareForClose { [self] error in
      if let error {
        document.presentError(error)
        terminationReviewInProgress = false
        NSApplication.shared.reply(toApplicationShouldTerminate: false)
        return
      }
      prepareDocumentsForTermination(documents.dropFirst())
    }
  }

  @objc private func didReviewDocuments(
    _ controller: NSDocumentController, didReviewAll: Bool,
    contextInfo: UnsafeMutableRawPointer?
  ) {
    terminationReviewInProgress = false
    if didReviewAll {
      for document in NSDocumentController.shared.documents {
        (document as? InkoraDocument)?.finishRecoveryForNormalTermination()
      }
    }
    NSApplication.shared.reply(toApplicationShouldTerminate: didReviewAll)
  }

  /// Opens `url` through NSDocumentController and keeps the entry at the
  /// front of Open Recent on success.
  private static func openDocumentFromURL(
    _ url: URL, completion: @escaping (Error?) -> Void
  ) {
    NSDocumentController.shared.openDocument(withContentsOf: url, display: true) { _, _, error in
      if error == nil {
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
      }
      completion(error)
    }
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
    fileMenu.addItem(openRecentMenu.menuItem)
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
