import Foundation

enum BrokerPolicyError: Error, Equatable, CustomStringConvertible {
    case malformedPercentEncoding
    case absolutePath
    case otherScheme
    case traversal
    case emptyComponent
    case unsupportedExtension
    case unknownToken
    case wrongDocument
    case staleEpoch
    case revoked

    var description: String {
        switch self {
        case .malformedPercentEncoding: return "malformed-percent-encoding"
        case .absolutePath: return "absolute-path"
        case .otherScheme: return "other-scheme"
        case .traversal: return "path-traversal"
        case .emptyComponent: return "empty-component"
        case .unsupportedExtension: return "unsupported-extension"
        case .unknownToken: return "unknown-token"
        case .wrongDocument: return "cross-document-token"
        case .staleEpoch: return "stale-epoch-token"
        case .revoked: return "authorization-revoked"
        }
    }
}

struct SafeRelativePath: Equatable {
    let value: String
    let components: [String]

    init(encoded: String) throws {
        guard !encoded.isEmpty else { throw BrokerPolicyError.emptyComponent }
        guard !encoded.hasPrefix("/") else { throw BrokerPolicyError.absolutePath }
        guard URL(string: encoded)?.scheme == nil else { throw BrokerPolicyError.otherScheme }
        guard validPercentEncoding(encoded), let decoded = encoded.removingPercentEncoding else {
            throw BrokerPolicyError.malformedPercentEncoding
        }
        guard !decoded.hasPrefix("/") else { throw BrokerPolicyError.absolutePath }

        let parts = decoded.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard !parts.contains(where: { $0.isEmpty }) else { throw BrokerPolicyError.emptyComponent }
        guard !parts.contains("."), !parts.contains("..") else { throw BrokerPolicyError.traversal }
        guard parts.allSatisfy({ !$0.contains("\0") }) else { throw BrokerPolicyError.traversal }

        let allowed = ["png", "jpg", "jpeg"]
        guard let ext = parts.last?.split(separator: ".").last?.lowercased(), allowed.contains(ext) else {
            throw BrokerPolicyError.unsupportedExtension
        }
        value = decoded
        components = parts
    }
}

private func validPercentEncoding(_ value: String) -> Bool {
    let scalars = Array(value.unicodeScalars)
    var index = 0
    while index < scalars.count {
        if scalars[index] == "%" {
            guard index + 2 < scalars.count,
                  scalars[index + 1].isASCIIHexDigit,
                  scalars[index + 2].isASCIIHexDigit else { return false }
            index += 3
        } else {
            index += 1
        }
    }
    return true
}

private extension Unicode.Scalar {
    var isASCIIHexDigit: Bool {
        ("0"..."9").contains(Character(String(self))) ||
        ("a"..."f").contains(Character(String(self)).lowercased().first!)
    }
}

struct DocumentIdentity: Equatable {
    let id: UUID
    let epoch: UUID
}

struct ResourceCapability: Equatable {
    let token: UUID
    let documentID: UUID
    let epoch: UUID
    let relativePath: SafeRelativePath
}

struct CapabilityRegistry {
    private(set) var current: DocumentIdentity
    private(set) var revoked = false
    private var resources: [UUID: ResourceCapability] = [:]

    init(documentID: UUID = UUID()) {
        current = DocumentIdentity(id: documentID, epoch: UUID())
    }

    mutating func register(encodedPath: String, token: UUID = UUID()) throws -> ResourceCapability {
        guard !revoked else { throw BrokerPolicyError.revoked }
        let capability = ResourceCapability(
            token: token,
            documentID: current.id,
            epoch: current.epoch,
            relativePath: try SafeRelativePath(encoded: encodedPath)
        )
        resources[token] = capability
        return capability
    }

    func resolve(_ token: UUID, for document: DocumentIdentity) throws -> ResourceCapability {
        guard !revoked else { throw BrokerPolicyError.revoked }
        guard let capability = resources[token] else { throw BrokerPolicyError.unknownToken }
        guard capability.documentID == document.id else { throw BrokerPolicyError.wrongDocument }
        guard capability.epoch == document.epoch, document == current else { throw BrokerPolicyError.staleEpoch }
        return capability
    }

    mutating func beginNewEpoch() {
        current = DocumentIdentity(id: current.id, epoch: UUID())
    }

    mutating func revoke() {
        revoked = true
    }
}

struct CallbackGate {
    private(set) var canceled: Set<UUID> = []
    private(set) var completed: Set<UUID> = []

    mutating func start(_ id: UUID) -> Bool {
        !canceled.contains(id) && !completed.contains(id)
    }

    mutating func cancel(_ id: UUID) {
        canceled.insert(id)
    }

    mutating func complete(_ id: UUID) -> Bool {
        guard !canceled.contains(id), !completed.contains(id) else { return false }
        completed.insert(id)
        return true
    }
}
