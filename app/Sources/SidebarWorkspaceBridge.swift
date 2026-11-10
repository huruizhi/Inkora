import Foundation
import WebKit

/// UI-only messages stay separate from the document save/history protocol.
@MainActor
final class SidebarWorkspaceBridge: NSObject, WKScriptMessageHandler {
  struct Context: Equatable {
    let documentID: String
    let revision: Int
  }

  private struct Request: Decodable {
    enum Action: String, Decodable { case ready, chooseFolder, refresh, search, open }
    let action: Action
    let requestID: String
    let documentID: String
    let revision: Int
    var contextID: String?
    let catalogID: String?
    let fileID: String?
    let hitID: String?
    let query: String?
    let options: SidebarSearchOptions?
  }

  private struct CatalogReply: Encodable {
    let id: String
    let rootName: String
    let files: [SidebarFile]
    let incomplete: Bool
    let skippedFiles: Int
  }

  private struct Reply: Encodable {
    let requestID: String
    let documentID: String
    let contextID: String
    let kind: String
    var catalog: CatalogReply?
    var result: SidebarSearchResult?
    var query: String?
    var message: String?
    var catalogID: String?
  }

  final class FolderAccess: @unchecked Sendable {
    let url: URL
    private let active: Bool
    init(_ url: URL) {
      self.url = url
      active = url.startAccessingSecurityScopedResource()
    }
    deinit { if active { url.stopAccessingSecurityScopedResource() } }
  }

  private let replySink: ((String) -> Void)?
  private let current: () -> Context?
  private let chooseFolder: (@escaping (URL?) -> Void) -> Void
  private let openFile: (URL, FolderAccess, @escaping (Error?) -> Void) -> Void
  private let openVerifiedFile:
    ((SidebarCatalog.OpenedFile, FolderAccess, @escaping (Error?) -> Void) -> Void)?
  private let mayOpen: (Context, @escaping (Bool) -> Void) -> Void
  private weak var webView: WKWebView?
  private var contextID = UUID().uuidString
  private var access: FolderAccess?
  private var catalog: SidebarCatalog?
  private var scanTask: Task<SidebarCatalog, Error>?
  private var searchTask: Task<SidebarSearchResult, Error>?
  private var scanID = UUID()
  private var searchID = UUID()
  private var navigationID = UUID()
  private var searchHits: [String: SidebarSearchHit] = [:]
  private var watcher: Timer?
  private var watchTask: Task<SidebarCatalog, Error>?
  private var invalidated = false

  init(
    current: @escaping () -> Context?,
    chooseFolder: @escaping (@escaping (URL?) -> Void) -> Void,
    mayOpen: @escaping (Context, @escaping (Bool) -> Void) -> Void,
    openFile: @escaping (URL, FolderAccess, @escaping (Error?) -> Void) -> Void,
    openVerifiedFile: (
      (SidebarCatalog.OpenedFile, FolderAccess, @escaping (Error?) -> Void) -> Void
    )? = nil,
    replySink: ((String) -> Void)? = nil
  ) {
    self.replySink = replySink
    self.current = current
    self.chooseFolder = chooseFolder
    self.mayOpen = mayOpen
    self.openFile = openFile
    self.openVerifiedFile = openVerifiedFile
  }

  deinit {
    scanTask?.cancel()
    searchTask?.cancel()
    watchTask?.cancel()
    watcher?.invalidate()
  }

  func attach(_ webView: WKWebView) {
    cancelPending()
    self.webView = webView
    contextID = UUID().uuidString
  }

  func useFolder(_ access: FolderAccess?) {
    cancelPending()
    self.access = access
    catalog = nil
  }

