import AppKit

struct DocumentImageSavePreparation {
  let managedPlan: LocalImageSavePlan?
  let sourceAuthorizedDirectory: URL?
  let targetAuthorizedDirectory: URL?
}

enum InkoraDocumentError: LocalizedError {
  case invalidUTF8
  case utf16Detected
  case utf32Detected

  var errorDescription: String? {
    switch self {
    case .invalidUTF8, .utf16Detected, .utf32Detected:
      "Inkora currently supports UTF-8 Markdown files only."
    }
  }

  var failureReason: String? {
    switch self {
    case .invalidUTF8:
      "The selected file is not valid UTF-8 text."
    case .utf16Detected:
      "The selected file starts with a UTF-16 byte-order mark."
    case .utf32Detected:
      "The selected file starts with a UTF-32 byte-order mark."
    }
  }

  var recoverySuggestion: String? {
    "Convert the file to UTF-8 in another editor, then open it again."
  }
}

@objc(InkoraDocument)
final class InkoraDocument: NSDocument {
  typealias SnapshotRequester = (@escaping (Result<BridgeSnapshot, Error>) -> Void) -> Void
  typealias ImageSavePreparer = (
    _ targetURL: URL,
    _ snapshot: BridgeSnapshot,
    _ completion: @escaping (Result<DocumentImageSavePreparation?, Error>) -> Void
  ) -> Void

  private struct PendingSave {
    let url: URL
    let typeName: String
    let operation: NSDocument.SaveOperationType
    let completion: (Error?) -> Void
  }

  // Referenced from the nonisolated NSDocument read override; Data constants
  // are immutable and Sendable, so they carry no actor isolation.
  private nonisolated static let utf8BOM = Data([0xEF, 0xBB, 0xBF])
  private nonisolated static let utf32LEBOM = Data([0xFF, 0xFE, 0x00, 0x00])
  private nonisolated static let utf32BEBOM = Data([0x00, 0x00, 0xFE, 0xFF])
  private nonisolated static let utf16LEBOM = Data([0xFF, 0xFE])
  private nonisolated static let utf16BEBOM = Data([0xFE, 0xFF])

  private(set) var bridgeDocumentID = UUID().uuidString
  // Window navigation may share an explicit directory grant. It is not document content.
  var sidebarFolderAccess: SidebarWorkspaceBridge.FolderAccess?
  private var diskVersion: DocumentDiskVersion?
  private var missingOriginal = false
  private(set) var fileState: DocumentFileState = .current
  // ENC-002: an undecodable file opens in a read-only error state instead of
  // failing the open; the reason drives the window content and save errors.
  var encodingError: InkoraDocumentError? { encodingErrorStorage.get() }
  private var reviewingFileState = false
  private let editorResourceBundle: Bundle
  private let dataWriter: any DocumentDataWriting
  private let revisionStorage = DocumentRevisionStorage()
  private let textStorage = DocumentTextStorage()
  private let bomStorage = DocumentBOMStorage()
  private let encodingErrorStorage = DocumentEncodingErrorStorage()
  private weak var editorViewController: EditorViewController?
  private var snapshotRequester: SnapshotRequester?
  private var pendingSaves: [PendingSave] = []
  private var saveInProgress = false
  private var recoverySnapshotRequester: SnapshotRequester?
  private var recoveryStore = RecoveryStore.applicationStore()
  private var recoveryID = UUID()
  private var recoveryTask: Task<Void, Never>?
  private var recoveryEpoch = 0
  private var recoveryClosed = false
  private var recoveredUnsaved = false
  private var recoverySourceURL: URL?
  private var recoverySourceFingerprint: RecoveryFingerprint?
  private var lastRecoveryData: Data?
  private(set) var recoveryError: Error?
  private let openHistory: DocumentOpenHistory
  private var localImageSession: LocalImageSession?
  private var preparedImageSave: DocumentImageSavePreparation?
  private var preparedImageMigration: LocalImageMigrationPlan?
  private var imageSavePreparer: ImageSavePreparer?
  private(set) var imageMigrationRecovery = LocalImageMigrationCoordinator.RecoveryDiscovery(
    records: [], rejected: [])

  override init() {
    openHistory = .shared
    editorResourceBundle = .main
    dataWriter = AtomicDocumentDataWriter()
    super.init()
  }

  init(editorResourceBundle: Bundle) {
    openHistory = .shared
    self.editorResourceBundle = editorResourceBundle
    dataWriter = AtomicDocumentDataWriter()
    super.init()
  }

  init(
    editorResourceBundle: Bundle = .main,
    snapshotRequester: @escaping SnapshotRequester,
    dataWriter: any DocumentDataWriting = AtomicDocumentDataWriter(),
    openHistory: DocumentOpenHistory = .shared
  ) {
    self.editorResourceBundle = editorResourceBundle
    self.snapshotRequester = snapshotRequester
    self.dataWriter = dataWriter
    self.openHistory = openHistory
    super.init()
  }

