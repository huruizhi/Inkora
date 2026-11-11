import Foundation
@main struct Probe {
  static func main() throws {
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
    let assets = object["assets"] as! [[String: Any]]
    let urls = Set(assets.map { $0["url"] as! String })
    let build = try ReleaseLookup.build(metadata: data, tag: "v0.1.0-beta.2", prerelease: true, assetURLs: urls)
    precondition(build == 5)
    print("Actual generated manifest accepted by current product consumer: build 5")
  }
}
