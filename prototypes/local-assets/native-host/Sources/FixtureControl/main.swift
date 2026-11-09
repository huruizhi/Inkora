import CryptoKit
import Darwin
import Foundation

private let bundleID = "com.huruizhi.Inkora.LocalAssetHostPrototype"
private let baseRoot = URL(fileURLWithPath: "/tmp/InkoraLocalAssetHostFixtures", isDirectory: true)

struct FileRecord: Codable {
    let relativePath: String
    let kind: String
    let sha256: String?
    let expected: String
}

struct FixtureManifest: Codable {
    let schemaVersion: Int
    let runID: UUID
    let createdBy: String
    let files: [FileRecord]
}

struct FixtureLocator: Codable {
    let schemaVersion: Int
    let runID: UUID
    let fixtureRootPath: String
    let markdownRelativePath: String
    let markdownSHA256: String
    let imageEncodedRelativePath: String
    let manifestSHA256: String
}

func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

func locatorURL() throws -> URL {
    guard let account = getpwuid(getuid()) else { throw NSError(domain: "FixtureControl", code: 1) }
    let home = String(cString: account.pointee.pw_dir)
    return URL(fileURLWithPath: home, isDirectory: true)
        .appendingPathComponent("Library/Containers/\(bundleID)/Data/Library/Application Support/InkoraLocalAssetHost", isDirectory: true)
        .appendingPathComponent("fixture-locator.json")
}

func safeExistingRunRoot(from locator: FixtureLocator) -> URL? {
    let expectedPrefix = baseRoot.standardizedFileURL.path + "/"
    let runRoot = URL(fileURLWithPath: locator.fixtureRootPath).deletingLastPathComponent()
    guard runRoot.standardizedFileURL.path.hasPrefix(expectedPrefix),
          runRoot.lastPathComponent == locator.runID.uuidString else { return nil }
    return runRoot
}

func loadLocator() -> FixtureLocator? {
    guard let url = try? locatorURL(), let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(FixtureLocator.self, from: data)
}

func cleanCurrent() throws {
    let fileManager = FileManager.default
    let url = try locatorURL()
    if let locator = loadLocator(), let runRoot = safeExistingRunRoot(from: locator), fileManager.fileExists(atPath: runRoot.path) {
        try fileManager.removeItem(at: runRoot)
        print("removed fixture run \(locator.runID.uuidString)")
    }
    if fileManager.fileExists(atPath: url.path) {
        try fileManager.removeItem(at: url)
        print("removed locator")
    }
}

func prepare() throws {
    try cleanCurrent()
    let fileManager = FileManager.default
    let runID = UUID()
    let runRoot = baseRoot.appendingPathComponent(runID.uuidString, isDirectory: true)
    let fixtureRoot = runRoot.appendingPathComponent("中文 目录%", isDirectory: true)
    let assets = fixtureRoot.appendingPathComponent("assets", isDirectory: true)
    try fileManager.createDirectory(at: assets, withIntermediateDirectories: true)

    let markdownRelative = "文档 100%.md"
    let imageRelative = "assets/图 100%.png"
    let imageEncodedRelative = "assets/%E5%9B%BE%20100%25.png"
    let secondRelative = "第二文档.md"
    let missingRelative = "assets/缺失.png"
    let symlinkRelative = "assets/越界链接.png"
    let outsideURL = runRoot.appendingPathComponent("outside.png")

    let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")!
    try png.write(to: fixtureRoot.appendingPathComponent(imageRelative), options: .atomic)
    try png.write(to: outsideURL, options: .atomic)

    let markdownText = "# 本地图片原型\r\n\r\n![白名单图片](\(imageEncodedRelative))\r\n"
    var markdown = Data([0xEF, 0xBB, 0xBF])
    markdown.append(markdownText.data(using: .utf8)!)
    try markdown.write(to: fixtureRoot.appendingPathComponent(markdownRelative), options: .atomic)
    let second = Data([0xEF, 0xBB, 0xBF]) + "# 第二文档\r\n".data(using: .utf8)!
    try second.write(to: fixtureRoot.appendingPathComponent(secondRelative), options: .atomic)
    try fileManager.createSymbolicLink(
        at: fixtureRoot.appendingPathComponent(symlinkRelative),
        withDestinationURL: outsideURL
    )

    let manifest = FixtureManifest(
        schemaVersion: 1,
        runID: runID,
        createdBy: "INK-PROT-032 fixture-control",
        files: [
            FileRecord(relativePath: markdownRelative, kind: "markdown-bom-crlf", sha256: sha256(markdown), expected: "read-after-file-panel"),
            FileRecord(relativePath: imageRelative, kind: "png", sha256: sha256(png), expected: "read-after-directory-panel"),
            FileRecord(relativePath: secondRelative, kind: "markdown-bom-crlf", sha256: sha256(second), expected: "cross-document-rejected"),
            FileRecord(relativePath: missingRelative, kind: "missing", sha256: nil, expected: "missing"),
            FileRecord(relativePath: "../outside.png", kind: "outside", sha256: sha256(png), expected: "path-rejected"),
            FileRecord(relativePath: symlinkRelative, kind: "symlink", sha256: nil, expected: "symlink-rejected")
        ]
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    let manifestData = try encoder.encode(manifest)
    try manifestData.write(to: fixtureRoot.appendingPathComponent("manifest.json"), options: .atomic)

    let locator = FixtureLocator(
        schemaVersion: 1,
        runID: runID,
        fixtureRootPath: fixtureRoot.path,
        markdownRelativePath: markdownRelative,
        markdownSHA256: sha256(markdown),
        imageEncodedRelativePath: imageEncodedRelative,
        manifestSHA256: sha256(manifestData)
    )
    let locatorData = try encoder.encode(locator)
    let locatorFileURL = try locatorURL()
    try fileManager.createDirectory(at: locatorFileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try locatorData.write(to: locatorFileURL, options: .atomic)

    print("runID=\(runID.uuidString)")
    print("fixtureRoot=\(fixtureRoot.path)")
    print("manifestSHA256=\(sha256(manifestData))")
    print("locator=\(locatorFileURL.path)")
}

do {
    switch CommandLine.arguments.dropFirst().first {
    case "prepare": try prepare()
    case "clean": try cleanCurrent()
    default:
        fputs("usage: fixture-control prepare|clean\n", stderr)
        exit(64)
    }
} catch {
    fputs("fixture-control failed: \(error)\n", stderr)
    exit(1)
}
