/** Title tools remain focusable while visually quiet; no editor state is involved. */
export class SidebarChrome {
  private timer?: ReturnType<typeof setTimeout>;
  private hovered = false;
  private composing = false;
  private menu = false;
  private destroyed = false;
  private readonly abort = new AbortController();
  constructor(private readonly toolbar: HTMLElement) {
    toolbar.dataset.toolsVisible = "false";
    // Use the element's realm: hostless DOM tests and WKWebView share this path.
    const Abort = toolbar.ownerDocument.defaultView?.AbortController;
    this.abort = Abort ? new Abort() : this.abort;
    const on = (name: string, callback: () => void) => toolbar.addEventListener(name, callback, { signal: this.abort.signal });
    on("pointerenter", () => { this.hovered = true; this.show(); });
    on("pointerleave", () => { this.hovered = false; this.schedule(); });
    on("focusin", () => this.show());
    on("focusout", () => queueMicrotask(() => this.schedule()));
    on("compositionstart", () => { this.composing = true; this.show(); });
    on("compositionend", () => { this.composing = false; this.schedule(); });
  }
  setMenuOpen(open: boolean): void { this.menu = open; if (open) this.show(); else this.schedule(); }
  destroy(): void { this.destroyed = true; this.clear(); this.abort.abort(); }
  private clear(): void { clearTimeout(this.timer); this.timer = undefined; }
  private show(): void { if (this.destroyed) return; this.clear(); this.toolbar.dataset.toolsVisible = "true"; }
  private schedule(): void {
    if (this.destroyed) return;
    this.clear();
    if (this.hovered || this.composing || this.menu || this.toolbar.contains(this.toolbar.ownerDocument.activeElement)) return;
    this.timer = setTimeout(() => { this.timer = undefined; this.toolbar.dataset.toolsVisible = "false"; }, 5000);
  }
}

/** Layout expands first; content appears only once its workspace has made room. */
export class SidebarLayout {
  private timer?: ReturnType<typeof setTimeout>;
  private readonly media?: MediaQueryList;
  private collapsed = true;
  constructor(private readonly root: HTMLElement) {
    this.media = root.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.media?.addEventListener("change", this.finish);
    root.addEventListener("transitionend", this.transitionEnd);
    root.dataset.sidebarPhase = "closed";
  }
  setCollapsed(collapsed: boolean): void {
    clearTimeout(this.timer);
    this.collapsed = collapsed;
    this.root.dataset.sidebarPhase = collapsed ? "closing" : "reserving";
    this.root.classList.toggle("analysis-panel-collapsed", collapsed);
    if (this.media?.matches) this.finish();
    else this.timer = setTimeout(this.finish, 220);
  }
  private readonly transitionEnd = (event: TransitionEvent): void => {
    if (event.target === this.root && event.propertyName === "flex-basis") this.finish();
  };
  private readonly finish = (): void => {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.root.dataset.sidebarPhase = this.collapsed ? "closed" : "open";
  };
  destroy(): void { clearTimeout(this.timer); this.media?.removeEventListener("change", this.finish); this.root.removeEventListener("transitionend", this.transitionEnd); }
}
