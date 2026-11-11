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

  private var updateMenu: UpdateMenuController?

  private func configureUpdates() {
    let preferences = UpdatePreferences(defaults: UserDefaults.standard)
    #if DEBUG
      let isDebug = true
    #else
      let isDebug = false
    #endif
    let permitted = UpdateLaunchPolicy.permitsStarting(
      isDebug: isDebug, bundleIdentifier: Bundle.main.bundleIdentifier,
      environment: ProcessInfo.processInfo.environment)
    var driver: (any NativeUpdateDriver)?
    var reason = "此构建仅支持只读发行信息检查；自动安装需要可信签名分发构建。"
    #if INKORA_SPARKLE
      if permitted, UpdateConfiguration(info: Bundle.main.infoDictionary ?? [:]) != nil {
        do { driver = try SparkleUpdateDriver(preferences: preferences) } catch {
          reason = "更新器配置验证失败：\(error.localizedDescription)"
        }
      } else {
        reason = "可信更新源或公钥尚未配置，自动更新未启用。"
      }
    #endif
    if !permitted { reason = "调试与测试构建不启动更新检查。" }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.timeoutIntervalForResource = 30
    updateMenu = UpdateMenuController(
      service: UpdateService(preferences: preferences, driver: driver, unavailableReason: reason),
      releaseLookup: permitted && driver == nil
        ? ReleaseLookup(
          session: URLSession(
            configuration: configuration, delegate: ReleaseTransportDelegate(), delegateQueue: nil))
        : nil,
      currentBuild: UInt64(
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0)
  }

  private let editorCommandMenus = EditorCommandMenus()

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
    configureUpdates()
    NSApplication.shared.mainMenu = makeMainMenu()
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

  private let terminationReview = DocumentTerminationReview()

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard !terminationReview.inProgress else { return .terminateLater }
    terminationReview.begin(documents: NSDocumentController.shared.documents) { approved in
      sender.reply(toApplicationShouldTerminate: approved)
    }
    return .terminateLater
  }

  /// Opens `url` through NSDocumentController and keeps the entry at the
  /// front of Open Recent on success.
  private static func openDocumentFromURL(
    _ url: URL, completion: @escaping (Error?) -> Void
  ) {
    NSDocumentController.shared.openDocument(
      withContentsOf: url, display: true
    ) { document, _, error in
      // A read-only encoding-error open (ENC-002) is not a successful open;
      // keep such files out of Open Recent.
      if error == nil, (document as? InkoraDocument)?.encodingError == nil {
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
    if let updateMenu {
      applicationMenu.addItem(updateMenu.checkItem)
      applicationMenu.addItem(updateMenu.settingsItem)
    }
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

    editorCommandMenus.install(in: mainMenu, editMenu: editMenu)

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