  convenience init(recoveryDraft: RecoveryDraft, recoveryStore: RecoveryStore) throws {
    self.init()
    try recoveryDraft.validate()
    self.recoveryStore = recoveryStore
    recoveryID = recoveryDraft.id
    recoverySourceURL = recoveryDraft.resolvedSourceURL()
    recoverySourceFingerprint = recoveryDraft.sourceFingerprint
    try read(from: recoveryDraft.data, ofType: "net.daringfireball.markdown")
    fileType = "net.daringfireball.markdown"
    revisionStorage.set(recoveryDraft.revision)
    recoveredUnsaved = true
    lastRecoveryData = recoveryDraft.data
    synchronizeEditedState(true)
  }

  convenience init(
    recoveryDraft: RecoveryDraft,
    pendingImageRecovery: LocalImageStore.RecoveryCandidate,
    recoveryStore: RecoveryStore,
    snapshotRequester: SnapshotRequester? = nil
  ) throws {
    guard recoveryDraft.id == pendingImageRecovery.sessionID else {
      throw LocalImageError.corruptManifest
    }
    try self.init(recoveryDraft: recoveryDraft, recoveryStore: recoveryStore)
    self.snapshotRequester = snapshotRequester
    try attachPendingImageRecovery(pendingImageRecovery, store: recoveryStore)
  }

  convenience init(
    pendingImageRecovery: LocalImageStore.RecoveryCandidate,
    recoveryStore: RecoveryStore,
    snapshotRequester: SnapshotRequester? = nil
  ) throws {
    self.init()
    self.recoveryStore = recoveryStore
    self.snapshotRequester = snapshotRequester
    try read(from: Data(), ofType: "net.daringfireball.markdown")
    fileType = "net.daringfireball.markdown"
    try attachPendingImageRecovery(pendingImageRecovery, store: recoveryStore)
  }

  private func attachPendingImageRecovery(
    _ candidate: LocalImageStore.RecoveryCandidate,
    store: RecoveryStore
  ) throws {
    let session = try LocalImageStore(
      root: store.directory.appendingPathComponent("LocalImages", isDirectory: true)
    ).begin(documentID: candidate.documentID, sessionID: candidate.sessionID)
    guard session.assets.map(\.id) == candidate.assets.map(\.id) else {
      throw LocalImageError.corruptManifest
    }
    recoveryID = candidate.sessionID
    bridgeDocumentID = candidate.documentID
    localImageSession = session
  }

  func preserveDirtyForEditorRecovery() {
    // A replayed snapshot initializes a clean Web session, but it is not a disk save.
    recoveredUnsaved = recoveredUnsaved || isDocumentEdited
  }

  func configureRecovery(store: RecoveryStore, snapshotRequester: SnapshotRequester? = nil) {
    recoveryStore = store
    recoverySnapshotRequester = snapshotRequester
    imageMigrationRecovery = LocalImageMigrationCoordinator(
      journalRoot: store.directory.appendingPathComponent(
        "ImageMigrationJournal", isDirectory: true)
    ).discoverRecovery()
  }

  func configureImageSavePreparer(_ preparer: ImageSavePreparer?) {
    imageSavePreparer = preparer
  }

  func localImages() throws -> LocalImageSession {
    if let localImageSession { return localImageSession }
    guard let recoveryStore else { throw CocoaError(.fileNoSuchFile) }
    let root = recoveryStore.directory.appendingPathComponent("LocalImages", isDirectory: true)
    let session = try LocalImageStore(root: root).begin(
      documentID: recoveryID.uuidString.lowercased(), sessionID: recoveryID)
    localImageSession = session
    return session
  }

  var pendingRecoveredImages: [LocalImageAsset] {
    guard let session = try? localImages() else { return [] }
    return session.assets.filter {
      $0.insertion == .pending
        && ($0.importIntent?.recoveryState == .requiresConfirmation
          || $0.recoveryDisposition != nil)
    }
  }

  func rememberImageDirectory(
    _ directory: URL,
    for documentURL: URL,
    role: String,
    access: AssetDirectoryAccess
  ) throws {
    guard let recoveryStore else { throw CocoaError(.fileNoSuchFile) }
    let store = AssetBookmarkStore(
      url: recoveryStore.directory.appendingPathComponent(
        "LocalImages/\(recoveryID.uuidString.lowercased())-bookmarks.json")
    )
    try store.remember(directory, role: role, access: access)
    if role == "document-directory" || role == "document-read-directory" {
      try AssetBookmarkStore(
        url: recoveryStore.directory.appendingPathComponent(
          "LocalImages/Documents/\(Self.imageDocumentKey(documentURL)).json")
      ).remember(directory, role: role, access: access)
    }
  }

  func restoredImageDirectory(role: String, for documentURL: URL) -> URL? {
    try? resolveImageDirectory(role: role, for: documentURL)
  }

