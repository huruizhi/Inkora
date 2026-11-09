import Foundation
import XCTest

final class DocumentAssetBrokerTests: XCTestCase {
  private let png = Data(
    base64Encoded:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  )!

  func testCapabilityIsBoundToDocumentEpochTokenAndVerifiedBytes() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let image = scratch.appendingPathComponent("图 片%.png")
    try png.write(to: image)
    let broker = DocumentAssetBroker()
    let epoch = broker.beginDocument(documentID: "doc-a")
    let capability = try broker.register(
      documentID: "doc-a", epoch: epoch, rootURL: scratch,
      percentEncodedRelativePath: "%E5%9B%BE%20%E7%89%87%25.png",
      sha256: RecoveryFingerprint.hash(png), mimeType: "image/png")

    XCTAssertEqual(capability.url.scheme, DocumentAssetSchemeHandler.scheme)
    let result = broker.read(token: capability.token)
    XCTAssertEqual(result.status, .ready)
    XCTAssertEqual(result.data, png)
    XCTAssertEqual(result.mimeType, "image/png")

    _ = broker.beginDocument(documentID: "doc-b")
    XCTAssertEqual(broker.read(token: capability.token).status, .stale)
    XCTAssertEqual(broker.read(token: UUID()).status, .unknownToken)
  }

  func testDescriptorTraversalSymlinkSizeMimeSHAAndDecodeAreRejected() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    let outside = scratch.deletingLastPathComponent().appendingPathComponent(
      "outside-\(UUID()).png")
    defer { try? FileManager.default.removeItem(at: outside) }
    try png.write(to: outside)
    let symlink = scratch.appendingPathComponent("link.png")
    try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: outside)
    let broker = DocumentAssetBroker(maximumBytes: png.count)
    let epoch = broker.beginDocument(documentID: "doc")

    XCTAssertThrowsError(
      try broker.register(
        documentID: "doc", epoch: epoch, rootURL: scratch,
        percentEncodedRelativePath: "../outside.png",
        sha256: RecoveryFingerprint.hash(png), mimeType: "image/png"))
    let linked = try broker.register(
      documentID: "doc", epoch: epoch, rootURL: scratch,
      percentEncodedRelativePath: "link.png",
      sha256: RecoveryFingerprint.hash(png), mimeType: "image/png")
    XCTAssertEqual(broker.read(token: linked.token).status, .symlink)

    let real = scratch.appendingPathComponent("real.png")
    try png.write(to: real)
    let wrongSHA = try broker.register(
      documentID: "doc", epoch: epoch, rootURL: scratch,
      percentEncodedRelativePath: "real.png", sha256: String(repeating: "0", count: 64),
      mimeType: "image/png")
    XCTAssertEqual(broker.read(token: wrongSHA.token).status, .checksumMismatch)
    let wrongMIME = try broker.register(
      documentID: "doc", epoch: epoch, rootURL: scratch,
      percentEncodedRelativePath: "real.png", sha256: RecoveryFingerprint.hash(png),
      mimeType: "image/jpeg")
    XCTAssertEqual(broker.read(token: wrongMIME.token).status, .unsupported)
  }

  func testSchemeCoreSuppressesEveryCallbackAfterStopAndReleasesLease() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    try png.write(to: scratch.appendingPathComponent("a.png"))
    let scheduler = ControlledAssetScheduler()
    let leases = CountingAssetLeaseFactory()
    let broker = DocumentAssetBroker(scheduler: scheduler, leaseFactory: leases)
    let epoch = broker.beginDocument(documentID: "doc")
    let capability = try broker.register(
      documentID: "doc", epoch: epoch, rootURL: scratch,
      percentEncodedRelativePath: "a.png", sha256: RecoveryFingerprint.hash(png),
      mimeType: "image/png")
    let core = DocumentAssetTaskCore(broker: broker, delivery: ImmediateAssetDelivery())
    let outlet = FakeAssetOutlet(url: capability.url)

    core.start(outlet)
    XCTAssertEqual(leases.active, 1)
    core.stop(identity: outlet.identity)
    scheduler.runAll()

    XCTAssertTrue(outlet.events.isEmpty)
    XCTAssertEqual(leases.active, 0)
  }

  func testRelativeParentIsAllowedOnlyWhenItRemainsInsideSelectedGrant() throws {
    let scratch = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: scratch) }
    try FileManager.default.createDirectory(
      at: scratch.appendingPathComponent("notes"), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(
      at: scratch.appendingPathComponent("shared"), withIntermediateDirectories: true)
    try png.write(to: scratch.appendingPathComponent("shared/a.png"))
    let broker = DocumentAssetBroker()
    let epoch = broker.beginDocument(documentID: "doc")

    let inside = try broker.register(
      documentID: "doc", epoch: epoch, rootURL: scratch,
      percentEncodedBasePath: "notes", percentEncodedRelativePath: "../shared/a.png",
      sha256: RecoveryFingerprint.hash(png), mimeType: "image/png")
    XCTAssertEqual(broker.read(token: inside.token).status, .ready)
    XCTAssertThrowsError(
      try broker.register(
        documentID: "doc", epoch: epoch, rootURL: scratch,
        percentEncodedBasePath: "notes", percentEncodedRelativePath: "../../outside.png",
        sha256: RecoveryFingerprint.hash(png), mimeType: "image/png"))
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("InkoraBroker-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }
}

private final class ControlledAssetScheduler: AssetReadScheduling, @unchecked Sendable {
  private var operations: [() -> Void] = []
  func perform(_ operation: @escaping @Sendable () -> Void) { operations.append(operation) }
  func runAll() {
    let pending = operations
    operations.removeAll()
    for operation in pending { operation() }
  }
}

private final class CountingAssetLeaseFactory: AssetLeaseFactory, @unchecked Sendable {
  private(set) var active = 0
  func lease(for url: URL) -> any AssetScopeLease {
    active += 1
    return CountingAssetLease { self.active -= 1 }
  }
}

private final class CountingAssetLease: AssetScopeLease, @unchecked Sendable {
  private let releaseBlock: () -> Void
  init(_ release: @escaping () -> Void) { releaseBlock = release }
  func release() { releaseBlock() }
}

private struct ImmediateAssetDelivery: AssetTaskDelivery {
  func async(_ block: @escaping @Sendable () -> Void) { block() }
  func sync(_ block: @escaping @Sendable () -> Void) { block() }
}

private final class FakeAssetOutlet: DocumentAssetTaskOutlet, @unchecked Sendable {
  private let object = NSObject()
  let request: URLRequest?
  var identity: ObjectIdentifier { ObjectIdentifier(object) }
  private(set) var events: [String] = []

  init(url: URL) { request = URLRequest(url: url) }
  func receive(response: URLResponse) { events.append("response") }
  func receive(data: Data) { events.append("data") }
  func finish() { events.append("finish") }
  func fail(_ error: Error) { events.append("fail") }
}
