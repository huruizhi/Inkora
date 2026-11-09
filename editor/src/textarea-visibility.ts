const textMetrics = [
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "font-stretch", "font-kerning", "font-feature-settings", "font-variation-settings",
  "letter-spacing", "word-spacing", "line-height", "text-indent", "text-align",
  "text-transform", "tab-size", "direction", "word-break", "overflow-wrap",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
] as const;

/** WebKit does not reveal programmatic textarea selections reliably.
 * Measure the existing text in an inert mirror; only the textarea scroll changes.
 */
export function revealTextareaOffset(area: HTMLTextAreaElement, offset: number): void {
  const viewport = area.ownerDocument.defaultView;
  if (!viewport || !area.isConnected || !Number.isInteger(offset) || offset < 0 ||
      offset > area.value.length || area.clientHeight <= 0 || area.clientWidth <= 0) return;

  const style = viewport.getComputedStyle(area);
  const mirror = area.ownerDocument.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;border:0;margin:0;box-sizing:border-box;";
  for (const property of textMetrics) mirror.style.setProperty(property, style.getPropertyValue(property));
  // clientWidth excludes the native scrollbar and border, but includes padding.
  mirror.style.width = `${area.clientWidth}px`;
  mirror.style.whiteSpace = area.wrap === "off" ? "pre" : "pre-wrap";
  const marker = area.ownerDocument.createElement("span");
  marker.dataset.textareaRangeMarker = "true";
  const point = area.value.codePointAt(offset);
  const next = point === undefined ? "" : String.fromCodePoint(point);
  marker.textContent = next || "\u200b";
  mirror.append(
    area.ownerDocument.createTextNode(area.value.slice(0, offset)),
    marker,
    area.ownerDocument.createTextNode(area.value.slice(offset + next.length)),
  );
  area.ownerDocument.body.append(mirror);
  try {
    const rectangle = marker.getBoundingClientRect();
    const top = rectangle.top - mirror.getBoundingClientRect().top;
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5 || 20;
    const bottom = top + Math.max(rectangle.height, lineHeight);
    const margin = Math.min(16, area.clientHeight / 4);
    let desired = area.scrollTop;
    if (top < desired + margin) desired = top - margin;
    else if (bottom > desired + area.clientHeight - margin) desired = bottom - area.clientHeight + margin;
    area.scrollTop = Math.max(0, Math.min(desired, area.scrollHeight - area.clientHeight));
  } finally {
    mirror.remove();
  }
}
