import AppKit

/// Native application-menu entry points. Creating this object does not check,
/// start an updater, or display any windows.
@MainActor
final class UpdateMenuController: NSObject, NSMenuDelegate {
  private let service: UpdateService
  private let releaseLookup: ReleaseLookup?
  private let currentBuild: UInt64
  private var lookupInProgress = false
  let menu = NSMenu(title: "更新设置")
  let checkItem = NSMenuItem(title: "检查更新…", action: nil, keyEquivalent: "")
  let settingsItem = NSMenuItem(title: "更新设置", action: nil, keyEquivalent: "")
  private let checksItem = NSMenuItem(title: "自动检查更新", action: nil, keyEquivalent: "")
  private let downloadsItem = NSMenuItem(
    title: "后台下载，退出时安装", action: nil, keyEquivalent: "")
  private let stableItem = NSMenuItem(title: "Stable", action: nil, keyEquivalent: "")
  private let betaItem = NSMenuItem(title: "Beta（含 Stable）", action: nil, keyEquivalent: "")

  init(service: UpdateService, releaseLookup: ReleaseLookup? = nil, currentBuild: UInt64 = 0) {
    self.releaseLookup = releaseLookup
    self.currentBuild = currentBuild
    self.service = service
    super.init()
    checkItem.target = self
    checkItem.action = #selector(checkForUpdates(_:))
    settingsItem.submenu = menu
    menu.delegate = self
    menu.autoenablesItems = false
    for (item, action) in [
      (checksItem, #selector(toggleChecks(_:))),
      (downloadsItem, #selector(toggleDownloads(_:))),
      (stableItem, #selector(selectStable(_:))), (betaItem, #selector(selectBeta(_:))),
    ] {
      item.target = self
      item.action = action
      menu.addItem(item)
    }
    refresh()
  }

  func menuNeedsUpdate(_ menu: NSMenu) { refresh() }

  private func refresh() {
    checksItem.state = service.preferences.automaticChecks ? .on : .off
    downloadsItem.state = service.preferences.automaticDownloads ? .on : .off
    stableItem.state = service.preferences.channel == .stable ? .on : .off
    betaItem.state = service.preferences.channel == .beta ? .on : .off
    downloadsItem.isEnabled = service.preferences.automaticChecks
    stableItem.isEnabled = service.canChangeChannel && !lookupInProgress
    betaItem.isEnabled = service.canChangeChannel && !lookupInProgress
    let pending = service.preferences.pendingUpdateBuild
    let explanation = pending == nil ? nil : "已下载更新待安装；通道保持到该更新完成，避免恢复旧通道安装。"
    stableItem.toolTip = explanation
    betaItem.toolTip = explanation
  }

  @objc private func checkForUpdates(_ sender: Any?) {
    guard !service.checkForUpdates() else { return }
    if let releaseLookup {
      guard !lookupInProgress else { return }
      lookupInProgress = true
      refresh()
      checkItem.title = "正在检查发行信息…"
      Task { [self] in
        defer {
          lookupInProgress = false
          checkItem.title = "检查更新…"
          refresh()
        }
        let alert = NSAlert()
        var page: URL?
        do {
          if let release = try await releaseLookup.latest(channel: service.preferences.channel) {
            page = release.page
            alert.messageText = release.build > currentBuild ? "发现较新发行版本" : "没有较新的可验证发行版本"
            alert.informativeText =
              "当前 build \(currentBuild)，发行 build \(release.build)。此预览仅检查公开发行信息，不自动安装；自动安装需要可信签名构建。"
          } else {
            alert.messageText = "无法验证版本信息"
            alert.informativeText = "所选通道没有可验证的公开发行记录。"
          }
        } catch {
          alert.messageText = "无法验证版本信息"
          alert.informativeText = "网络请求失败，或官方发行元数据缺失、损坏或不匹配。请稍后重试。"
        }
        alert.addButton(withTitle: "好")
        if page != nil { alert.addButton(withTitle: "查看官方发行页") }
        if alert.runModal() == .alertSecondButtonReturn, let page { NSWorkspace.shared.open(page) }
      }
      return
    }
    let alert = NSAlert()
    alert.messageText = "暂时无法检查更新"
    alert.informativeText = service.unavailableReason ?? "更新任务正在进行，请完成或取消当前任务后重试。"
    alert.addButton(withTitle: "好")
    alert.runModal()
  }

  @objc private func toggleChecks(_ sender: Any?) {
    service.setAutomaticChecks(!service.preferences.automaticChecks)
    refresh()
  }
  @objc private func toggleDownloads(_ sender: Any?) {
    service.setAutomaticDownloads(!service.preferences.automaticDownloads)
    refresh()
  }
  @objc private func selectStable(_ sender: Any?) {
    guard !lookupInProgress else { return }
    _ = service.selectChannel(.stable)
    refresh()
  }
  @objc private func selectBeta(_ sender: Any?) {
    guard !lookupInProgress else { return }
    _ = service.selectChannel(.beta)
    refresh()
  }
}
