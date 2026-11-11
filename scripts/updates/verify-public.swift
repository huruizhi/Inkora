import CryptoKit
import Foundation

// Public inputs only. No private key or Keychain access.
let args = CommandLine.arguments
if args.count != 4 { exit(64) }
do {
    guard let publicData = Data(base64Encoded: args[1]),
          let signature = Data(base64Encoded: args[2]) else { exit(65) }
    let key = try Curve25519.Signing.PublicKey(rawRepresentation: publicData)
    let data = try Data(contentsOf: URL(fileURLWithPath: args[3]))
    exit(key.isValidSignature(signature, for: data) ? 0 : 65)
} catch { exit(65) }