  func resolveImageDirectory(role: String, for documentURL: URL) throws -> URL? {
    guard let recoveryStore else { return nil }
    if role == "document-directory" || role == "document-read-directory",
      let directory = try AssetBookmarkStore(
        url: recoveryStore.directory.appendingPathComponent(
          "LocalImages/Documents/\(Self.imageDocumentKey(documentURL)).json")
      ).resolve(role: role)
    {
      return directory
    }
    return try AssetBookmarkStore(
      url: recoveryStore.directory.appendingPathComponent(
        "LocalImages/\(recoveryID.uuidString.lowercased())-bookmarks.json")
    ).resolve(role: role)
  }

  private static func imageDocumentKey(_ url: URL) -> String {
    RecoveryFingerprint.hash(Data(url.standardizedFileURL.absoluteString.utf8))
  }

  func importLocalImage(
    fileURL: URL,
    preferredName: String? = nil,
    authorizedDirectory: URL?,
    importIntent: LocalImageAsset.ImportIntent? = nil
  ) throws -> LocalImageAsset {
    let sourceAccessed = fileURL.startAccessingSecurityScopedResource()
    let directoryAccessed = authorizedDirectory?.startAccessingSecurityScopedResource() ?? false
    defer {
      if sourceAccessed { fileURL.stopAccessingSecurityScopedResource() }
      if directoryAccessed { authorizedDirectory?.stopAccessingSecurityScopedResource() }
    }
    return try localImages().importFile(
      from: fileURL, preferredName: preferredName, documentURL: self.fileURL,
      authorizedDirectory: authorizedDirectory, importIntent: importIntent)
  }

  func importPastedPNG(
    _ data: Data,
    preferredName: String = "Pasted Image.png",
    authorizedDirectory: URL?,
    importIntent: LocalImageAsset.ImportIntent? = nil
  ) throws -> LocalImageAsset {
    let directoryAccessed = authorizedDirectory?.startAccessingSecurityScopedResource() ?? false
    defer { if directoryAccessed { authorizedDirectory?.stopAccessingSecurityScopedResource() } }
    return try localImages().importBitmapPNG(
      data, preferredName: preferredName, documentURL: fileURL,
      authorizedDirectory: authorizedDirectory, importIntent: importIntent)
  }

  func prepareLocalImagesForSave(
    documentURL: URL,
    authorizedDirectory: URL,
    snapshot: BridgeSnapshot
  ) throws -> LocalImageSavePlan? {
    let ownership = try snapshot.requireImageOwnership()
    let session = try localImages()
    guard
      session.assets.contains(where: {
        ($0.state == .draft || $0.state == .awaitingMarkdown)
          && $0.insertion == .accepted
          && ownership.imageURIs.contains($0.markdownURI)
      })
    else { return nil }
    let accessed = authorizedDirectory.startAccessingSecurityScopedResource()
    defer { if accessed { authorizedDirectory.stopAccessingSecurityScopedResource() } }
    return try session.prepareFirstSave(
      documentURL: documentURL, authorizedDirectory: authorizedDirectory,
      ownerURIs: ownership.imageURIs)
  }

  var text: String {
    textStorage.get()
  }

  var isBareCRReadOnly: Bool { Self.containsBareCR(textStorage.get()) }

  // Native save/recovery gate mirrors line-endings.ts's bare_cr classification.
  // Scan UTF-8: Swift Character treats CRLF as one grapheme cluster.
  private nonisolated static func containsBareCR(_ text: String) -> Bool {
    let bytes = Array(text.utf8)
    return bytes.indices.contains {
      bytes[$0] == 13 && ($0 + 1 == bytes.count || bytes[$0 + 1] != 10)
    }
  }

