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

  private let current: () -> Context?
  private let chooseFolder: (@escaping (URL?) -> Void) -> Void
  private let openFile: (URL, FolderAccess, @escaping (Error?) -> Void) -> Void
  private let mayOpen: (Context, @escaping (Bool) -> Void) -> Void
  private weak var webView: WKWebView?
  private var contextID = UUID().uuidString
  private var access: FolderAccess?
  private var catalog: SidebarCatalog?
  private var scanTask: Task<SidebarCatalog, Error>?
  private var searchTask: Task<SidebarSearchResult, Error>?
  private var scanID = UUID()
  private var searchID = UUID()

  init(
    current: @escaping () -> Context?,
    chooseFolder: @escaping (@escaping (URL?) -> Void) -> Void,
    mayOpen: @escaping (Context, @escaping (Bool) -> Void) -> Void,
    openFile: @escaping (URL, FolderAccess, @escaping (Error?) -> Void) -> Void
  ) {
    self.current = current
    self.chooseFolder = chooseFolder
    self.mayOpen = mayOpen
    self.openFile = openFile
  }

  func attach(_ webView: WKWebView) { self.webView = webView }
  func useFolder(_ access: FolderAccess?) { self.access = access }

  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.frameInfo.isMainFrame,
      message.frameInfo.request.url?.scheme == EditorResourceSchemeHandler.scheme,
      let text = message.body as? String, text.utf8.count <= 16_384,
      let request = try? JSONDecoder().decode(Request.self, from: Data(text.utf8)),
      !request.requestID.isEmpty, request.requestID.utf8.count <= 200,
      let binding = current(), request.documentID == binding.documentID,
      request.revision >= 0, request.revision <= BridgeProtocolV1.maxSafeRevision
    else { return }
    if request.action == .ready {
      contextID = UUID().uuidString
      send(
        Reply(
          requestID: request.requestID, documentID: binding.documentID, contextID: contextID,
          kind: "ready"))
      if let catalog {
        sendCatalog(catalog, request: request)
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
      mayOpen(binding) { [weak self] allowed in
        guard let self, allowed, self.current() == binding else { return }
        let context = self.contextID
        self.chooseFolder { [weak self] url in
          guard let self, let url, self.current()?.documentID == binding.documentID,
            self.contextID == context
          else { return }
          self.access = FolderAccess(url)
          self.scan(request)
        }
      }
    case .refresh: scan(request)
    case .search:
      guard let catalog, request.catalogID == catalog.id, let query = request.query,
        let options = request.options, query.utf16.count <= 2_000
      else {
        reject(request, "文档列表已变化，请刷新后搜索。")
        return
      }
      searchTask?.cancel()
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
      mayOpen(binding) { [weak self] allowed in
        guard let self, allowed, self.matches(request), self.current() == binding else { return }
        do {
          let file = try catalog.openFile(id: fileID, catalogID: catalog.id)
          self.openFile(file.url, access) { [weak self] error in
            if let error { self?.reject(request, error.localizedDescription) }
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
    let generation = UUID()
    scanID = generation
    let task = Task.detached(priority: .userInitiated) {
      // Capturing the lease keeps its grant active through cancellation and read completion.
      try SidebarCatalog.scan(folder: access.url, cancelled: { Task.isCancelled })
    }
    scanTask = task
    Task { [weak self] in
      let result = await task.result
      guard let self, self.scanID == generation, self.matches(request) else { return }
      switch result {
      case .success(let catalog):
        self.catalog = catalog
        self.sendCatalog(catalog, request: request)
      case .failure(let error): self.reject(request, error.localizedDescription)
      }
    }
  }

  private func matches(_ request: Request) -> Bool {
    current()?.documentID == request.documentID && request.contextID == contextID
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
    webView?.evaluateJavaScript("window.inkoraSidebar?.receive(\(text))", completionHandler: nil)
  }
}
