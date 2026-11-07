import Foundation

protocol DocumentDataWriting: Sendable {
  func write(_ data: Data, to url: URL) throws
}

struct AtomicDocumentDataWriter: DocumentDataWriting {
  func write(_ data: Data, to url: URL) throws {
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("--inkora-test-write-failure") {
        throw CocoaError(.fileWriteNoPermission)
      }
    #endif
    try data.write(to: url, options: .atomic)
  }
}
