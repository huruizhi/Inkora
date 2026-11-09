import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, expect, it } from "vitest";
import { createEditorRuntime } from "./editor-runtime";

const fixtures = JSON.parse(readFileSync(new URL("../../docs/acceptance/visual-search/cases.json", import.meta.url), "utf8")) as {
  cases: Array<{ id: number; name: string; kind: string; query: string; replacement: string; safeVisibleMatches: number; input: string; expected: string }>;
};
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

it.each(fixtures.cases)("counts frozen editable content $id: $name through the production runtime", fixture => {
  const raw = readFileSync(new URL(`../../docs/acceptance/visual-search/${fixture.input}`, import.meta.url), "utf8");
  const { runtime } = boot(raw);
  const before = runtime.status;
  const result = runtime.search(fixture.query, 0);
  expect(result.matches).toHaveLength(fixture.safeVisibleMatches);
  expect(result.truncated).toBe(false);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status).toEqual(before);
});

it("does not join paragraph/cell boundaries into a single editable match", () => {
  const { runtime } = boot("one\n\ntwo\n\n| left | right |\n| --- | --- |\n");
  expect(runtime.search("one\ntwo", 0).matches).toHaveLength(0);
  expect(runtime.search("left\nright", 0).matches).toHaveLength(0);
});

it("maps a full cross-mark word to the exact original source range", () => {
  const raw = "a**lp**ha\n";
  const { runtime } = boot(raw);
  const result = runtime.search("alpha", 0);
  expect(runtime.navigateVisualSearch(raw, result, { kind: "index", matchIndex: 0 }).ok).toBe(true);
  expect(runtime.enterSourceMode()).toBe(true);
  expect(runtime.getSourceSelection(raw)).toEqual({ ok: true, value: { anchor: 0, head: raw.length - 1 } });
  expect(runtime.status).toMatchObject({ dirty: false, canUndo: false, canRedo: false });
});

it.each(fixtures.cases.filter(fixture => fixture.kind === "replace-all"))(
  "replaces frozen visible content $id: $name as one production history unit", fixture => {
    const raw = readFileSync(new URL(`../../docs/acceptance/visual-search/${fixture.input}`, import.meta.url), "utf8");
    const expected = readFileSync(new URL(`../../docs/acceptance/visual-search/${fixture.expected}`, import.meta.url), "utf8");
    const { runtime } = boot(raw);
    const result = runtime.search(fixture.query, 0, {maxResults:100});
    const applied = runtime.replaceVisualSearch(raw, result, "replace-all", fixture.replacement);
    expect(applied).toEqual({ok:true,value:{changed:true,replacedCount:fixture.safeVisibleMatches}});
    expect(runtime.snapshotText()).toEqual({ok:true,value:expected});
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.status.canUndo).toBe(false);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(expected);
  },
);

it("replaces a complete link and adjacent plain text without inheriting its target", () => {
  const raw = '[alpha](./dest "title") omega\n';
  const { runtime } = boot(raw);
  const result = runtime.search("alpha omega", 0);
  expect(runtime.replaceVisualSearch(raw, result, "replace-all", "beta")).toEqual({ok:true,value:{changed:true,replacedCount:1}});
  expect(runtime.getText()).toBe("beta\n");
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
});
