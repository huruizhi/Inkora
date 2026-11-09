import { JSDOM } from "jsdom";
import { afterEach, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createEditorRuntime } from "./editor-runtime";

const priorDocument = globalThis.document;
const priorWindow = globalThis.window;
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn());
  Object.defineProperty(globalThis, "document", { configurable: true, value: priorDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: priorWindow });
});

function boot(raw: string) {
  const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const changes: string[] = [];
  const runtime = createEditorRuntime(document.querySelector("main")!, raw, (_status, kind) => {
    if (kind === "document") changes.push(runtime.getText());
  });
  const view = (runtime as unknown as { view: EditorView }).view;
  cleanup.push(() => { runtime.destroy(); dom.window.close(); });
  expect(runtime.mode).toBe("visual");
  return { runtime, view, dom, changes };
}


it("publishes the final composition value after the public stable boundary", async () => {
  const { runtime, view, dom, changes } = boot("a\n");
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
  view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
  view.dispatch(view.state.tr.insertText("zh").setMeta("composition", 171));
  view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
  expect(changes).toEqual([]);
  expect(runtime.snapshotText().ok).toBe(false);
  view.dispatch(view.state.tr.insertText("中文", 2, 4).setMeta("composition", 171));
  expect(await runtime.whenCompositionStable()).toBe(true);
  expect(changes).toEqual(["a中文\n"]);
  expect(runtime.snapshotText()).toEqual({ok:true, value:"a中文\n"});
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe("a\n");
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe("a中文\n");
});

it.each([2,4])("does not seal a settling composition for a selection-only transaction at %i", async position => {
  const { runtime, view, dom, changes } = boot("a\n");
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
  view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
  view.dispatch(view.state.tr.insertText("zh").setMeta("composition", 172));
  view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, position)));
  expect(changes, "selection cannot publish intermediate拼音").toEqual([]);
  expect(runtime.snapshotText().ok).toBe(false);
  view.dispatch(view.state.tr.insertText("中文", 2, 4).setMeta("composition", 172));
  expect(await runtime.whenCompositionStable()).toBe(true);
  expect(changes).toEqual(["a中文\n"]);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe("a\n");
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe("a中文\n");
});

it("keeps a backward selection-only update in the same active composition history", async () => {
  const { runtime, view, dom, changes } = boot("a\n");
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
  view.dom.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
  view.dispatch(view.state.tr.insertText("zh").setMeta("composition", 173));
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4, 2)).setMeta("composition", 174));
  view.dispatch(view.state.tr.insertText("中文", 2, 4).setMeta("composition", 173));
  view.dom.dispatchEvent(new dom.window.Event("compositionend", { bubbles: true }));
  expect(await runtime.whenCompositionStable()).toBe(true);
  expect(changes).toEqual(["a中文\n"]);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe("a\n");
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe("a中文\n");
});
