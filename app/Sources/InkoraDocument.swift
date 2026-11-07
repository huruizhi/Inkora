import AppKit

enum InkoraDocumentError: LocalizedError {
  case invalidUTF8

  var errorDescription: String? {
    "Inkora currently supports UTF-8 Markdown files only."
  }

  var failureReason: String? {
    "The selected file is not valid UTF-8 text."
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

  let bridgeDocumentID = UUID().uuidString
  private let editorResourceBundle: Bundle
  private let dataWriter: any DocumentDataWriting
  private let revisionStorage = DocumentRevisionStorage()
  private let textStorage = DocumentTextStorage()
  private weak var editorViewController: EditorViewController?
  private var snapshotRequester: SnapshotRequester?
  private var pendingSaves: [PendingSave] = []
  private var saveInProgress = false

  override init() {
    editorResourceBundle = .main
    dataWriter = AtomicDocumentDataWriter()
    super.init()
  }

  init(editorResourceBundle: Bundle) {
    self.editorResourceBundle = editorResourceBundle
    dataWriter = AtomicDocumentDataWriter()
    super.init()
  }

  init(
    editorResourceBundle: Bundle = .main,
    snapshotRequester: @escaping SnapshotRequester,
    dataWriter: any DocumentDataWriting = AtomicDocumentDataWriter()
  ) {
    self.editorResourceBundle = editorResourceBundle
    self.snapshotRequester = snapshotRequester
    self.dataWriter = dataWriter
    super.init()
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

    let windowController = NSWindowController(window: window)
    addWindowController(windowController)
    self.editorViewController = editorViewController
    snapshotRequester = editorViewController.requestSnapshot
  }

  override func read(from data: Data, ofType typeName: String) throws {
    guard let decoded = String(data: data, encoding: .utf8) else {
      throw InkoraDocumentError.invalidUTF8
    }
    textStorage.set(decoded)
    revisionStorage.set(0)
  }

  override func read(from url: URL, ofType typeName: String) throws {
    let accessed = url.startAccessingSecurityScopedResource()
    defer {
      if accessed {
        url.stopAccessingSecurityScopedResource()
      }
    }
    try super.read(from: url, ofType: typeName)
  }

  override func data(ofType typeName: String) throws -> Data {
    Data(textStorage.get().utf8)
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
    try dataWriter.write(Data(textStorage.get().utf8), to: url)
  }

  override func save(
    to url: URL,
    ofType typeName: String,
    for saveOperation: NSDocument.SaveOperationType,
    completionHandler: @escaping (Error?) -> Void
  ) {
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
    guard state.revision > revisionStorage.get() else { return }
    revisionStorage.set(state.revision)
    if state.dirty {
      updateChangeCount(.changeDone)
    }
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
        self.persist(snapshot, for: save)
      case .failure(let error):
        self.finishCurrentSave(error)
      }
    }
  }

  private func persist(_ snapshot: BridgeSnapshot, for save: PendingSave) {
    super.save(
      to: save.url,
      ofType: save.typeName,
      for: save.operation
    ) { [weak self] error in
      guard let self else { return }
      if error == nil {
        self.editorViewController?.confirmSaved(snapshot)
      }
      self.finishCurrentSave(error)
    }
  }

  private func finishCurrentSave(_ error: Error?) {
    guard !pendingSaves.isEmpty else { return }
    let save = pendingSaves.removeFirst()
    saveInProgress = false
    save.completion(error)
    processNextSave()
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
