import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { revealTextareaOffset } from "./textarea-visibility";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";
import { analyzeDocument } from "./document-analysis";
import { rawOffsetToTextareaOffset } from "./source-navigation";

const opened: JSDOM[] = [];
const runtimes: EditorRuntime[] = [];
const priorDocument = globalThis.document;
const priorWindow = globalThis.window;
afterEach(() => {
  runtimes.splice(0).forEach(runtime => runtime.destroy());
  vi.restoreAllMocks();
  opened.splice(0).forEach(dom => dom.window.close());
  Object.defineProperty(globalThis, "document", { configurable: true, value: priorDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
});

function surface(targetTop: number, scrollTop = 0) {
  const dom = new JSDOM("<input aria-label='query'><textarea></textarea>", { pretendToBeVisual: true });
  opened.push(dom);
  const area = dom.window.document.querySelector("textarea")!;
  const query = dom.window.document.querySelector("input")!;
  area.value = "first\nsecond\nthird";
  area.style.cssText = "font:16px/20px monospace;padding:12px 16px;white-space:pre-wrap;tab-size:4";
  Object.defineProperties(area, {
    clientHeight: { value: 180 }, clientWidth: { value: 600 }, scrollHeight: { value: 1200 },
  });
  area.scrollTop = scrollTop;
  area.setSelectionRange(2, 7, "backward");
  query.focus();
  vi.spyOn(dom.window.HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.textareaRangeMarker === "true" ? 100 + targetTop : 100;
    return { top, bottom: top + 20, left: 0, right: 600, width: 600, height: 20, x: 0, y: top, toJSON() {} };
  });
  return { dom, area, query };
}

it("reveals a target below the viewport without changing content, focus or selection", () => {
  const { dom, area, query } = surface(900);
  const before = area.value;
  revealTextareaOffset(area, 6);
  expect(900 - area.scrollTop).toBeGreaterThanOrEqual(0);
  expect(920 - area.scrollTop).toBeLessThanOrEqual(area.clientHeight);
  expect(area.value).toBe(before);
  expect([area.selectionStart, area.selectionEnd, area.selectionDirection]).toEqual([2, 7, "backward"]);
  expect(dom.window.document.activeElement).toBe(query);
  expect(dom.window.document.body.children).toHaveLength(2);
});

it("reveals a target above the viewport in read-only mode", () => {
  const { area } = surface(100, 850);
  area.readOnly = true;
  revealTextareaOffset(area, 0);
  expect(area.scrollTop).toBeLessThanOrEqual(100);
  expect(120 - area.scrollTop).toBeLessThanOrEqual(area.clientHeight);
  expect(area.readOnly).toBe(true);
});

it("does not scroll when the target is already visible", () => {
  const { area } = surface(150, 100);
  revealTextareaOffset(area, 6);
  expect(area.scrollTop).toBe(100);
});

it("ignores invalid offsets without creating temporary DOM", () => {
  const { dom, area } = surface(900);
  revealTextareaOffset(area, -1);
  revealTextareaOffset(area, area.value.length + 1);
  expect(area.scrollTop).toBe(0);
  expect(dom.window.document.body.children).toHaveLength(2);
});

for (const mode of ["source", "read_only"] as const) {
  for (const operation of ["heading", "search"] as const) {
    it(`${mode} ${operation} navigation reveals its mapped offset on the real runtime`, () => {
      const { dom, area: placeholder, query } = surface(900);
      placeholder.remove();
      Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
      Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
      const host = document.createElement("main");
      document.body.append(host);
      const raw = mode === "read_only" ? "# First\r\rtarget\r" : "\uFEFF# First\r\n\r\ntarget\r\n";
      const changes: unknown[] = [];
      const runtime = createEditorRuntime(host, raw, (...args) => changes.push(args));
      runtimes.push(runtime);
      if (mode === "source") expect(runtime.enterSourceMode()).toBe(true);
      const area = host.querySelector("textarea")!;
      Object.defineProperties(area, {
        clientHeight: { value: 180 }, clientWidth: { value: 600 }, scrollHeight: { value: 1200 },
      });
      const beforeStatus = runtime.status;
      const beforeChanges = changes.length;
      if (operation === "search") {
        query.focus();
        const start = raw.indexOf("target");
        expect(runtime.selectSourceRange(raw, { anchor: start + 6, head: start }).ok).toBe(true);
        expect([area.selectionStart, area.selectionEnd, area.selectionDirection]).toEqual([
          rawOffsetToTextareaOffset(raw, start), rawOffsetToTextareaOffset(raw, start + 6), "backward",
        ]);
        expect(document.activeElement).toBe(query);
      } else {
        const heading = analyzeDocument({ raw, revision: 0 }).headings[0];
        expect(runtime.navigateToHeading(raw, { ...heading, index: 0 }).ok).toBe(true);
        expect(area.selectionStart).toBe(rawOffsetToTextareaOffset(raw, heading.start));
      }
      expect(920 - area.scrollTop).toBeLessThanOrEqual(area.clientHeight);
      expect(runtime.getText()).toBe(raw);
      expect(runtime.status).toEqual(beforeStatus);
      expect(changes).toHaveLength(beforeChanges);
    });
  }
}
