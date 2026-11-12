import AppKit

/// CSS viewport points only: no text, document identity, selection or editing authority.
struct TitlebarDragLayout: Decodable {
  let protocolVersion: Int
  let type: String
  let viewportWidth: Double
  let viewportHeight: Double
  let left: Double
  let right: Double
  let top: Double
  let bottom: Double
}

/// Transparent hit-test surface above WKContentView. Only the title label and
/// blank title strip receive native dragging and desktop sizing; tools and document content stay in WK.
@MainActor
final class WindowTitlebarDragSurface: NSView {
  private var dragRect = NSRect.zero
  private weak var maximizedWindow: NSWindow?
  private var desktopFrames: (restore: NSRect, expanded: NSRect)?

  override var isFlipped: Bool { true }

  override init(frame: NSRect) {
    super.init(frame: frame)
    identifier = NSUserInterfaceItemIdentifier("WindowTitlebarDragSurface")
    setAccessibilityElement(false)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  func clear() { dragRect = .zero }

  func apply(_ layout: TitlebarDragLayout) {
    clear()
    let numbers = [
      layout.viewportWidth, layout.viewportHeight,
      layout.left, layout.right, layout.top, layout.bottom,
    ]
    guard layout.protocolVersion == 1, layout.type == "titlebarLayout",
      numbers.allSatisfy({ $0.isFinite }),
      abs(layout.viewportWidth - bounds.width) <= 1,
      abs(layout.viewportHeight - bounds.height) <= 1,
      layout.left >= 90, layout.right <= bounds.width,
      layout.right > layout.left, layout.top >= 0, layout.bottom <= 28,
      layout.bottom > layout.top
    else { return }
    dragRect = NSRect(
      x: layout.left, y: layout.top,
      width: layout.right - layout.left, height: layout.bottom - layout.top)
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    guard !isHidden, dragRect.contains(convert(point, from: superview)) else { return nil }
    return self
  }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func mouseDown(with event: NSEvent) {
    guard event.type == .leftMouseDown, let window, window.isMovable,
      window.attachedSheet == nil, event.window === window,
      dragRect.contains(convert(event.locationInWindow, from: nil))
    else { return }
    if event.clickCount == 2 {
      toggleDesktopSize(of: window)
    } else if event.clickCount == 1 {
      window.performDrag(with: event)
    }
  }

  private func toggleDesktopSize(of window: NSWindow) {
    guard window.styleMask.contains(.resizable), !window.styleMask.contains(.fullScreen),
      !window.isMiniaturized, let desktop = window.screen?.visibleFrame,
      desktop.width > 0, desktop.height > 0
    else { return }

    if maximizedWindow === window, let frames = desktopFrames,
      framesMatch(window.frame, frames.expanded)
    {
      // A changed display or Dock configuration must not restore the window off-screen.
      var restore = frames.restore
      restore.size.width = min(restore.width, desktop.width)
      restore.size.height = min(restore.height, desktop.height)
      restore.origin.x = min(max(restore.minX, desktop.minX), desktop.maxX - restore.width)
      restore.origin.y = min(max(restore.minY, desktop.minY), desktop.maxY - restore.height)
      desktopFrames = nil
      maximizedWindow = nil
      window.setFrame(restore, display: true)
    } else {
      // Manual movement/resizing becomes the next restore point. Layout invalidation
      // only clears dragRect; it must preserve this state across the resize itself.
      desktopFrames = (restore: window.frame, expanded: desktop)
      maximizedWindow = window
      window.setFrame(desktop, display: true)
    }
  }

  private func framesMatch(_ lhs: NSRect, _ rhs: NSRect) -> Bool {
    abs(lhs.minX - rhs.minX) <= 1 && abs(lhs.minY - rhs.minY) <= 1
      && abs(lhs.width - rhs.width) <= 1 && abs(lhs.height - rhs.height) <= 1
  }

  // The same inkora JSON transport and origin checks as document events. Geometry
  // is refreshed after CSS layout, including sidebar transitions and statistics.
  static let layoutScript = """
    (() => {
      let scheduled = false;
      const publish = () => {
        scheduled = false;
        const title = document.querySelector('.editor-titlebar');
        const tools = document.querySelector('.editor-corner-tools');
        if (!title || !tools) return;
        const t = title.getBoundingClientRect(), c = tools.getBoundingClientRect();
        window.webkit.messageHandlers.inkora.postMessage(JSON.stringify({
          protocolVersion: 1, type: 'titlebarLayout',
          viewportWidth: innerWidth, viewportHeight: innerHeight,
          left: Math.max(90, t.left), right: Math.min(t.right, c.left),
          top: Math.max(0, t.top), bottom: Math.min(28, t.bottom)
        }));
      };
      const schedule = () => {
        if (!scheduled) { scheduled = true; setTimeout(publish, 0); }
      };
      const observer = new ResizeObserver(schedule);
      const waiting = new MutationObserver(() => watch());
      const watch = () => {
        const title = document.querySelector('.editor-titlebar');
        const tools = document.querySelector('.editor-corner-tools');
        if (!title || !tools) return;
        waiting.disconnect();
        observer.observe(title);
        observer.observe(tools);
        const panel = document.querySelector('.analysis-panel');
        if (panel) new MutationObserver(schedule).observe(panel,
          { attributes: true, attributeFilter: ['class', 'data-sidebar-phase'] });
        document.addEventListener('transitionend', event => {
          if (event.target?.classList?.contains('editor-workspace')) schedule();
        });
        schedule();
      };
      // Disconnect after mounting; ordinary document edits never publish geometry.
      waiting.observe(document.documentElement, { subtree: true, childList: true });
      window.addEventListener('resize', schedule);
      watch();
    })();
    """
}
