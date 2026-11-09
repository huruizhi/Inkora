import CryptoKit
import Darwin
import Foundation
import ImageIO
import UniformTypeIdentifiers
@preconcurrency import WebKit

enum DocumentAssetReadStatus: String, Equatable, Sendable {
  case ready
  case missing
  case denied
  case symlink
  case invalid
  case sizeLimit
  case checksumMismatch
  case unsupported
  case stale
  case unknownToken
  case ioError
}

struct DocumentAssetReadResult: Equatable, Sendable {
  let status: DocumentAssetReadStatus
  let data: Data?
  let mimeType: String?
  let sha256: String?
}

struct DocumentAssetCapability: Equatable, Sendable {
  let token: UUID
  let documentID: String
  let epoch: UUID
  let url: URL
}

protocol AssetReadScheduling: Sendable {
  func perform(_ operation: @escaping @Sendable () -> Void)
}

protocol AssetScopeLease: Sendable {
  func release()
}

protocol AssetLeaseFactory: Sendable {
  func lease(for url: URL) -> any AssetScopeLease
}

protocol AssetTaskDelivery: Sendable {
  func async(_ block: @escaping @Sendable () -> Void)
  func sync(_ block: @escaping @Sendable () -> Void)
}

private struct QueueAssetScheduler: AssetReadScheduling {
  let queue = DispatchQueue(label: "inkora.asset.read", attributes: .concurrent)
  func perform(_ operation: @escaping @Sendable () -> Void) { queue.async(execute: operation) }
}

private final class SecurityScopedAssetLease: AssetScopeLease, @unchecked Sendable {
  private let url: URL
  private let lock = NSLock()
  private var active: Bool

  init(url: URL) {
    self.url = url
    active = url.startAccessingSecurityScopedResource()
  }

  func release() {
    let shouldStop = lock.withLock { () -> Bool in
      guard active else { return false }
      active = false
      return true
    }
    if shouldStop { url.stopAccessingSecurityScopedResource() }
  }

  deinit { release() }
}

private struct SecurityScopedAssetLeaseFactory: AssetLeaseFactory {
  func lease(for url: URL) -> any AssetScopeLease { SecurityScopedAssetLease(url: url) }
}

private struct MainAssetDelivery: AssetTaskDelivery {
  func async(_ block: @escaping @Sendable () -> Void) { DispatchQueue.main.async(execute: block) }
  func sync(_ block: @escaping @Sendable () -> Void) {
    if Thread.isMainThread { block() } else { DispatchQueue.main.sync(execute: block) }
  }
}

final class DocumentAssetBroker: @unchecked Sendable {
  private struct Entry: Sendable {
    let documentID: String
    let epoch: UUID
    let rootURL: URL
    let components: [String]
    let sha256: String
    let mimeType: String
  }

  private let lock = NSLock()
  private let maximumBytes: Int
  private let scheduler: any AssetReadScheduling
  private let leaseFactory: any AssetLeaseFactory
  private var currentDocumentID: String?
  private var currentEpoch = UUID()
  private var entries: [UUID: Entry] = [:]
  private var staleTokens = Set<UUID>()

  init(
    maximumBytes: Int = 25 * 1024 * 1024,
    scheduler: any AssetReadScheduling = QueueAssetScheduler(),
    leaseFactory: any AssetLeaseFactory = SecurityScopedAssetLeaseFactory()
  ) {
    self.maximumBytes = maximumBytes
    self.scheduler = scheduler
    self.leaseFactory = leaseFactory
  }

  @discardableResult
  func beginDocument(documentID: String) -> UUID {
    precondition(!documentID.isEmpty)
    return lock.withLock {
      staleTokens.formUnion(entries.keys)
      entries.removeAll()
      currentDocumentID = documentID
      currentEpoch = UUID()
      return currentEpoch
    }
  }

  func revoke() {
    lock.withLock {
      staleTokens.formUnion(entries.keys)
      entries.removeAll()
      currentDocumentID = nil
      currentEpoch = UUID()
    }
  }

  func register(
    documentID: String,
    epoch: UUID,
    rootURL: URL,
    percentEncodedBasePath: String = "",
    percentEncodedRelativePath: String,
    sha256: String,
    mimeType: String
  ) throws -> DocumentAssetCapability {
    guard sha256.count == 64, sha256.allSatisfy(\.isHexDigit),
      ["image/png", "image/jpeg", "image/gif", "image/webp"].contains(mimeType)
    else { throw LocalImageError.unsupportedFormat }
    let components = try Self.decodeRelativePath(
      percentEncodedRelativePath, baseEncodedPath: percentEncodedBasePath)
    let token = UUID()
    let capability = try lock.withLock { () throws -> DocumentAssetCapability in
      guard currentDocumentID == documentID, currentEpoch == epoch else {
        throw LocalImageError.corruptManifest
      }
      entries[token] = Entry(
        documentID: documentID, epoch: epoch, rootURL: rootURL.standardizedFileURL,
        components: components, sha256: sha256.lowercased(), mimeType: mimeType)
      guard
        let url = URL(
          string: "\(DocumentAssetSchemeHandler.scheme)://resource/\(token.uuidString.lowercased())"
        )
      else { throw LocalImageError.corruptManifest }
      return DocumentAssetCapability(token: token, documentID: documentID, epoch: epoch, url: url)
    }
    return capability
  }

