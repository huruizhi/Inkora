import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, expect, it } from "vitest";
import { createEditorRuntime, type EditorRuntimeOptions } from "./editor-runtime";

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

function boot(raw: string, options: EditorRuntimeOptions = {}) {
  const dom = new JSDOM("<main></main>");
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = dom.window.document.querySelector("main")!;
  const runtime = createEditorRuntime(parent, raw, () => {}, options);
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

it.each([
  [{ documentID: "same-doc", epoch: 1 }, { documentID: "same-doc", epoch: 2 }],
  [{ documentID: "old-doc", epoch: 1 }, { documentID: "new-doc", epoch: 1 }],
])("rejects navigation and replacement results across runtime identity %j → %j", (previousIdentity, currentIdentity) => {
  const raw = "alpha alpha\n";
  const previous = boot(raw, { searchIdentity: previousIdentity });
  const staleResult = previous.runtime.search("alpha", 0);
  cleanups.pop()?.();

  const { runtime } = boot(raw, { searchIdentity: currentIdentity });
  const before = runtime.status;
  expect(runtime.navigateVisualSearch(raw, staleResult, { kind: "index", matchIndex: 0 }))
    .toEqual({ ok: false, message: "查找结果已过期" });
  expect(runtime.replaceVisualSearch(raw, staleResult, "replace-all", "beta"))
    .toEqual({ ok: false, message: "查找结果已过期" });
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status).toEqual(before);
});

it("accepts a by-value copy of a result from the current runtime load", () => {
  const raw = "alpha\n";
  const { runtime } = boot(raw, { searchIdentity: { documentID: "doc", epoch: 3 } });
  const first = runtime.search("alpha", 0);
  expect(runtime.search("alpha", 0)).toEqual(first);
  const copied = JSON.parse(JSON.stringify(first)) as ReturnType<typeof runtime.search>;
  expect(runtime.replaceVisualSearch(raw, copied, "replace-all", "beta"))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 1 } });
  expect(runtime.getText()).toBe("beta\n");
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

it("root066: single code replacement keeps the source caret after its inserted text", () => {
  const raw = "使用 `alpha`。\n";
  const expected = "使用 ``beta ` x``。\n";
  const { runtime } = boot(raw);
  const result = runtime.search("alpha", 0);
  expect(runtime.navigateVisualSearch(raw, result, {kind:"index",matchIndex:0}).ok).toBe(true);
  expect(runtime.replaceVisualSearch(raw, result, "replace-one", "beta ` x").ok).toBe(true);
  expect(runtime.getText()).toBe(expected);
  expect(runtime.enterSourceMode()).toBe(true);
  const caret = expected.indexOf("beta ` x") + "beta ` x".length;
  expect(runtime.getSourceSelection(expected)).toEqual({ok:true,value:{anchor:caret,head:caret}});
});

it.each([
  ["**alpha** omega\n", "**beta**\n"],
  ["alpha **omega**\n", "beta\n"],
  ["[**alpha**](./x) omega\n", "**beta**\n"],
])("root066: replaces cross-format words using the start marks in %j", (raw, expected) => {
  const { runtime } = boot(raw);
  expect(runtime.replaceVisualSearch(raw, runtime.search("alpha omega",0), "replace-all", "beta").ok).toBe(true);
  expect(runtime.getText()).toBe(expected);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
});

it.each([
  ["**alpha *omega***\n", "**beta**\n"],
  ["__alpha _omega___\n", "__beta__\n"],
  ["*alpha **omega***\n", "*beta*\n"],
  ["_alpha __omega___\n", "_beta_\n"],
])("replaces CommonMark nested same-marker runs in %j", (raw, expected) => {
  const { runtime, parent } = boot(raw);
  expect(parent.querySelector("strong")?.textContent).toContain("omega");
  expect([...parent.querySelectorAll("em")].some(node => node.textContent?.includes("omega"))).toBe(true);
  const result = runtime.search("alpha omega", 0);
  expect(result.matches).toHaveLength(1);
  expect(runtime.status.saveEligible).toBe(true);
  expect(runtime.navigateVisualSearch(raw, result, { kind: "index", matchIndex: 0 }).ok).toBe(true);
  expect(runtime.enterSourceMode()).toBe(true);
  expect(runtime.selectSourceRange(raw, { anchor: raw.length - 1, head: 0 }).ok).toBe(true);
  expect(runtime.cancelSourceDraft()).toBe(true);
  expect(runtime.replaceVisualSearch(raw, result, "replace-all", "beta"))
    .toEqual({ ok: true, value: { changed: true, replacedCount: 1 } });
  expect(runtime.getText()).toBe(expected);
  expect(runtime.enterSourceMode()).toBe(true);
  const caret = expected.indexOf("beta") + "beta".length;
  expect(runtime.getSourceSelection(expected)).toEqual({ ok: true, value: { anchor: caret, head: caret } });
  expect(runtime.cancelSourceDraft()).toBe(true);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.enterSourceMode()).toBe(true);
  expect(runtime.getSourceSelection(raw)).toEqual({
    ok: true,
    value: { anchor: raw.length - 1, head: 0 },
  });
  expect(runtime.cancelSourceDraft()).toBe(true);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});

