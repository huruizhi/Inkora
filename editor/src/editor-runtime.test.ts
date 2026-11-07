import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime } from "./editor-runtime";

const originalDocument = globalThis.document;

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("editor runtime", () => {
  it("keeps unsupported Markdown in source mode with undo and redo", () => {
    const dom = new JSDOM("<!doctype html><main id='app'></main>");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
    const parent = dom.window.document.querySelector<HTMLElement>("#app");
    if (!parent) throw new Error("Missing test parent");
    const states: Array<{ dirty: boolean; canUndo: boolean; canRedo: boolean }> = [];
    const original = "<custom-element>keep exactly</custom-element>\r\n";
    const runtime = createEditorRuntime(parent, original, (status) => states.push(status));
    const textArea = parent.querySelector<HTMLTextAreaElement>("textarea");
    if (!textArea) throw new Error("Expected source mode");

    textArea.value = "<custom-element>changed</custom-element>\n";
    textArea.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.status).toEqual({ dirty: true, canUndo: true, canRedo: false });

    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(original);
    expect(runtime.status).toEqual({ dirty: false, canUndo: false, canRedo: true });

    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("<custom-element>changed</custom-element>\r\n");
    expect(states).toHaveLength(3);
    runtime.destroy();
  });
});
