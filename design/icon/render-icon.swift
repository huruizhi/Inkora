// Renders the Inkora app icon into a macOS AppIcon.appiconset.
//
// Usage: swift design/icon/render-icon.swift <output-appiconset-dir>
//
// Design (2026-11-08, approved direction): a white rounded-square page with a
// dark serif capital "I" that doubles as a text cursor (I-beam), flanked by
// light grey text lines. All geometry is original vector drawing in a
// 1024x1024 y-down design space; no font glyphs are used.
//
// Grid: the body is the standard macOS 824x824 rounded square inset by 100pt,
// leaving the margin for the drop shadow that macOS app icon artwork carries.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let canvas: CGFloat = 1024

func color(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
  CGColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
    green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255,
    alpha: alpha)
}

// MARK: - Geometry (design space, y grows downward)

let body = CGRect(x: 100, y: 100, width: 824, height: 824)
let bodyRadius: CGFloat = 185

/// Serif capital I with bracketed serifs and slightly rounded serif tips.
func glyphPath() -> CGPath {
  let left: CGFloat = 362, right: CGFloat = 662
  let top: CGFloat = 287, bottom: CGFloat = 737
  let serif: CGFloat = 46  // serif thickness
  let stemLeft: CGFloat = 452, stemRight: CGFloat = 572
  let bracket: CGFloat = 46
  let tip: CGFloat = 10  // serif corner radius

  let p = CGMutablePath()
  p.move(to: CGPoint(x: left + tip, y: top))
  p.addArc(tangent1End: CGPoint(x: right, y: top), tangent2End: CGPoint(x: right, y: top + serif), radius: tip)
  p.addArc(
    tangent1End: CGPoint(x: right, y: top + serif), tangent2End: CGPoint(x: stemRight, y: top + serif), radius: tip)
  p.addLine(to: CGPoint(x: stemRight + bracket, y: top + serif))
  p.addQuadCurve(
    to: CGPoint(x: stemRight, y: top + serif + bracket), control: CGPoint(x: stemRight, y: top + serif))
  p.addLine(to: CGPoint(x: stemRight, y: bottom - serif - bracket))
  p.addQuadCurve(
    to: CGPoint(x: stemRight + bracket, y: bottom - serif), control: CGPoint(x: stemRight, y: bottom - serif))
  p.addArc(
    tangent1End: CGPoint(x: right, y: bottom - serif), tangent2End: CGPoint(x: right, y: bottom), radius: tip)
  p.addArc(tangent1End: CGPoint(x: right, y: bottom), tangent2End: CGPoint(x: left, y: bottom), radius: tip)
  p.addArc(tangent1End: CGPoint(x: left, y: bottom), tangent2End: CGPoint(x: left, y: bottom - serif), radius: tip)
  p.addArc(
    tangent1End: CGPoint(x: left, y: bottom - serif), tangent2End: CGPoint(x: stemLeft, y: bottom - serif),
    radius: tip)
  p.addLine(to: CGPoint(x: stemLeft - bracket, y: bottom - serif))
  p.addQuadCurve(
    to: CGPoint(x: stemLeft, y: bottom - serif - bracket), control: CGPoint(x: stemLeft, y: bottom - serif))
  p.addLine(to: CGPoint(x: stemLeft, y: top + serif + bracket))
  p.addQuadCurve(
    to: CGPoint(x: stemLeft - bracket, y: top + serif), control: CGPoint(x: stemLeft, y: top + serif))
  p.addArc(
    tangent1End: CGPoint(x: left, y: top + serif), tangent2End: CGPoint(x: left, y: top), radius: tip)
  p.addArc(tangent1End: CGPoint(x: left, y: top), tangent2End: CGPoint(x: right, y: top), radius: tip)
  p.closeSubpath()
  return p
}