  /// Explicit, irreversible session boundary. Disk bytes remain untouched until Save.
  func convertBareCRToLF() {
    guard isBareCRReadOnly, !saveInProgress else { return }
    textStorage.set(
      text.replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n"))
    bridgeDocumentID = UUID().uuidString
    revisionStorage.set(0)
    recoveredUnsaved = true
    synchronizeEditedState(true)
    editorViewController?.reloadDocument()
    refreshFileState()
    scheduleRecovery()
  }

  var bridgeRevision: Int {
    revisionStorage.get()
  }

  override class var autosavesInPlace: Bool {
    false
  }

  override func makeWindowControllers() {
    let editorViewController = EditorViewController(
      document: self,
      resourceBundle: editorResourceBundle
    )
    let window = NSWindow(contentViewController: editorViewController)
    window.setContentSize(NSSize(width: 900, height: 700))
    window.minSize = NSSize(width: 480, height: 320)
    window.title = displayName
    window.setAccessibilityIdentifier("DocumentWindow")
    // Automatic NSDocument state restoration is off: the launch policy
    // (LastDocumentRestoreController) reopens exactly the last successfully
    // opened document instead of every window that existed at quit. Window
    // geometry still survives relaunches via the frame autosave name.
    window.isRestorable = false
    // AppKit permits only one live window per autosave name. A per-file
    // name lets a document retain its frame even while Untitled stays open.
    let frameName =
      fileURL.map { "InkoraDocumentWindow-" + $0.resolvingSymlinksInPath().absoluteString }
      ?? "InkoraDocumentWindow"
    window.setFrameUsingName(frameName)
    window.setFrameAutosaveName(frameName)
    if Bundle.main.bundleIdentifier == "com.huruizhi.Inkora.UITesting",
      ProcessInfo.processInfo.environment["INKORA_TEST_FIXED_PRESENTATION"] == "1"
    {
      window.appearance = NSAppearance(named: .aqua)
      window.setContentSize(NSSize(width: 900, height: 700))
      window.setFrameOrigin(NSPoint(x: 80, y: 80))
    }

    let windowController = NSWindowController(window: window)
    addWindowController(windowController)
    self.editorViewController = editorViewController
    refreshFileState()
    snapshotRequester = editorViewController.requestSnapshot
    if encodingError != nil, let url = fileURL {
      // AppKit notes the URL into Open Recent before makeWindowControllers
      // runs. A read-only encoding error is not a successfully opened
      // document, so the entry is withdrawn right away (INK-053 policy).
      RecentDocumentNoter.shared.withdrawDocumentOpened(url)
    }
  }

  override func read(from data: Data, ofType typeName: String) throws {
    if data.starts(with: Self.utf32LEBOM) || data.starts(with: Self.utf32BEBOM) {
      enterEncodingError(.utf32Detected)
      return
    }
    if data.starts(with: Self.utf16LEBOM) || data.starts(with: Self.utf16BEBOM) {
      enterEncodingError(.utf16Detected)
      return
    }
    // ENC-001: a leading UTF-8 BOM is allowed; its presence is document state.
    // Strip it before decoding and re-emit it on every write path.
    let hasBOM = data.starts(with: Self.utf8BOM)
    let body = hasBOM ? data.dropFirst(Self.utf8BOM.count) : data[...]
    guard let decoded = String(data: body, encoding: .utf8) else {
      enterEncodingError(.invalidUTF8)
      return
    }
    encodingErrorStorage.set(nil)
    textStorage.set(decoded)
    bomStorage.set(hasBOM)
    revisionStorage.set(0)
  }

  /// ENC-002: never guess a conversion and never show mojibake. The original
  /// bytes stay untouched on disk while the document opens read-only with
  /// the detected reason.
  private nonisolated func enterEncodingError(_ error: InkoraDocumentError) {
    encodingErrorStorage.set(error)
    textStorage.set("")
    bomStorage.set(false)
    revisionStorage.set(0)
  }

  override func read(from url: URL, ofType typeName: String) throws {
    let accessed = url.startAccessingSecurityScopedResource()
    defer {
      if accessed {
        url.stopAccessingSecurityScopedResource()
      }
    }
    let version = try DocumentDiskVersion(url: url)
    try read(from: version.data, ofType: typeName)
    diskVersion = version
    fileModificationDate = version.modified
    MainActor.assumeIsolated {
      guard encodingErrorStorage.get() == nil else { return }
      openHistory.noteDocumentOpened(url)
      RecentDocumentNoter.shared.noteDocumentOpened(url)
    }
  }

  override func data(ofType typeName: String) throws -> Data {
    if let encodingError { throw encodingError }
    if isBareCRReadOnly { throw DocumentFileState.bareCR }
    return encodedDocumentData()
  }

  override func write(
    to url: URL,
    ofType typeName: String,
    for saveOperation: NSDocument.SaveOperationType,
    originalContentsURL absoluteOriginalContentsURL: URL?
  ) throws {
    let accessed = url.startAccessingSecurityScopedResource()
    defer {
      if accessed {
        url.stopAccessingSecurityScopedResource()
      }
    }
    // NSDocument invokes this inside its coordinated safe-save operation. Check
    // the original again, after the asynchronous snapshot and before writing.
    // This override is nonisolated, so read the lock-guarded storage directly.
    if let encodingError = encodingErrorStorage.get() { throw encodingError }
    if Self.containsBareCR(textStorage.get()) { throw DocumentFileState.bareCR }
    if saveOperation == .saveOperation,
      let original = absoluteOriginalContentsURL, original == fileURL
    {
      try validateOriginalForSaving()
    }
    try dataWriter.write(encodedDocumentData(), to: url)
  }

  private func encodedDocumentData() -> Data {
    let body = Data(textStorage.get().utf8)
    guard bomStorage.get() else { return body }
    return Self.utf8BOM + body
  }

  override func save(
    to url: URL,
    ofType typeName: String,
    for saveOperation: NSDocument.SaveOperationType,
    completionHandler: @escaping (Error?) -> Void
  ) {
    // ENC-002 read-only error state: saving anywhere would either overwrite
    // the untouched original bytes with an empty buffer or write mojibake.
    if let encodingError {
      completionHandler(encodingError)
      return
    }
    guard !isBareCRReadOnly else {
      completionHandler(DocumentFileState.bareCR)
      return
    }
    pendingSaves.append(
      PendingSave(
        url: url,
        typeName: typeName,
        operation: saveOperation,
        completion: completionHandler
      )
    )
    processNextSave()
  }

  func editorDidChangeState(_ state: BridgeEditorState) {
    guard !isBareCRReadOnly, encodingError == nil else { return }
    guard state.documentID == bridgeDocumentID else { return }
    guard state.revision >= revisionStorage.get() else { return }
    let dirty = state.dirty || missingOriginal || recoveredUnsaved
    let recoveryChanged = state.revision > revisionStorage.get() || dirty != isDocumentEdited
    revisionStorage.set(state.revision)
    synchronizeEditedState(dirty)
    if recoveryChanged { scheduleRecovery() }

  }

  // ProseMirror owns history. Native change count is a boolean projection of its
  // saved baseline, not a second undo stack (revisions also increase on Undo).
  private func synchronizeEditedState(_ dirty: Bool) {
    let dirty = dirty && !isBareCRReadOnly && encodingError == nil
    guard dirty != isDocumentEdited else { return }
    updateChangeCount(dirty ? .changeDone : .changeCleared)
  }

  func prepareForClose(completion: @escaping (Error?) -> Void) {
    // The encoding error state has no editor session to snapshot and is
    // never dirty, so closing needs no save review at all.
    guard encodingError == nil, !isBareCRReadOnly else {
      completion(nil)
      return
    }
    guard let editorViewController else {
      completion(nil)
      return
    }
    editorViewController.requestSnapshot { result in
      switch result {
      case .success:
        completion(nil)
      case .failure(let error):
        completion(error)
      }
    }
  }

  override func canClose(
    withDelegate delegate: Any?,
    shouldClose shouldCloseSelector: Selector?,
    contextInfo: UnsafeMutableRawPointer?
  ) {
    prepareForClose { [self] error in
      if let error {
        presentError(error)
        if let target = delegate as? NSObject, let selector = shouldCloseSelector {
          typealias Callback =
            @convention(c) (
              AnyObject, Selector, NSDocument, Bool, UnsafeMutableRawPointer?
            ) -> Void
          let callback = unsafeBitCast(target.method(for: selector), to: Callback.self)
          callback(target, selector, self, false, contextInfo)
        }
        return
      }
      reviewClose(
        withDelegate: delegate, shouldClose: shouldCloseSelector, contextInfo: contextInfo)
    }
  }

  private func reviewClose(
    withDelegate delegate: Any?, shouldClose: Selector?, contextInfo: UnsafeMutableRawPointer?
  ) {
    super.canClose(withDelegate: delegate, shouldClose: shouldClose, contextInfo: contextInfo)
  }

  private func processNextSave() {
    guard !saveInProgress, let save = pendingSaves.first else { return }
    guard let snapshotRequester else {
      finishCurrentSave(EditorBridgeError.editorUnavailable)
      return
    }

    saveInProgress = true
    snapshotRequester { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure(let error):
        self.finishCurrentSave(error)
      case .success(let snapshot):
        self.prepareImagesAndPersist(snapshot, for: save, using: snapshotRequester)
      }
    }
  }

