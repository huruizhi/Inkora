import AppKit
import WebKit
import CryptoKit
// Only error names required by the unchanged production broker; no mocked reads.
enum LocalImageError: Error { case corruptManifest, unsafePath, unsupportedFormat }
@MainActor final class UI: NSObject, WKUIDelegate {
 var windows = 0
 func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { windows += 1; return nil }
}
@main struct Probe {
 @MainActor static func main() async throws {
 let root=URL(fileURLWithPath:FileManager.default.currentDirectoryPath).appendingPathComponent("artifacts/INK-UX-142")
 let data=Data(base64Encoded:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")!
 try data.write(to:root.appendingPathComponent("a.png"))
 let broker=DocumentAssetBroker(); let epoch=broker.beginDocument(documentID:"probe")
 let cap=try broker.register(documentID:"probe",epoch:epoch,rootURL:root,percentEncodedRelativePath:"a.png",sha256:SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined(),mimeType:"image/png")
 let config=WKWebViewConfiguration()
 let bundle=Bundle(path:root.appendingPathComponent("probe.bundle").path)!
 config.setURLSchemeHandler(EditorResourceSchemeHandler(bundle:bundle)!,forURLScheme:"inkora-editor")
 config.setURLSchemeHandler(DocumentAssetSchemeHandler(broker:broker),forURLScheme:"inkora-asset")
 let web=WKWebView(frame:NSRect(x:0,y:0,width:900,height:600),configuration:config)
 let window=NSWindow(contentRect:NSRect(x:0,y:0,width:900,height:600),styleMask:[.borderless],backing:.buffered,defer:false)
 window.contentView=web // never ordered or made key
 let ui=UI(); web.uiDelegate=ui
 web.loadHTMLString("""
 <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src inkora-editor://app inkora-asset://resource; style-src 'unsafe-inline'; script-src inkora-editor://app; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'">
 <style>\(try String(contentsOf:root.appendingPathComponent("probe.bundle/Contents/Resources/editor/style.css"),encoding:.utf8))</style><main id="app"></main><script src="inkora-editor://app/probe.js"></script>
 """,baseURL:URL(string:"inkora-editor://app/index.html"))
 func js(_ s:String) async throws -> Any { try await web.evaluateJavaScript(s) ?? NSNull() }
 for _ in 0..<100 { if (try? await js("typeof ready==='function'")) as? Bool == true { break }; try await Task.sleep(for:.milliseconds(100)) }
 let url="inkora-asset://resource/\(cap.token.uuidString)"
 _=try await js("window.assetURL='\(url)';ready(assetURL)")
 for _ in 0..<100 { if (try? await js("document.querySelector('.image-node img')?.naturalWidth===1")) as? Bool == true { break }; try await Task.sleep(for:.milliseconds(100)) }
 print("GEOMETRY",try await js("JSON.stringify(geometry())"))
 _=try await js("document.querySelector('.image-edit-button').focus()")
 print("KEYBOARD_FOCUS",try await js("document.activeElement.className"))
 _=try await js("document.querySelector('.inkora-code-license').click()")
 try await Task.sleep(for:.milliseconds(300))
 print("LICENSE",ui.windows,try await js("document.querySelectorAll('dialog').length"),try await js("runtime.getText()"))
 print("FORM",try await js("JSON.stringify(probe(\(CommandLine.arguments.contains("--plain") ? "false" : "true")))"))
 print("VISIBLE",window.isVisible)
 }
}