/// Text lines as (centerY, startX, endX). Rows level with the serifs stop
/// short of the serif; middle rows run up to the stem, like text split by a cursor.
let lineHeight: CGFloat = 34
let lines: [(CGFloat, CGFloat, CGFloat)] = [
  (338, 206, 330), (338, 694, 818),
  (434, 214, 420), (434, 604, 826),
  (530, 214, 420), (530, 604, 830),
  (626, 214, 420), (626, 604, 820),
  (722, 234, 330), (722, 694, 790),
]

// MARK: - Rendering

func render(pixels: Int) -> CGImage {
  let space = CGColorSpace(name: CGColorSpace.sRGB)!
  let ctx = CGContext(
    data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  let scale = CGFloat(pixels) / canvas
  ctx.interpolationQuality = .high
  ctx.setShouldAntialias(true)
  // Flip into the y-down design space.
  ctx.translateBy(x: 0, y: CGFloat(pixels))
  ctx.scaleBy(x: scale, y: -scale)

  let bodyPath = CGPath(roundedRect: body, cornerWidth: bodyRadius, cornerHeight: bodyRadius, transform: nil)

  // Drop shadow (shadow offset/blur are in device space, y up).
  ctx.saveGState()
  ctx.setShadow(offset: CGSize(width: 0, height: -10 * scale), blur: 28 * scale, color: color(0x000000, alpha: 0.28))
  ctx.addPath(bodyPath)
  ctx.setFillColor(color(0xFFFFFF))
  ctx.fillPath()
  ctx.restoreGState()

  // Page: near-white with a faint top-to-bottom falloff.
  ctx.saveGState()
  ctx.addPath(bodyPath)
  ctx.clip()
  let page = CGGradient(
    colorsSpace: space, colors: [color(0xFFFFFF), color(0xF0F1F4)] as CFArray, locations: [0, 1])!
  ctx.drawLinearGradient(
    page, start: CGPoint(x: 0, y: body.minY), end: CGPoint(x: 0, y: body.maxY), options: [])

  // Text lines. Small sizes get a slightly darker grey so the lines survive.
  ctx.setFillColor(pixels <= 64 ? color(0xD9DADF) : color(0xE7E8EC))
  for (y, x0, x1) in lines {
    let rect = CGRect(x: x0, y: y - lineHeight / 2, width: x1 - x0, height: lineHeight)
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: lineHeight / 2, cornerHeight: lineHeight / 2, transform: nil))
  }
  ctx.fillPath()

  // The I-beam glyph.
  ctx.addPath(glyphPath())
  ctx.setFillColor(color(0x232428))
  ctx.fillPath()
  ctx.restoreGState()

  // Hairline edge so the white page reads on white backgrounds.
  ctx.addPath(bodyPath)
  ctx.setStrokeColor(color(0x000000, alpha: 0.08))
  ctx.setLineWidth(max(2, 1 / scale))
  ctx.strokePath()

  return ctx.makeImage()!
}

func writePNG(_ image: CGImage, to url: URL) {
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { fatalError("Failed to write \(url.path)") }
}

// MARK: - appiconset

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write(Data("usage: render-icon.swift <AppIcon.appiconset>\n".utf8))
  exit(64)
}
let out = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

var entries: [[String: String]] = []
for point in [16, 32, 128, 256, 512] {
  for factor in [1, 2] {
    let pixels = point * factor
    let name = factor == 1 ? "icon_\(point)x\(point).png" : "icon_\(point)x\(point)@2x.png"
    writePNG(render(pixels: pixels), to: out.appendingPathComponent(name))
    entries.append(["filename": name, "idiom": "mac", "scale": "\(factor)x", "size": "\(point)x\(point)"])
  }
}
let contents: [String: Any] = ["images": entries, "info": ["author": "xcode", "version": 1]]
let json = try JSONSerialization.data(withJSONObject: contents, options: [.prettyPrinted, .sortedKeys])
try json.write(to: out.appendingPathComponent("Contents.json"))
print("Wrote \(entries.count) images to \(out.path)")
