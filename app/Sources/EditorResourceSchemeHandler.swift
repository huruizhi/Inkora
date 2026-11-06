import Foundation
import WebKit

final class EditorResourceSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "inkora-editor"

  private let resourceDirectory: URL

  init?(bundle: Bundle) {
    guard let resourceURL = bundle.resourceURL else { return nil }
    let resourceDirectory = resourceURL.appendingPathComponent("editor", isDirectory: true)
    guard FileManager.default.fileExists(atPath: resourceDirectory.path) else { return nil }
    self.resourceDirectory = resourceDirectory.standardizedFileURL
  }

  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    do {
      let fileURL = try resolve(urlSchemeTask.request.url)
      let data = try Data(contentsOf: fileURL)
      let response = URLResponse(
        url: try requiredURL(urlSchemeTask.request.url),
        mimeType: mimeType(for: fileURL),
        expectedContentLength: data.count,
        textEncodingName: textEncodingName(for: fileURL)
      )
      urlSchemeTask.didReceive(response)
      urlSchemeTask.didReceive(data)
      urlSchemeTask.didFinish()
    } catch {
      urlSchemeTask.didFailWithError(error)
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

  private func resolve(_ url: URL?) throws -> URL {
    let url = try requiredURL(url)
    guard url.scheme == Self.scheme, url.host == "app" else {
      throw EditorResourceError.invalidURL
    }

    let relativePath = String(url.path.drop(while: { $0 == "/" }))
    guard !relativePath.isEmpty else {
      throw EditorResourceError.invalidURL
    }

    let fileURL = resourceDirectory.appendingPathComponent(relativePath).standardizedFileURL
    let allowedPrefix = resourceDirectory.path + "/"
    guard fileURL.path.hasPrefix(allowedPrefix) else {
      throw EditorResourceError.invalidURL
    }
    guard FileManager.default.fileExists(atPath: fileURL.path) else {
      throw EditorResourceError.resourceNotFound
    }
    return fileURL
  }

  private func requiredURL(_ url: URL?) throws -> URL {
    guard let url else { throw EditorResourceError.invalidURL }
    return url
  }

  private func mimeType(for fileURL: URL) -> String {
    switch fileURL.pathExtension.lowercased() {
    case "html":
      "text/html"
    case "js":
      "text/javascript"
    case "css":
      "text/css"
    case "svg":
      "image/svg+xml"
    case "png":
      "image/png"
    default:
      "application/octet-stream"
    }
  }

  private func textEncodingName(for fileURL: URL) -> String? {
    switch fileURL.pathExtension.lowercased() {
    case "html", "js", "css", "svg":
      "utf-8"
    default:
      nil
    }
  }
}

private enum EditorResourceError: LocalizedError {
  case invalidURL
  case resourceNotFound

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      "The editor requested an invalid local resource URL."
    case .resourceNotFound:
      "The requested editor resource does not exist."
    }
  }
}
