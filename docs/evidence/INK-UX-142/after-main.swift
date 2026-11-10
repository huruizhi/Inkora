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
 let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:320,pixelsHigh:180,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 memset(bitmap.bitmapData!,128,bitmap.bytesPerRow*bitmap.pixelsHigh)
 let data=bitmap.representation(using:.png,properties:[:])!

 try data.write(to:root.appendingPathComponent("a.png"))
 let broker=DocumentAssetBroker(); let epoch=broker.beginDocument(documentID:"probe")
 let cap=try broker.register(documentID:"probe",epoch:epoch,rootURL:root,percentEncodedRelativePath:"a.png",sha256:SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined(),mimeType:"image/png")
 let config=WKWebViewConfiguration()
 let bundle=Bundle(path:root.appendingPathComponent("probe.bundle").path)!
 config.setURLSchemeHandler(EditorResourceSchemeHandler(bundle:bundle)!,forURLScheme:"inkora-editor")
 config.setURLSchemeHandler(DocumentAssetSchemeHandler(broker:broker),forURLScheme:"inkora-asset")
 let web=WKWebView(frame:NSRect(x:0,y:0,width:CommandLine.arguments.contains("--narrow") ? 360 : 900,height:600),configuration:config)
 let window=NSWindow(contentRect:NSRect(x:0,y:0,width:CommandLine.arguments.contains("--narrow") ? 360 : 900,height:600),styleMask:[.borderless],backing:.buffered,defer:false)
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
 for _ in 0..<100 { if (try? await js("document.querySelector('.image-node img')?.naturalWidth===320")) as? Bool == true { break }; try await Task.sleep(for:.milliseconds(100)) }
 print("AFTER_GEOMETRY",try await js("JSON.stringify(afterGeometry())"))
 print("BOTTOM_LICENSE",try await js("JSON.stringify(bottomLicense())"))
 print("GEOMETRY",try await js("JSON.stringify(geometry())"))
 _=try await js("document.querySelector('.image-edit-button').focus()")
 print("KEYBOARD_ENTRY",try await js("JSON.stringify((()=>{const r=runtime.getText();const result=runtime.navigateRawRange(r,{anchor:2,head:2});const e=new KeyboardEvent('keydown',{key:'F10',altKey:true,bubbles:true,cancelable:true});document.querySelector('#editor').dispatchEvent(e);return {result,consumed:e.defaultPrevented,focus:document.activeElement.className};})())"))
 print("KEYBOARD_FOCUS",try await js("document.activeElement.className"))
 print("FORM",try await js("JSON.stringify(probe(\(CommandLine.arguments.contains("--plain") ? "false" : "true")))"))
 if CommandLine.arguments.contains("--plain") { print("LATE_SELECTION",try await js("JSON.stringify(lateSelection())")) }
 print("FALLBACKS",try await js("JSON.stringify(['missing','denied'].map(status=>{runtime.applyImageDescriptors([{href:'./a.png',status}]);const b=document.querySelector('.image-access-button');return {status,text:b.textContent,visibility:getComputedStyle(b).visibility,tabIndex:b.tabIndex};}))"))
 print("VISIBLE",window.isVisible)
 }
}
