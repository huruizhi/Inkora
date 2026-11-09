import { JSDOM } from "jsdom";
import { afterEach, expect, it } from "vitest";
import type { EditorView } from "prosemirror-view";
import { createEditorRuntime } from "./editor-runtime";

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
});

function boot(raw: string) {
  const dom = new JSDOM("<main></main>");
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector("main")!;
  const runtime = createEditorRuntime(parent, raw, () => {});
  cleanups.push(() => { runtime.destroy(); dom.window.close(); });
  return { runtime, parent };
}

it.each([
  ["x **alpha omega**\n", "x alpha", "beta **omega**\n"],
  ["**alpha omega** x\n", "omega x", "**alpha beta**\n"],
])("preserves the unselected side of a crossed mark owner in %j", (raw, query, expected) => {
  const { runtime } = boot(raw);
  expect(runtime.replaceVisualSearch(raw, runtime.search(query, 0), "replace-all", "beta"))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 1 } });
  expect(runtime.getText()).toBe(expected);
});

it.each([
  ["[alpha][ref]\n\n[ref]: ./x \"keep\"\n", "alpha", "beta", "[beta][ref]\n\n[ref]: ./x \"keep\"\n"],
  ["[**alpha**][ref] omega\n\n[ref]: ./x\n", "alpha omega", "beta", "**beta**\n\n[ref]: ./x\n"],
])("keeps reference-link ownership through production replacement in %j", (raw, query, replacement, expected) => {
  const { runtime } = boot(raw);
  expect(runtime.replaceVisualSearch(raw, runtime.search(query, 0), "replace-all", replacement))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 1 } });
  expect(runtime.getText()).toBe(expected);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
});

it("converts a changed autolink label to an owned inline link without changing its target", () => {
  const raw = "<https://example.test/path> tail\n";
  const { runtime, parent } = boot(raw);
  expect(runtime.replaceVisualSearch(raw, runtime.search("example", 0), "replace-all", "sample"))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 1 } });
  expect(runtime.getText()).toBe("[https\\:\\/\\/sample\\.test\\/path](<https://example.test/path>) tail\n");
  const link = parent.querySelector<HTMLAnchorElement>(".ProseMirror a")!;
  expect(link.textContent).toBe("https://sample.test/path");
  expect(link.getAttribute("href")).toBe("https://example.test/path");
});

it.each([0, 1])("replaces repeated matches in one autolink and preserves selected match %i", (matchIndex) => {
  const raw = "<https://example.test/example> tail\r\n";
  const { runtime, parent } = boot(raw);
  const expected = "[https\\:\\/\\/sample\\.test\\/sample](<https://example.test/example>) tail\r\n";
  const result = runtime.search("example", 0);
  expect(runtime.navigateVisualSearch(raw, result, { kind: "index", matchIndex }).ok).toBe(true);
  expect(runtime.replaceVisualSearch(raw, result, "replace-all", "sample"))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 2 } });
  expect(runtime.getText()).toBe(expected);
  const link = parent.querySelector<HTMLAnchorElement>(".ProseMirror a")!;
  expect(link.textContent).toBe("https://sample.test/sample");
  expect(link.getAttribute("href")).toBe("https://example.test/example");
  expect(runtime.enterSourceMode()).toBe(true);
  const caret = (matchIndex === 0 ? expected.indexOf("sample") : expected.lastIndexOf("sample")) + "sample".length;
  expect(runtime.getSourceSelection(expected)).toEqual({ ok: true, value: { anchor: caret, head: caret } });
  expect(runtime.cancelSourceDraft()).toBe(true);
  const liveView = (runtime as unknown as { view: EditorView }).view;
  liveView.dispatch(liveView.state.tr.insertText("X"));
  expect(runtime.getText()).toBe(expected.slice(0, caret) + "X" + expected.slice(caret));
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status.canUndo).toBe(false);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});

it("removes a fully consumed autolink when the match crosses into plain text", () => {
  const raw = "<https://example.test> tail\n";
  const { runtime, parent } = boot(raw);
  expect(runtime.replaceVisualSearch(raw, runtime.search("https://example.test tail", 0), "replace-all", "beta").ok)
    .toBe(true);
  expect(runtime.getText()).toBe("beta\n");
  expect(parent.querySelector(".ProseMirror a")).toBeNull();
});

it("rejects Replace All atomically when the complete visual search reaches the hard cap", () => {
  const raw = `${Array.from({ length: 10_001 }, () => "alpha").join(" ")}\n`;
  const { runtime } = boot(raw);
  const before = runtime.status;
  const displayed = runtime.search("alpha", 0, { maxResults: 100 });
  expect(displayed).toMatchObject({ truncated: true });
  expect(displayed.matches).toHaveLength(100);
  expect(runtime.replaceVisualSearch(raw, displayed, "replace-all", "beta"))
    .toEqual({ ok: false, message: "完整匹配达到安全上限，整批未应用" });
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status).toEqual(before);
});

it("keeps raw, selection, history and savepoint when one batch candidate is invalid", () => {
  const raw = "alpha alpha\n";
  const { runtime } = boot(raw);
  const result = runtime.search("alpha", 0);
  expect(runtime.navigateVisualSearch(raw, result, { kind: "index", matchIndex: 1 }).ok).toBe(true);
  expect(runtime.enterSourceMode()).toBe(true);
  const selection = runtime.getSourceSelection(raw);
  expect(runtime.cancelSourceDraft()).toBe(true);
  const before = runtime.status;
  expect(runtime.replaceVisualSearch(raw, result, "replace-all", "\uD800"))
    .toEqual({ ok: false, message: "替换范围、顺序或Unicode无效，整批未应用" });
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status).toEqual(before);
  expect(runtime.enterSourceMode()).toBe(true);
  expect(runtime.getSourceSelection(raw)).toEqual(selection);
});

it("replaces 1000 synthetic jsdom matches from one stable visual index", () => {
  const raw = `${Array.from({ length: 1_000 }, () => "alpha").join(" ")}\n`;
  const expected = `${Array.from({ length: 1_000 }, () => "beta").join(" ")}\n`;
  const { runtime } = boot(raw);
  const displayed = runtime.search("alpha", 0, { maxResults: 100 });
  expect(runtime.replaceVisualSearch(raw, displayed, "replace-all", "beta"))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 1_000 } });
  expect(runtime.getText()).toBe(expected);
});
