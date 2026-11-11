# Phase 1 真实 SDK 与退出链

基线 `b206f1986bfb2b3b3002e157747ec6f4ecdefa5e`，开始时 clean。

- 官方 https://api.github.com/repos/sparkle-project/Sparkle/releases/tags/2.10.0
- 资产 SDK tar.xz SHA256 `c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c`，实际 shasum 与官方 digest 相同。
- 官方 Package.swift 的 SPM binary checksum `17e28312b8e18ab7cdbbe09a6fb28cc55a5479ec6c371dbc07cdecd2a14fd959`。
- 固定缓存 `/tmp/inkora-sparkle-2.10.0`；工具 `bin/`。B 仅只读复用。
- `security find-identity -v -p codesigning` 返回 `0 valid identities found`。

真实无窗口 Foundation CLI：`clang -framework Foundation probe.m -o probe`，`codesign --force --sign - --options runtime probe`，随后 dlopen 官方 framework，返回1，Library Validation 拒绝不同 Team ID，原始输出见 adhoc-load.txt。未使用 disable-library-validation，未重签 SDK，未启动 NSApplication/AppDelegate。此结果不能称客户端更新通过，也说明静态强链接该 SDK 会给现有 ad-hoc 预览带来启动风险。

官方2.10.0源码通过 GitHub API tarball 获取，检查：

- `Sparkle/SPUUpdaterDelegate.h:343-356`：postpone只推迟relaunch，某些路径不调用。
- `Sparkle/SPUInstallerDriver.m:521-533`：postponement只调用一次。
- `Sparkle/InstallerProgress/InstallerProgressAppController.m:372-380`：发送NSRunningApplication terminate，源码明确Apple quit event允许取消/推迟，没有forceTerminate。
- `Sparkle/SPUUserDriver.h:234`：安装前向仍运行的应用发送quit event。

现有 `AppDelegate.applicationShouldTerminate` 返回terminateLater，逐文档prepareForClose（请求当前snapshot），失败reply(false)；全部成功后reviewUnsavedDocuments执行原生保存/放弃/取消；成功才finishRecoveryForNormalTermination及reply(true)。更新与普通退出必须共享此链，不能仅靠postpone保护。

已向根报告阻塞和最小提案，等待phase2接线裁决；不改变Release LV/Sandbox/Hardened Runtime。