  func read(token: UUID) -> DocumentAssetReadResult {
    let entry: Entry
    do {
      entry = try lock.withLock {
        guard let entry = entries[token] else {
          throw staleTokens.contains(token) ? BrokerLookup.stale : BrokerLookup.unknown
        }
        guard entry.documentID == currentDocumentID, entry.epoch == currentEpoch else {
          throw BrokerLookup.stale
        }
        return entry
      }
    } catch BrokerLookup.stale {
      return .init(status: .stale, data: nil, mimeType: nil, sha256: nil)
    } catch {
      return .init(status: .unknownToken, data: nil, mimeType: nil, sha256: nil)
    }
    return Self.read(entry: entry, maximumBytes: maximumBytes)
  }

  func read(
    token: UUID,
    completion: @escaping @Sendable (DocumentAssetReadResult) -> Void
  ) {
    let root = lock.withLock { entries[token]?.rootURL }
    guard let root else {
      completion(read(token: token))
      return
    }
    let lease = leaseFactory.lease(for: root)
    scheduler.perform { [self] in
      let result = read(token: token)
      lease.release()
      completion(result)
    }
  }

  func isCurrent(token: UUID) -> Bool {
    lock.withLock {
      guard let entry = entries[token] else { return false }
      return entry.documentID == currentDocumentID && entry.epoch == currentEpoch
    }
  }

  private enum BrokerLookup: Error { case stale, unknown }

  private static func decodeRelativePath(
    _ encoded: String, baseEncodedPath: String
  ) throws -> [String] {
    guard !encoded.isEmpty, !encoded.hasPrefix("/"), !encoded.contains("\0") else {
      throw LocalImageError.unsafePath
    }
    var result: [String] = []
    if !baseEncodedPath.isEmpty {
      result = try decodeRelativePath(baseEncodedPath, baseEncodedPath: "")
    }
    for encodedComponent in encoded.split(separator: "/", omittingEmptySubsequences: false) {
      guard !encodedComponent.isEmpty,
        let component = String(encodedComponent).removingPercentEncoding,
        !component.isEmpty, !component.contains("/"), !component.contains("\\"),
        !component.contains("\0"), component != "."
      else { throw LocalImageError.unsafePath }
      if component == ".." {
        guard !result.isEmpty else { throw LocalImageError.unsafePath }
        result.removeLast()
      } else {
        result.append(component)
      }
    }
    guard !result.isEmpty else { throw LocalImageError.unsafePath }
    return result
  }

