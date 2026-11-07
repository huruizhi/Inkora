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

  private static let utf8BOM = Data([0xEF, 0xBB, 0xBF])
  private static let utf32LEBOM = Data([0xFF, 0xFE, 0x00, 0x00])
  private static let utf32BEBOM = Data([0x00, 0x00, 0xFE, 0xFF])
  private static let utf16LEBOM = Data([0xFF, 0xFE])
  private static let utf16BEBOM = Data([0xFE, 0xFF])

  let bridgeDocumentID = UUID().uuidString
  private let editorResourceBundle: Bundle
  private let dataWriter: any DocumentDataWriting
  private let revisionStorage = DocumentRevisionStorage()
  private let textStorage = DocumentTextStorage()
  private let bomStorage = DocumentBOMStorage()
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
    if data.starts(with: Self.utf32LEBOM) || data.starts(with: Self.utf32BEBOM) {
      throw InkoraDocumentError.utf32Detected
    }
    if data.starts(with: Self.utf16LEBOM) || data.starts(with: Self.utf16BEBOM) {
      throw InkoraDocumentError.utf16Detected
    }
    // ENC-001: a leading UTF-8 BOM is allowed; its presence is document state.
    // Strip it before decoding and re-emit it on every write path.
    let hasBOM = data.starts(with: Self.utf8BOM)
    let body = hasBOM ? data.dropFirst(Self.utf8BOM.count) : data[...]
    guard let decoded = String(data: body, encoding: .utf8) else {
      throw InkoraDocumentError.invalidUTF8
    }
    textStorage.set(decoded)
    bomStorage.set(hasBOM)
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
    encodedDocumentData()
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
