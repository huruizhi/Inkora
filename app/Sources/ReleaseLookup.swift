import CoreFoundation
import CryptoKit
import Foundation

struct ReleaseInformation: Equatable, Sendable {
  let build: UInt64
  let page: URL
}

enum ReleaseLookupError: Error { case unverifiable, transport }

/// Read-only public release metadata; never downloads executable archives.
struct ReleaseLookup: Sendable {
  let session: URLSession
  static let endpoint = URL(
    string: "https://api.github.com/repos/huruizhi/Inkora/releases?per_page=10")!

  func latest(channel: UpdateChannel) async throws -> ReleaseInformation? {
    let data = try await fetch(Self.endpoint)
    guard let releases = try Self.object(data) as? [[String: Any]] else {
      throw ReleaseLookupError.unverifiable
    }
    var latest: ReleaseInformation?
    for release in releases.prefix(10) {
      guard release["draft"] as? Bool == false,
        let prerelease = release["prerelease"] as? Bool
      else { throw ReleaseLookupError.unverifiable }
      if channel == .stable && prerelease { continue }
      guard let tag = release["tag_name"] as? String,
        let pageText = release["html_url"] as? String,
        let page = URL(string: pageText), page.scheme == "https", page.host == "github.com",
        pageText == "https://github.com/huruizhi/Inkora/releases/tag/\(tag)",
        let assets = release["assets"] as? [[String: Any]],
        let provenance = assets.first(where: { $0["name"] as? String == "PROVENANCE.json" }),
        let assetText = provenance["browser_download_url"] as? String,
        let asset = URL(string: assetText), asset.scheme == "https", asset.host == "github.com",
        assetText == "https://github.com/huruizhi/Inkora/releases/download/\(tag)/PROVENANCE.json",
        asset.lastPathComponent == "PROVENANCE.json"
      else { throw ReleaseLookupError.unverifiable }
      let metadata = try await fetch(asset)
      let build = try Self.build(
        metadata: metadata, tag: tag, prerelease: prerelease,
        assetURLs: Set(assets.compactMap { $0["browser_download_url"] as? String }))
      if latest == nil || build > latest!.build {
        latest = ReleaseInformation(build: build, page: page)
      }
    }
    return latest
  }