  private static func read(entry: Entry, maximumBytes: Int) -> DocumentAssetReadResult {
    let rootFD = open(entry.rootURL.path, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
    guard rootFD >= 0 else { return failure(errno) }
    var directoryFD = rootFD
    defer { close(directoryFD) }
    for component in entry.components.dropLast() {
      let nextFD = openat(directoryFD, component, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW)
      if nextFD < 0 {
        let value = errno
        if value == ENOTDIR, isSymlink(directoryFD: directoryFD, component: component) {
          return .init(status: .symlink, data: nil, mimeType: nil, sha256: nil)
        }
        return failure(value)
      }
      close(directoryFD)
      directoryFD = nextFD
    }
    guard let final = entry.components.last else {
      return .init(status: .invalid, data: nil, mimeType: nil, sha256: nil)
    }
    let descriptor = openat(directoryFD, final, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
    guard descriptor >= 0 else { return failure(errno) }
    defer { close(descriptor) }
    var information = stat()
    guard fstat(descriptor, &information) == 0,
      (information.st_mode & S_IFMT) == S_IFREG
    else { return .init(status: .invalid, data: nil, mimeType: nil, sha256: nil) }
    guard information.st_size >= 0, information.st_size <= maximumBytes else {
      return .init(status: .sizeLimit, data: nil, mimeType: nil, sha256: nil)
    }
    var data = Data(count: Int(information.st_size))
    let count = data.withUnsafeMutableBytes { bytes -> Int in
      guard let base = bytes.baseAddress else { return 0 }
      var offset = 0
      while offset < bytes.count {
        let amount = Darwin.read(descriptor, base.advanced(by: offset), bytes.count - offset)
        if amount <= 0 { return amount < 0 ? -1 : offset }
        offset += amount
      }
      return offset
    }
    guard count == data.count else {
      return .init(status: .ioError, data: nil, mimeType: nil, sha256: nil)
    }
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    guard digest == entry.sha256 else {
      return .init(status: .checksumMismatch, data: nil, mimeType: nil, sha256: digest)
    }
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      CGImageSourceGetCount(source) > 0,
      let type = CGImageSourceGetType(source) as String?,
      let uniformType = UTType(type),
      uniformType.preferredMIMEType == entry.mimeType,
      CGImageSourceCreateImageAtIndex(source, 0, nil) != nil
    else {
      return .init(status: .unsupported, data: nil, mimeType: nil, sha256: digest)
    }
    return .init(status: .ready, data: data, mimeType: entry.mimeType, sha256: digest)
  }

  private static func isSymlink(directoryFD: Int32, component: String) -> Bool {
    var information = stat()
    let result = component.withCString {
      fstatat(directoryFD, $0, &information, AT_SYMLINK_NOFOLLOW)
    }
    return result == 0 && (information.st_mode & S_IFMT) == S_IFLNK
  }

  private static func failure(_ value: Int32) -> DocumentAssetReadResult {
    let status: DocumentAssetReadStatus
    switch value {
    case ENOENT: status = .missing
    case EACCES, EPERM: status = .denied
    case ELOOP: status = .symlink
    default: status = .ioError
    }
    return .init(status: status, data: nil, mimeType: nil, sha256: nil)
  }
}

protocol DocumentAssetTaskOutlet: AnyObject, Sendable {
  var identity: ObjectIdentifier { get }
  var request: URLRequest? { get }
  func receive(response: URLResponse)
  func receive(data: Data)
  func finish()
  func fail(_ error: Error)
}

final class DocumentAssetTaskCore: @unchecked Sendable {
  private let broker: DocumentAssetBroker
  private let delivery: any AssetTaskDelivery
  private let lock = NSLock()
  private var active = Set<ObjectIdentifier>()

  init(
    broker: DocumentAssetBroker,
    delivery: any AssetTaskDelivery = MainAssetDelivery()
  ) {
    self.broker = broker
    self.delivery = delivery
  }

  func start(_ outlet: any DocumentAssetTaskOutlet) {
    guard let request = outlet.request, request.httpMethod == "GET",
      let url = request.url,
      url.scheme == DocumentAssetSchemeHandler.scheme, url.host == "resource",
      url.user == nil, url.password == nil, url.port == nil,
      url.query == nil, url.fragment == nil,
      url.pathComponents.count == 2,
      let token = UUID(uuidString: url.lastPathComponent)
    else {
      outlet.fail(NSError(domain: "InkoraAsset", code: 400))
      return
    }
    let identity = outlet.identity
    _ = lock.withLock { active.insert(identity) }
    broker.read(token: token) { [self, outlet] result in
      delivery.async { [self, outlet] in
        let mayCallback = lock.withLock { active.remove(identity) != nil }
        guard mayCallback else { return }
        guard broker.isCurrent(token: token), result.status == .ready,
          let data = result.data, let mime = result.mimeType
        else {
          outlet.fail(NSError(domain: "InkoraAsset", code: result.status == .stale ? 409 : 403))
          return
        }
        let response = URLResponse(
          url: url, mimeType: mime, expectedContentLength: data.count, textEncodingName: nil)
        outlet.receive(response: response)
        outlet.receive(data: data)
        outlet.finish()
      }
    }
  }

  func stop(identity: ObjectIdentifier) {
    delivery.sync { [self] in _ = lock.withLock { active.remove(identity) } }
  }
}

private final class WKDocumentAssetOutlet: DocumentAssetTaskOutlet, @unchecked Sendable {
  private let task: WKURLSchemeTask
  let identity: ObjectIdentifier
  init(_ task: WKURLSchemeTask) {
    self.task = task
    identity = ObjectIdentifier(task as AnyObject)
  }
  var request: URLRequest? { task.request }
  func receive(response: URLResponse) { task.didReceive(response) }
  func receive(data: Data) { task.didReceive(data) }
  func finish() { task.didFinish() }
  func fail(_ error: Error) { task.didFailWithError(error) }
}

final class DocumentAssetSchemeHandler: NSObject, WKURLSchemeHandler {
  nonisolated static let scheme = "inkora-asset"
  private let core: DocumentAssetTaskCore

  init(broker: DocumentAssetBroker) {
    core = DocumentAssetTaskCore(broker: broker)
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    core.start(WKDocumentAssetOutlet(urlSchemeTask))
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    core.stop(identity: ObjectIdentifier(urlSchemeTask as AnyObject))
  }
}
