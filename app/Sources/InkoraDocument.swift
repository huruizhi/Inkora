import AppKit

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

  func preserveDirtyForEditorRecovery() {
    // A replayed snapshot initializes a clean Web session, but it is not a disk save.
    recoveredUnsaved = recoveredUnsaved || isDocumentEdited
  }

  func configureRecovery(store: RecoveryStore, snapshotRequester: SnapshotRequester? = nil) {
    recoveryStore = store
    recoverySnapshotRequester = snapshotRequester
  }

  var text: String {
    textStorage.get()
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
    guard dirty != isDocumentEdited else { return }
    updateChangeCount(dirty ? .changeDone : .changeCleared)
  }

  func prepareForClose(completion: @escaping (Error?) -> Void) {
    // The encoding error state has no editor session to snapshot and is
    // never dirty, so closing needs no save review at all.
    guard encodingError == nil else {
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
      case .success(let snapshot):
        self.textStorage.set(snapshot.text)
        if save.url == self.fileURL {
          self.refreshFileState()
          if self.fileState != .current && self.fileState != .moved {
            self.resolveFileState()
            return
          }
        }
        self.persist(snapshot, for: save)
      case .failure(let error):
        self.finishCurrentSave(error)
      }
    }
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
    super.save(
      to: save.url,
      ofType: save.typeName,
      for: save.operation
    ) { [weak self] error in
      guard let self else { return }
      if error == nil {
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
    guard !recoveryClosed, recoveryStore != nil else { return }
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
    guard !recoveryClosed, recoveryStore != nil, isDocumentEdited, !saveInProgress,
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

  func writeRecovery(_ snapshot: BridgeSnapshot) throws {
    guard !recoveryClosed, let recoveryStore, snapshot.documentID == bridgeDocumentID,
      snapshot.revision >= bridgeRevision, isDocumentEdited
    else { return }
    let data = (bomStorage.get() ? Self.utf8BOM : Data()) + Data(snapshot.text.utf8)
    guard data != lastRecoveryData else { return }
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
    try recoveryStore.write(draft)
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