it("keeps nested-mark bytes, savepoint and Redo branch on a no-op", () => {
  const raw = "**alpha *omega***\n";
  const { runtime } = boot(raw);
  expect(runtime.replaceVisualSearch(raw, runtime.search("alpha omega", 0), "replace-all", "beta").ok)
    .toBe(true);
  expect(runtime.undo()).toBe(true);
  const before = runtime.status;
  expect(runtime.replaceVisualSearch(raw, runtime.search("alpha omega", 0), "replace-all", "alpha omega"))
    .toEqual({ ok: true, value: { changed: false, replacedCount: 0 } });
  expect(runtime.getText()).toBe(raw);
  expect(runtime.status).toEqual(before);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe("**beta**\n");
});

it("root066: replacement punctuation is literal editable text", () => {
  const { runtime, parent } = boot("alpha\n");
  expect(runtime.replaceVisualSearch("alpha\n",runtime.search("alpha",0),"replace-all","**beta**").ok).toBe(true);
  expect(runtime.getText()).toBe("\\*\\*beta\\*\\*\n");
  expect(parent.querySelector(".ProseMirror p")?.textContent).toBe("**beta**");
  expect(parent.querySelector(".ProseMirror strong")).toBeNull();
});

it("root066: no-op preserves the existing Redo branch and savepoint", () => {
  const { runtime } = boot("alpha\n");
  expect(runtime.replaceVisualSearch("alpha\n",runtime.search("alpha",0),"replace-all","beta").ok).toBe(true);
  expect(runtime.undo()).toBe(true);
  const before = runtime.status;
  expect(runtime.replaceVisualSearch("alpha\n",runtime.search("alpha",0),"replace-all","alpha"))
    .toEqual({ok:true,value:{changed:false,replacedCount:0}});
  expect(runtime.status).toEqual(before);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe("beta\n");
});

it("root066: partial link ownership remains local during a cross-boundary match", () => {
  const raw = '[alpha](./x "keep") omega\n';
  const { runtime } = boot(raw);
  expect(runtime.replaceVisualSearch(raw,runtime.search("pha omega",0),"replace-all","beta").ok).toBe(true);
  expect(runtime.getText()).toBe('[albeta](./x "keep")\n');
});


it.each(["navigate", "replace"] as const)(
  "rejects a prior content version after edit/Undo returns the same raw: %s", action => {
    const raw = "alpha\n";
    const { runtime, parent } = boot(raw);
    const stale = runtime.search("alpha", 10);
    expect(runtime.enterSourceMode()).toBe(true);
    const area = parent.querySelector<HTMLTextAreaElement>("textarea")!;
    area.value = "beta\n";
    const ownerWindow = area.ownerDocument.defaultView!;
    area.dispatchEvent(new ownerWindow.Event("input", { bubbles: true }));
    expect(runtime.applySourceDraft()).toBe(true);
    expect(runtime.undo()).toBe(true);
    expect(runtime.cancelSourceDraft()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    const before = runtime.status;
    const outcome = action === "navigate"
      ? runtime.navigateVisualSearch(raw, stale, { kind: "index", matchIndex: 0 })
      : runtime.replaceVisualSearch(raw, stale, "replace-all", "wrong");
    expect(outcome).toEqual({ ok: false, message: "查找结果已过期" });
    expect(runtime.getText()).toBe(raw);
    expect(runtime.status).toEqual(before);
    const fresh = runtime.search("alpha", 12);
    expect(runtime.replaceVisualSearch(raw, JSON.parse(JSON.stringify(fresh)), "replace-all", "ok"))
      .toEqual({ ok: true, value: { changed: true, replacedCount: 1 } });
    expect(runtime.getText()).toBe("ok\n");
  },
);

it.each([
  "[**alpha *omega***](/url)\n",
  "***alpha***\n",
  "***alpha*** and **omega**\n",
  "Text **alpha** [*omega*](/url)\n",
  "[*alpha*](/url) **omega**\n",
  "**alpha [omega](/url)**\n",
])("keeps nested/adjacent emphasis and link ownership auditable in %j", raw => {
  const { runtime } = boot(raw);
  expect(runtime.status.saveEligible).toBe(true);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: raw });
});
