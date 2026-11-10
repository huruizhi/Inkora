# INK-UX-135 证据索引

本目录根部日志是恢复Agent自跑；`inherited/`是逐字借用的原C日志，不能混计。
继承来源与固定产品SHA见 [任务](../../tasks/INK-UX-135.md)。

- `editor-build.log`：`make editor-build`，退出0。
- `web-targeted.log`：main/bridge/sidebar-connection/sidebar-library四文件137通过。
- `web-presentation-final.log`：main/bridge两文件127通过，缩进整理后复核。
- `native-navigation.log`：最终hostless8项通过，无显示窗口。
- `native-navigation-compile.log`：上述实际生产Swift编译，退出0；既有warnings保留。
- `native-contract-typecheck.log`：以下命令退出0；只编译，不执行既有两套测试。
- `swift-format.log`：限定Swift四文件strict检查，退出0，空日志表示无诊断。
- `geometry-selector-harness-red.log`：恢复Agent误用DOM后代选择器的测试失败，非产品red。
- `inherited-sha256.json`：借用副本字节哈希；三个原red与两个原green均保留，不改首稿。

```zsh
platform=$(xcrun --show-sdk-platform-path)
sources=(app/Sources/*.swift)
sources=("${(@)sources:#*/AppDelegate.swift}")
xcrun swiftc -typecheck -swift-version 6 \
  -I "$platform/Developer/usr/lib" \
  -F "$platform/Developer/Library/Frameworks" \
  "${sources[@]}" tests/InkoraTests/BridgeProtocolTests.swift \
  tests/InkoraTests/EditorWebViewTests.swift

xcrun swift-format lint --strict app/Sources/BridgeProtocol.swift \
  app/Sources/EditorBridge.swift app/Sources/EditorViewController.swift \
  tests/InkoraTests/SidebarNavigationTests.swift
```

Native几何采用不显示NSWindow/WK及标准Web Animations.finish采终态；
不声称实际屏幕paint/像素观感、墙钟动画时长、物理IME或macOS14通过。