  private func cancelPending() {
    scanTask?.cancel()
    searchTask?.cancel()
    watchTask?.cancel()
    watcher?.invalidate()
    watcher = nil
    watchTask = nil
    scanID = UUID()
    searchID = UUID()
    navigationID = UUID()
    searchHits.removeAll()
  }

  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    let trusted =
      message.frameInfo.isMainFrame && message.webView === webView
      && message.frameInfo.securityOrigin.protocol == EditorResourceSchemeHandler.scheme
      && message.frameInfo.securityOrigin.host == "app"
      && message.frameInfo.request.url?.scheme == EditorResourceSchemeHandler.scheme
      && message.frameInfo.request.url?.host == "app"
    guard let text = message.body as? String else { return }
    receive(text, trustedMainFrame: trusted)
  }

  // Hostless seam; production trust is derived only from WK frame identity above.
  func receive(_ text: String, trustedMainFrame: Bool) {
    guard trustedMainFrame, text.utf8.count <= 16_384,
      let request = try? JSONDecoder().decode(Request.self, from: Data(text.utf8)),
      !request.requestID.isEmpty, request.requestID.utf8.count <= 200,
      let binding = current(), request.documentID == binding.documentID,
      request.revision == binding.revision, request.revision >= 0,
      request.revision <= BridgeProtocolV1.maxSafeRevision
    else { return }
    if request.action == .ready {
      cancelPending()
      contextID = UUID().uuidString
      send(
        Reply(
          requestID: request.requestID, documentID: binding.documentID, contextID: contextID,
          kind: "ready"))
      if let catalog {
        sendCatalog(catalog, request: request)
        startWatching()
      } else if access != nil {
        var bound = request
        bound.contextID = contextID
        scan(bound)
      }
      return
    }
    guard request.contextID == contextID else { return }
    switch request.action {
    case .ready: break
    case .chooseFolder:
      let generation = UUID()
      navigationID = generation
      mayOpen(binding) { [weak self] allowed in
        guard let self, allowed, self.current() == binding, self.navigationID == generation else {
          return
        }
        let context = self.contextID
        self.chooseFolder { [weak self] url in
          guard let self, let url, self.current()?.documentID == binding.documentID,
            self.contextID == context, self.navigationID == generation, self.current() == binding
          else { return }
          self.useFolder(FolderAccess(url))
          self.scan(request)
        }
      }
    case .refresh: scan(request)
    case .search:
      searchTask?.cancel()
      searchID = UUID()
      searchHits.removeAll()
      guard let catalog, request.catalogID == catalog.id, let query = request.query,
        let options = request.options, query.utf16.count <= 2_000
      else {
        reject(request, "文档列表已变化，请刷新后搜索。")
        return
      }
      searchTask?.cancel()
      searchHits.removeAll()
      let generation = UUID()
      searchID = generation
      let task = Task.detached(priority: .userInitiated) {
        try catalog.search(query, options: options, cancelled: { Task.isCancelled })
      }
      searchTask = task
      Task { [weak self] in
        let result = await task.result
        guard let self, self.searchID == generation, self.matches(request),
          self.catalog?.id == catalog.id
        else { return }
        switch result {
        case .success(let value):
          self.searchHits = Dictionary(uniqueKeysWithValues: value.hits.map { ($0.hitID, $0) })
          self.send(
            Reply(
              requestID: request.requestID, documentID: request.documentID,
              contextID: self.contextID, kind: "search", result: value, query: query))
        case .failure(let error): self.reject(request, error.localizedDescription)
        }
      }
    case .open:
      guard request.revision == binding.revision, let catalog, let access,
        request.catalogID == catalog.id, let fileID = request.fileID
      else {
        reject(request, "文档或列表已变化，请重新选择。")
        return
      }
      let generation = UUID()
      navigationID = generation
      let hit = request.hitID.flatMap { searchHits[$0] }
      guard request.hitID == nil || hit?.fileID == fileID else {
        reject(request, "搜索结果已变化，请重新搜索。")
        return
      }
      mayOpen(binding) { [weak self] allowed in
        guard let self, allowed, self.matches(request), self.current() == binding,
          self.navigationID == generation, self.catalog?.id == catalog.id
        else { return }
        do {
          let file = try catalog.openFile(id: fileID, catalogID: catalog.id, hit: hit)
          let completion: (Error?) -> Void = { [weak self] error in
            guard let self, self.navigationID == generation, self.matches(request),
              self.catalog?.id == catalog.id
            else { return }
            if let error { self.reject(request, error.localizedDescription) }
          }
          if let verified = self.openVerifiedFile {
            verified(file, access, completion)
          } else {
            // Legacy callers can still open cards; precise navigation requires verified bytes.
            guard hit == nil else { throw SidebarCatalogError.staleFile }
            self.openFile(file.url, access, completion)
          }
        } catch { self.reject(request, error.localizedDescription) }
      }
    }
  }

  private func scan(_ request: Request) {
    guard let access else {
      reject(request, "请先打开一个文件夹。")
      return
    }
    scanTask?.cancel()
    searchTask?.cancel()
    searchID = UUID()
    navigationID = UUID()
    searchHits.removeAll()
    watcher?.invalidate()
    watchTask?.cancel()
    watchTask = nil
    catalog = nil
    let generation = UUID()
    scanID = generation
    let task = Task.detached(priority: .userInitiated) {
      // Capturing the lease keeps its grant active through cancellation and read completion.
      try withExtendedLifetime(access) {
        try SidebarCatalog.scan(folder: access.url, cancelled: { Task.isCancelled })
      }
    }
    scanTask = task
    Task { [weak self] in
      let result = await task.result
      guard let self, self.scanID == generation, self.matches(request) else { return }
      switch result {
      case .success(let catalog):
        self.catalog = catalog
        self.sendCatalog(catalog, request: request)
        self.startWatching()
      case .failure(let error): self.reject(request, error.localizedDescription)
      }
    }
  }

  // Polling is intentionally bounded by Catalog limits and runs off the main actor. It
  // catches nested file writes as well as directory membership changes without keeping
  // thousands of vnode descriptors open. No filesystem paths cross the Web boundary.
  private func startWatching() {
    watcher?.invalidate()
    invalidated = false
    watcher = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.pollChanges() }
    }
  }

  private func pollChanges() {
    guard !invalidated, watchTask == nil, let access, let catalog, let binding = current() else {
      return
    }
    let context = contextID
    let task = Task.detached(priority: .utility) {
      try withExtendedLifetime(access) {
        try SidebarCatalog.scan(folder: access.url, cancelled: { Task.isCancelled })
      }
    }
    watchTask = task
    Task { [weak self] in
      let result = await task.result
      guard let self, self.contextID == context, self.catalog?.id == catalog.id else { return }
      self.watchTask = nil
      let changed: Bool
      switch result {
      case .success(let next): changed = next.contentVersion != catalog.contentVersion
      case .failure: changed = true
      }
      guard changed, self.current()?.documentID == binding.documentID else { return }
      self.invalidated = true
      self.searchTask?.cancel()
      self.searchID = UUID()
      self.navigationID = UUID()
      self.searchHits.removeAll()
      self.send(
        Reply(
          requestID: UUID().uuidString, documentID: binding.documentID,
          contextID: context, kind: "invalidated", catalogID: catalog.id))
    }
  }

  private func matches(_ request: Request) -> Bool {
    current() == Context(documentID: request.documentID, revision: request.revision)
      && request.contextID == contextID
  }

  private func sendCatalog(_ catalog: SidebarCatalog, request: Request) {
    send(
      Reply(
        requestID: request.requestID, documentID: request.documentID,
        contextID: contextID, kind: "catalog",
        catalog: CatalogReply(
          id: catalog.id, rootName: catalog.root.lastPathComponent, files: catalog.files,
          incomplete: catalog.incomplete, skippedFiles: catalog.skippedFiles)))
  }

  private func reject(_ request: Request, _ message: String) {
    guard matches(request) else { return }
    send(
      Reply(
        requestID: request.requestID, documentID: request.documentID,
        contextID: contextID, kind: "error", message: message))
  }

  private func send(_ reply: Reply) {
    guard let data = try? JSONEncoder().encode(reply),
      let json = String(data: data, encoding: .utf8),
      let argument = try? JSONEncoder().encode(json),
      let text = String(data: argument, encoding: .utf8)
    else { return }
    replySink?(json)
    webView?.evaluateJavaScript("window.inkoraSidebar?.receive(\(text))", completionHandler: nil)
  }
}
