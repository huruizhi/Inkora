import Foundation

protocol DocumentDataWriting: Sendable {
  func write(_ data: Data, to url: URL) throws
}

struct AtomicDocumentDataWriter: DocumentDataWriting {
  func write(_ data: Data, to url: URL) throws {
    try data.write(to: url, options: .atomic)
  }
}
