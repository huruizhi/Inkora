import AppKit

enum InkoraDocumentError: LocalizedError {
  case invalidUTF8

  var errorDescription: String? {
    "Inkora currently supports UTF-8 Markdown files only."
  }
}

@objc(InkoraDocument)
final class InkoraDocument: NSDocument {
  let bridgeDocumentID = UUID().uuidString
  private let editorResourceBundle: Bundle
  private let revisionStorage = DocumentRevisionStorage()
  private let textStorage = DocumentTextStorage()
  private weak var editorViewController: EditorViewController?

  override init() {
    editorResourceBundle = .main
    super.init()
  }

  init(editorResourceBundle: Bundle) {
    self.editorResourceBundle = editorResourceBundle
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
    try super.write(
      to: url,
      ofType: typeName,
      for: saveOperation,
      originalContentsURL: absoluteOriginalContentsURL
    )
  }

  override func save(
    to url: URL,
    ofType typeName: String,
    for saveOperation: NSDocument.SaveOperationType,
    completionHandler: @escaping (Error?) -> Void
  ) {
    guard let editorViewController else {
      completionHandler(EditorBridgeError.editorUnavailable)
      return
    }

    editorViewController.requestText { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let text):
        self.textStorage.set(text)
        self.saveSnapshot(
          to: url,
          ofType: typeName,
          for: saveOperation,
          completionHandler: completionHandler
        )
      case .failure(let error):
        completionHandler(error)
      }
    }
  }

  func editorDidChangeState(_ state: BridgeEditorState) {
    guard state.documentID == bridgeDocumentID else { return }
    guard state.revision > revisionStorage.get() else { return }
    revisionStorage.set(state.revision)
    if state.dirty {
      updateChangeCount(.changeDone)
    }
  }

  private func saveSnapshot(
    to url: URL,
    ofType typeName: String,
    for saveOperation: NSDocument.SaveOperationType,
    completionHandler: @escaping (Error?) -> Void
  ) {
    super.save(
      to: url,
      ofType: typeName,
      for: saveOperation,
      completionHandler: completionHandler
    )
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
