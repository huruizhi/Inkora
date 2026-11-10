import { JSDOM } from "jsdom";
import { afterEach, expect, it } from "vitest";
import type { EditorView } from "prosemirror-view";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
let runtime: EditorRuntime;
let dom: JSDOM;
afterEach(() => {
  runtime?.destroy();
  dom?.window.close();
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

it("guards image cancel, apply and Escape through the session settling window", async () => {
  dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const parent = document.querySelector("main")!;
  const raw = '\uFEFF前 ![旧](./a.png "题") 后\r\n';
  const changes: string[] = [];
  runtime = createEditorRuntime(parent, raw, (_status, kind) => changes.push(kind ?? "document"));
  // Existing runtime test adapter reads only the public PM composing getter.
  const view = (runtime as unknown as { view: EditorView }).view;
  const open = () => {
    parent.querySelector<HTMLButtonElement>(".image-edit-button")!.click();
    return parent.querySelector<HTMLInputElement>("[name=alt]")!;
  };
  const beginSettling = (alt: HTMLInputElement) => {
    alt.dispatchEvent(new dom.window.CompositionEvent("compositionstart", { bubbles: true }));
    alt.value = "新描述";
    alt.dispatchEvent(new dom.window.CompositionEvent("compositionend", { bubbles: true }));
    // The form's own end handler ran; PM never owns this form composition.
    expect(view.composing).toBe(false);
    expect(runtime.composing).toBe(true);
  };
  const alt = open();
  beginSettling(alt);
  const before = { text: runtime.getText(), status: runtime.status, selection: runtime.directedSelection };
  const form = alt.form!;
  const untouched = () => {
    expect(alt.isConnected).toBe(true);
    expect(alt.form).toBe(form);
    expect(alt.value).toBe("新描述");
    expect({ text: runtime.getText(), status: runtime.status, selection: runtime.directedSelection }).toEqual(before);
    expect(changes).toEqual([]);
  };
  parent.querySelector<HTMLButtonElement>(".image-attributes-cancel")!.click();
  untouched();
  form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  untouched();
  const escape = new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  alt.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(false);
  untouched();
  expect(await runtime.whenCompositionStable()).toBe(true);
  parent.querySelector<HTMLButtonElement>(".image-attributes-cancel")!.click();
  expect(alt.isConnected).toBe(false);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.directedSelection).toEqual(before.selection);
  const next = open();
  beginSettling(next);
  expect(await runtime.whenCompositionStable()).toBe(true);
  next.form!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  expect(runtime.getText()).toBe(raw.replace("![旧]", "![新描述]"));
  expect(runtime.status.canUndo).toBe(true);
});
