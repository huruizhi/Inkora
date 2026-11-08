# INK-DES-001：应用图标

- 分支：`task/INK-DES-001-app-icon`
- 设计方向：用户于 2026-11-08 选定。白色圆角方形页面，中央一个深色衬线大写 "I"，同时也是文本光标（I-beam），两侧是浅灰文本行。

## 交付范围

- `design/icon/render-icon.swift`：参数化的图标源文件。在 1024×1024 设计空间内用 CoreGraphics 绘制原创矢量图形，不使用任何字体字形。只依赖系统框架。
- `app/Resources/Assets.xcassets/AppIcon.appiconset`：macOS 全尺寸 PNG（16–1024，含 @2x）。
- `project.yml`：引入资源目录，并设置 `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`。

## 规格

- 主体为 824×824 圆角方形，四周各留 100 pt 边距，图标自带投影。
- 64 px 及以下的尺寸使用更深的灰色文本行，保证小尺寸下仍可辨认。
- 加一条细描边，避免白色页面在白色背景上与背景混在一起。

## 重新生成

```sh
swift design/icon/render-icon.swift app/Resources/Assets.xcassets/AppIcon.appiconset
```

## 非范围与后续

- macOS 26+ 的 Liquid Glass 分层图标（Icon Composer `.icon`）。
- 浅色、深色、着色变体。
- 圆角目前用的是普通 rounded rect，不是 Apple 的连续曲率 squircle。
- Markdown 文档的专用图标。