  private func prepareImagesAndPersist(
    _ snapshot: BridgeSnapshot,
    for save: PendingSave,
    using snapshotRequester: @escaping SnapshotRequester
  ) {
    if let imageSavePreparer {
      imageSavePreparer(save.url, snapshot) { [weak self] result in
        guard let self else { return }
        switch result {
        case .success(let plan):
          self.preparedImageSave = plan
          if plan?.managedPlan?.rewrites.isEmpty == false {
            self.requestSnapshotForSave(save, using: snapshotRequester)
          } else {
            self.acceptSnapshotForSave(snapshot, for: save)
          }
        case .failure(let error):
          self.finishCurrentSave(error)
        }
      }
      return
    }
    acceptSnapshotForSave(snapshot, for: save)
  }

  private func requestSnapshotForSave(
    _ save: PendingSave,
    using snapshotRequester: @escaping SnapshotRequester
  ) {
    snapshotRequester { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let snapshot):
        self.acceptSnapshotForSave(snapshot, for: save)
      case .failure(let error):
        self.finishCurrentSave(error)
      }
    }
  }

  private func acceptSnapshotForSave(_ snapshot: BridgeSnapshot, for save: PendingSave) {
    textStorage.set(snapshot.text)
    if save.url == fileURL {
      refreshFileState()
      if fileState != .current && fileState != .moved {
        resolveFileState()
        return
      }
    }
    persist(snapshot, for: save)
  }

  private func persist(_ snapshot: BridgeSnapshot, for save: PendingSave) {
    guard save.operation != .saveOperation || save.url == fileURL else {
      finishCurrentSave(DocumentFileState.moved)
      return
    }
    if save.url == fileURL {
      do { try validateOriginalForSaving() } catch {
        finishCurrentSave(error)
        return
      }
    }
    if let plan = preparedImageSave?.managedPlan {
      let accessed = plan.authorizedDirectory.startAccessingSecurityScopedResource()
      defer { if accessed { plan.authorizedDirectory.stopAccessingSecurityScopedResource() } }
      do {
        let session = try localImages()
        try session.validateMarkdownOwners(
          try snapshot.requireImageOwnership().imageURIs, for: plan)
        try session.publish(plan)
      } catch {
        finishCurrentSave(error)
        return
      }
    }
    if let sourceURL = fileURL,
      sourceURL.standardizedFileURL != save.url.standardizedFileURL,
      let sourceGrant = preparedImageSave?.sourceAuthorizedDirectory,
      let targetGrant = preparedImageSave?.targetAuthorizedDirectory,
      let recoveryStore
    {
      let sourceAccessed = sourceGrant.startAccessingSecurityScopedResource()
      let targetAccessed = targetGrant.startAccessingSecurityScopedResource()
      defer {
        if sourceAccessed { sourceGrant.stopAccessingSecurityScopedResource() }
        if targetAccessed { targetGrant.stopAccessingSecurityScopedResource() }
      }
      do {
        let ownership = try snapshot.requireImageOwnership()
        let migrator = LocalImageMigrationCoordinator(
          journalRoot: recoveryStore.directory.appendingPathComponent(
            "ImageMigrationJournal", isDirectory: true))
        let migration = try migrator.prepare(
          markdown: snapshot.text,
          ownerURIs: ownership.imageURIs,
          sourceDocumentURL: sourceURL,
          targetDocumentURL: save.url,
          sourceAuthorizedDirectory: sourceGrant,
          targetAuthorizedDirectory: targetGrant,
          excludingURIs: Set(preparedImageSave?.managedPlan?.items.map(\.targetURI) ?? []))
        try migrator.publish(migration)
        preparedImageMigration = migration
      } catch {
        finishCurrentSave(error)
        return
      }
    }
    super.save(
      to: save.url,
      ofType: save.typeName,
      for: save.operation
    ) { [weak self] error in
      guard let self else { return }
      if error == nil {
        if let session = self.localImageSession {
          if let plan = self.preparedImageSave?.managedPlan {
            try? session.confirmMarkdownCommit(plan)
          }
          try? session.retireTransferredStorageIfPossible()
        }
        if let migration = self.preparedImageMigration, let recoveryStore = self.recoveryStore {
          try? LocalImageMigrationCoordinator(
            journalRoot: recoveryStore.directory.appendingPathComponent(
              "ImageMigrationJournal", isDirectory: true)
          ).confirm(migration)
        }
        self.preparedImageSave = nil
        self.preparedImageMigration = nil
        self.invalidateRecoveryWork()
        self.recoveredUnsaved = false
        self.retireRecovery()
        self.missingOriginal = false
        if let committed = try? DocumentDiskVersion(url: save.url),
          committed.data == self.encodedDocumentData()
        {
          self.diskVersion = committed
        }
        self.refreshFileState()
        self.synchronizeEditedState(self.bridgeRevision > snapshot.revision)
        self.editorViewController?.confirmSaved(snapshot)
      }
      self.finishCurrentSave(error)
    }
  }

  func refreshFileState() {
    guard encodingError == nil else {
      // The encoding error dominates disk state: no reload prompt, no dirty
      // forcing, and no recovery scheduling for an undecodable document.
      fileState = .unsupportedEncoding
      updateFileStateSubtitle()
      return
    }
    if isBareCRReadOnly {
      fileState = .bareCR
      synchronizeEditedState(false)
      updateFileStateSubtitle()
      return
    }
    fileState = .current
    guard let url = fileURL else { return }
    let wasEdited = isDocumentEdited
    let accessed = url.startAccessingSecurityScopedResource()
    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
    do {
      let exists: Bool
      do {
        _ = try FileManager.default.attributesOfItem(atPath: url.path)
        exists = true
      } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
        exists = false
      }
      if missingOriginal || !exists {
        missingOriginal = true
        fileState = .deleted
        synchronizeEditedState(true)
      } else if let diskVersion, try DocumentDiskVersion(url: url) != diskVersion {
        fileState = .externalChange
      } else if try !DocumentFileState.isWritable(url)
        || !DocumentFileState.isWritable(url.deletingLastPathComponent(), checkAccess: false)
      {
        fileState = .readOnly
      } else {
        fileState = .current
      }
    } catch {
      fileState = .readOnly  // Fail closed if metadata or contents cannot be inspected.
    }
    updateFileStateSubtitle()
    if !wasEdited && isDocumentEdited { scheduleRecovery() }
  }

  private func updateFileStateSubtitle() {
    for controller in windowControllers {
      controller.window?.subtitle = fileState == .current ? "" : fileState.localizedDescription
      controller.window?.setAccessibilityTitle(displayName)
    }
  }

  private func validateOriginalForSaving() throws {
    if let encodingError { throw encodingError }
    if isBareCRReadOnly { throw DocumentFileState.bareCR }
    refreshFileState()
    guard fileState == .current || fileState == .moved else { throw fileState }
  }

  override func presentedItemDidChange() {
    // Do not call NSDocument's implicit revert: local edits belong to the editor.
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.saveInProgress else { return }
      self.refreshFileState()
      guard self.fileState == .externalChange, !self.reviewingFileState,
        self.editorViewController != nil
      else { return }
      self.reviewingFileState = true
      self.prepareForClose { error in
        self.reviewingFileState = false
        guard error == nil, !self.saveInProgress else { return }
        self.presentFileStateChoices(completion: {})
      }
    }
  }

  override func presentedItemDidMove(to newURL: URL) {
    super.presentedItemDidMove(to: newURL)
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.fileURL = newURL
      if newURL.pathComponents.contains(".Trash") || newURL.pathComponents.contains(".Trashes") {
        self.missingOriginal = true
        self.refreshFileState()
      } else {
        self.refreshFileState()
        if self.fileState == .current { self.fileState = .moved }
        self.updateFileStateSubtitle()
      }
    }
  }

  override func accommodatePresentedItemDeletion(completionHandler: @escaping (Error?) -> Void) {
    DispatchQueue.main.async { [weak self] in
      self?.missingOriginal = true
      self?.refreshFileState()
    }
    completionHandler(nil)
  }

  func reloadFromDisk() throws {
    guard !saveInProgress, let url = fileURL else { throw CocoaError(.userCancelled) }
    try read(from: url, ofType: fileType ?? "net.daringfireball.markdown")
    invalidateRecoveryWork()
    retireRecovery()
    recoveredUnsaved = false
    bridgeDocumentID = UUID().uuidString
    missingOriginal = false
    synchronizeEditedState(false)
    editorViewController?.reloadDocument()
    refreshFileState()
  }

  private func resolveFileState() {
    // Headless callers receive a typed error; real windows offer actionable choices.
    guard editorViewController != nil else {
      finishCurrentSave(fileState)
      return
    }
    let error = fileState
    finishCurrentSave(CocoaError(.userCancelled))
    fileState = error
    presentFileStateChoices(completion: {})
  }

  private func presentFileStateChoices(completion: @escaping () -> Void) {
    guard let window = windowControllers.first?.window, window.attachedSheet == nil else {
      completion()
      return
    }
    let conflict = fileState == .externalChange
    let alert = NSAlert()
    alert.messageText = fileState.localizedDescription
    alert.informativeText =
      conflict
      ? (isDocumentEdited
        ? "本地编辑与磁盘内容冲突。重新加载会丢弃本地编辑；保留编辑请另存为。"
        : "磁盘内容已改变。请选择重新加载，或另存当前内容。")
      : "当前内容仍保留在窗口中，请保存到其他位置。"
    alert.addButton(withTitle: conflict ? "重新加载" : "另存为…")
    if conflict { alert.addButton(withTitle: "保留编辑并另存为…") }
    alert.addButton(withTitle: "取消")
    alert.window.setAccessibilityIdentifier("FileStateDialog")
    for (index, button) in alert.buttons.enumerated() {
      button.setAccessibilityIdentifier("FileStateButton\(index)")
    }
    alert.beginSheetModal(for: window) { [weak self] response in
      guard let self else { return }
      if conflict && response == .alertFirstButtonReturn {
        do { try self.reloadFromDisk() } catch { self.presentError(error) }
      } else if (!conflict && response == .alertFirstButtonReturn)
        || (conflict && response == .alertSecondButtonReturn)
      {
        self.saveAs(nil)
      }
      completion()
    }
  }

  private func invalidateRecoveryWork() {
    recoveryEpoch += 1
    recoveryTask?.cancel()
    recoveryTask = nil
  }

  private func scheduleRecovery() {
    guard !isBareCRReadOnly, !recoveryClosed, recoveryStore != nil else { return }
    invalidateRecoveryWork()
    guard isDocumentEdited else {
      retireRecovery()
      return
    }
    recoveryTask = Task { @MainActor [weak self] in
      do { try await Task.sleep(for: .seconds(1)) } catch { return }
      self?.captureRecovery()
    }
  }

  func captureRecovery() {
    guard !isBareCRReadOnly, !recoveryClosed, recoveryStore != nil, isDocumentEdited,
      !saveInProgress,
      let requester = recoverySnapshotRequester ?? editorViewController?.requestRecoverySnapshot
    else { return }
    let epoch = recoveryEpoch
    let id = bridgeDocumentID
    // Background capture never resigns first responder. The Web runtime refuses
    // snapshots while composing; the next committed state schedules another try.
    requester { [weak self] result in
      guard let self, epoch == self.recoveryEpoch, id == self.bridgeDocumentID,
        self.isDocumentEdited, !self.saveInProgress
      else { return }
      switch result {
      case .success(let snapshot):
        do { try self.writeRecovery(snapshot) } catch { self.reportRecoveryError(error) }
      case .failure(let error):
        if case EditorBridgeError.remote(.editorNotReady, _, _) = error {
          // A cancelled composition may publish no change. Retry later without
          // committing it, so earlier dirty edits still get a durable draft.
          self.scheduleRecovery()
        }
      }
    }
  }

  enum RecoveryPersistenceResult: Equatable {
    case persisted(RecoveryStore.WriteReceipt)
    case rejected
  }

  @discardableResult
  func writeRecovery(
    _ snapshot: BridgeSnapshot, requireExactReceipt: Bool = false
  ) throws -> RecoveryPersistenceResult {
    guard !isBareCRReadOnly, !recoveryClosed, let recoveryStore,
      snapshot.documentID == bridgeDocumentID,
      snapshot.revision >= bridgeRevision, isDocumentEdited
    else { return .rejected }
    let data = (bomStorage.get() ? Self.utf8BOM : Data()) + Data(snapshot.text.utf8)
    let source = fileURL ?? recoverySourceURL
    let fingerprint =
      diskVersion.map { RecoveryFingerprint(data: $0.data, modified: $0.modified) }
      ?? recoverySourceFingerprint
    let accessed = source?.startAccessingSecurityScopedResource() ?? false
    defer { if accessed { source?.stopAccessingSecurityScopedResource() } }
    let bookmark = try? source?.bookmarkData(
      options: [.withSecurityScope, .securityScopeAllowOnlyReadAccess],
      includingResourceValuesForKeys: nil, relativeTo: nil)
    let draft = RecoveryDraft(
      id: recoveryID, revision: snapshot.revision, data: data,
      sourceURL: source, sourceFingerprint: fingerprint, bookmark: bookmark)
    let receipt = try recoveryStore.write(
      draft, requireExactRevision: requireExactReceipt)
    guard receipt.draftID == recoveryID, receipt.revision == snapshot.revision,
      receipt.payloadHash == draft.payloadHash
    else { return .rejected }
    lastRecoveryData = data
    recoveryError = nil
    #if DEBUG
      let args = ProcessInfo.processInfo.arguments
      if UUID(uuidString: recoveryStore.directory.lastPathComponent) != nil,
        args.contains("--inkora-test-crash-after-draft")
      {
        // Simulate a killed process only inside an isolated UI-test recovery session.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { _exit(99) }
      }
    #endif
    return .persisted(receipt)
  }

  func persistRecoveredImageHandoff(
    _ snapshot: BridgeSnapshot,
    assetID: UUID,
    freshIntent: LocalImageAsset.ImportIntent
  ) throws {
    let session = try localImages()
    guard snapshot.documentID == bridgeDocumentID,
      let asset = session.assets.first(where: { $0.id == assetID }),
      asset.recoveryIntent == freshIntent,
      try snapshot.requireImageOwnership().imageURIs.contains(asset.markdownURI)
    else { throw LocalImageError.unresolvedMarkdownOwner }
    guard case .persisted = try writeRecovery(snapshot, requireExactReceipt: true) else {
      throw LocalImageError.unresolvedMarkdownOwner
    }
    try session.completeRecoveredInsertion(assetID: assetID, freshIntent: freshIntent)
  }

  private func retireRecovery() {
    guard let recoveryStore else { return }
    do {
      try recoveryStore.retire(recoveryID)
      lastRecoveryData = nil
      recoveryError = nil
    } catch { reportRecoveryError(error) }
  }

  private func reportRecoveryError(_ error: Error) {
    recoveryError = error
    for controller in windowControllers {
      controller.window?.subtitle = "恢复草稿写入或清理失败；请手动保存"
      controller.window?.setAccessibilityTitle(displayName)
    }
  }

  func finishRecoveryForNormalTermination() {
    recoveryClosed = true
    invalidateRecoveryWork()
    retireRecovery()
  }

  override func close() {
    finishRecoveryForNormalTermination()
    super.close()
  }

  private func finishCurrentSave(_ error: Error?) {
    guard !pendingSaves.isEmpty else { return }
    let save = pendingSaves.removeFirst()
    if error != nil {
      preparedImageSave = nil
      preparedImageMigration = nil
    }
    saveInProgress = false
    save.completion(error)
    processNextSave()
    if pendingSaves.isEmpty && isDocumentEdited { scheduleRecovery() }
  }
}

private final class DocumentTextStorage: @unchecked Sendable {
  private let lock = NSLock()
  private var text = ""

  func get() -> String {
    lock.withLock { text }
  }

  func set(_ updatedText: String) {
    lock.withLock {
      text = updatedText
    }
  }
}

private final class DocumentBOMStorage: @unchecked Sendable {
  private let lock = NSLock()
  private var present = false

  func get() -> Bool {
    lock.withLock { present }
  }

  func set(_ updatedPresent: Bool) {
    lock.withLock {
      present = updatedPresent
    }
  }
}

private final class DocumentRevisionStorage: @unchecked Sendable {
  private let lock = NSLock()
  private var revision = 0

  func get() -> Int {
    lock.withLock { revision }
  }

  func set(_ updatedRevision: Int) {
    lock.withLock {
      revision = updatedRevision
    }
  }
}

private final class DocumentEncodingErrorStorage: @unchecked Sendable {
  private let lock = NSLock()
  private var error: InkoraDocumentError?

  func get() -> InkoraDocumentError? {
    lock.withLock { error }
  }

  func set(_ updatedError: InkoraDocumentError?) {
    lock.withLock { error = updatedError }
  }
}