  static func build(metadata: Data, tag: String, prerelease: Bool, assetURLs: Set<String> = [])
    throws -> UInt64
  {
    guard let info = try object(metadata) as? [String: Any] else {
      throw ReleaseLookupError.unverifiable
    }
    // Exact historical public bytes, independently checked against the build 3 ZIP.
    // This grants read-only release lookup compatibility, never installation trust.
    let historicalSHA = "b29c77533ab291232e7d612f6ca293200ea93a8858e9d7da7a7d5327b19a7e26"
    if SHA256.hash(data: metadata).map({ String(format: "%02x", $0) }).joined() == historicalSHA {
      let base = "https://github.com/huruizhi/Inkora/releases/download/v0.1.0-beta.1/"
      let required = Set(
        ["zip", "dmg"].map {
          base + "Inkora-0.1.0-beta.1-unsigned-universal.\($0)"
        })
      guard tag == "v0.1.0-beta.1", prerelease, required.isSubset(of: assetURLs) else {
        throw ReleaseLookupError.unverifiable
      }
      return 3
    }
    let value: String
    if info.keys.contains("schema") {
      guard let schema = info["schema"] as? String,
        Set(info.keys) == [
          "schema", "bundleIdentifier", "buildVersion", "marketingVersion", "channel", "tag",
          "sourceCommit", "assets",
        ],
        schema == "inkora.release.v1", info["tag"] as? String == tag,
        info["bundleIdentifier"] as? String == "com.huruizhi.Inkora",
        info["channel"] as? String == (prerelease ? "beta" : "stable"),
        let version = info["buildVersion"] as? String
      else { throw ReleaseLookupError.unverifiable }
      guard let marketing = info["marketingVersion"] as? String, !marketing.isEmpty,
        let commit = info["sourceCommit"] as? String, commit.count == 40,
        commit.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
        let manifestAssets = info["assets"] as? [[String: Any]], !manifestAssets.isEmpty
      else { throw ReleaseLookupError.unverifiable }
      let expectedTag =
        prerelease
        ? "^v[0-9]+\\.[0-9]+\\.[0-9]+-beta\\.[1-9][0-9]*$" : "^v[0-9]+\\.[0-9]+\\.[0-9]+$"
      guard tag.range(of: expectedTag, options: .regularExpression) != nil,
        tag == "v\(marketing)" || tag.hasPrefix("v\(marketing)-beta.")
      else { throw ReleaseLookupError.unverifiable }
      var assetNames: Set<String> = []
      for entry in manifestAssets {
        guard Set(entry.keys) == ["name", "url", "byteLength", "sha256"],
          let name = entry["name"] as? String,
          name.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]*$", options: .regularExpression) != nil,
          assetNames.insert(name).inserted,
          let text = entry["url"] as? String, assetURLs.contains(text),
          let url = URL(string: text), url.scheme == "https", url.host == "github.com",
          text == "https://github.com/huruizhi/Inkora/releases/download/\(tag)/\(name)",
          let length = entry["byteLength"] as? NSNumber,
          CFGetTypeID(length) != CFBooleanGetTypeID(), length.doubleValue > 0,
          length.doubleValue.rounded() == length.doubleValue,
          let sha = entry["sha256"] as? String, sha.count == 64,
          sha.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) })
        else { throw ReleaseLookupError.unverifiable }
      }
      value = version
    } else {
      guard let checks = info["checks"] as? [String: Any],
        let export = checks["export"] as? [String: Any],
        let zip = checks["zip"] as? [String: Any],
        let a = export["versions"] as? [String: String],
        let b = zip["versions"] as? [String: String],
        a["CFBundleIdentifier"] == "com.huruizhi.Inkora", a == b,
        let version = a["CFBundleVersion"]
      else { throw ReleaseLookupError.unverifiable }
      for check in checks.values {
        guard let object = check as? [String: Any] else {
          throw ReleaseLookupError.unverifiable
        }
        if object.keys.contains("versions") {
          guard let versions = object["versions"] as? [String: String], versions == a else {
            throw ReleaseLookupError.unverifiable
          }
        }
      }
      try validateLegacyAliases(info, versions: a, tag: tag, prerelease: prerelease)
      value = version
    }
    guard value.first != "0", !value.isEmpty, value.utf8.allSatisfy({ (48...57).contains($0) }),
      let build = UInt64(value), build > 0, build <= UInt64(Int64.max)
    else { throw ReleaseLookupError.unverifiable }
    return build
  }

  /// Legacy compatibility cannot override contradictory public/plist aliases.
  /// Presence with a wrong type (including JSON null) is a failure, not absence.
  private static func validateLegacyAliases(
    _ info: [String: Any], versions: [String: String], tag: String, prerelease: Bool
  ) throws {
    let expected: [String: String?] = [
      "bundleIdentifier": versions["CFBundleIdentifier"],
      "CFBundleIdentifier": versions["CFBundleIdentifier"],
      "buildVersion": versions["CFBundleVersion"], "build": versions["CFBundleVersion"],
      "CFBundleVersion": versions["CFBundleVersion"],
      "marketingVersion": versions["CFBundleShortVersionString"],
      "version": versions["CFBundleShortVersionString"],
      "CFBundleShortVersionString": versions["CFBundleShortVersionString"],
      "tag": tag, "releaseTag": tag, "tag_name": tag,
      "channel": prerelease ? "beta" : "stable",
    ]
    for (key, expectedValue) in expected where info.keys.contains(key) {
      guard let expectedValue, let value = info[key] as? String, value == expectedValue else {
        throw ReleaseLookupError.unverifiable
      }
    }
    if let marketing = versions["CFBundleShortVersionString"] {
      let expectedTag =
        prerelease
        ? "^v\(NSRegularExpression.escapedPattern(for: marketing))-beta\\.[1-9][0-9]*$"
        : "^v\(NSRegularExpression.escapedPattern(for: marketing))$"
      guard tag.range(of: expectedTag, options: .regularExpression) != nil else {
        throw ReleaseLookupError.unverifiable
      }
    }
    for key in ["prerelease", "isPrerelease"] where info.keys.contains(key) {
      guard let flag = info[key] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID(),
        flag.boolValue == prerelease
      else { throw ReleaseLookupError.unverifiable }
    }
  }

  private static func object(_ data: Data) throws -> Any {
    let bytes = Array(data)
    var stack: [Set<String>?] = []
    var index = 0
    while index < bytes.count {
      switch bytes[index] {
      case 123: stack.append([])
      case 91: stack.append(nil)
      case 125, 93:
        guard !stack.isEmpty else { throw ReleaseLookupError.unverifiable }
        stack.removeLast()
      case 34:
        let start = index
        index += 1
        while index < bytes.count {
          if bytes[index] == 92 {
            index += 2
            continue
          }
          if bytes[index] == 34 { break }
          index += 1
        }
        guard index < bytes.count else { throw ReleaseLookupError.unverifiable }
        let end = index
        var next = index + 1
        while next < bytes.count && [9, 10, 13, 32].contains(bytes[next]) { next += 1 }
        if next < bytes.count, bytes[next] == 58, !stack.isEmpty, stack[stack.count - 1] != nil {
          let keyData = Data([91] + Array(bytes[start...end]) + [93])
          guard let key = (try JSONSerialization.jsonObject(with: keyData) as? [String])?.first,
            stack[stack.count - 1]!.insert(key).inserted
          else { throw ReleaseLookupError.unverifiable }
        }
      default: break
      }
      guard stack.count <= 128 else { throw ReleaseLookupError.unverifiable }
      index += 1
    }
    return try JSONSerialization.jsonObject(with: data)
  }

  private func fetch(_ url: URL) async throws -> Data {
    var request = URLRequest(
      url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let (bytes, response) = try await session.bytes(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200,
      let destination = http.url, destination.scheme == "https",
      ["api.github.com", "github.com", "release-assets.githubusercontent.com"].contains(
        destination.host),
      response.expectedContentLength <= 1_048_576
    else { throw ReleaseLookupError.transport }
    var data = Data()
    for try await byte in bytes {
      guard data.count < 1_048_576 else { throw ReleaseLookupError.unverifiable }
      data.append(byte)
    }
    return data
  }
}

final class ReleaseTransportDelegate: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    let permitted =
      request.url?.scheme == "https"
      && ["api.github.com", "github.com", "release-assets.githubusercontent.com"].contains(
        request.url?.host)
    completionHandler(permitted ? request : nil)
  }
}
