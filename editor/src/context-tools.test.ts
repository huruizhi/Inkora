import { JSDOM } from "jsdom";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime } from "./editor-runtime";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

describe("production context tools", () => {
  it("follows table/code caret selection without changing raw, history or save eligibility", () => {
    const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
    Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
    const parent = document.querySelector("main")!;
    const raw = "\uFEFFIntro\r\n\r\n| A |\r\n| --- |\r\n| B |\r\n\r\n```ts\r\nconst n = 1;\r\n```\r\n";
    let publications = 0;
    const runtime = createEditorRuntime(parent, raw, () => { publications++; });
    const view = (runtime as unknown as { view: EditorView }).view;
    const before = runtime.status;
    const positions: Record<string, number> = {};
    view.state.doc.descendants((node, pos) => {
      if (!(node.type.name in positions)) positions[node.type.name] = pos;
    });
    expect(parent.querySelectorAll(".inkora-context-active")).toHaveLength(0);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, positions.table_header + 1)));
    expect(parent.querySelector(".inkora-table-shell")?.classList.contains("inkora-context-active")).toBe(true);
    expect(parent.querySelector(".inkora-code-block")?.classList.contains("inkora-context-active")).toBe(false);
    view.focus();
    const composingShortcut = new dom.window.KeyboardEvent("keydown", {
      key: "F10", altKey: true, isComposing: true, bubbles: true, cancelable: true,
    });
    view.dom.dispatchEvent(composingShortcut);
    expect(composingShortcut.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(view.dom);
    const shortcut = new dom.window.KeyboardEvent("keydown", {
      key: "F10", altKey: true, bubbles: true, cancelable: true,
    });
    view.dom.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(parent.querySelector("[data-table-command='add_row_before']"));
    document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true,
    }));
    expect(document.activeElement).toBe(view.dom);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, positions.code_block + 1)));
    expect(parent.querySelector(".inkora-table-shell")?.classList.contains("inkora-context-active")).toBe(false);
    expect(parent.querySelector(".inkora-code-block")?.classList.contains("inkora-context-active")).toBe(true);

    view.dispatch(view.state.tr.setSelection(TextSelection.create(
      view.state.doc, positions.table_header + 1, positions.code_block + 2,
    )));
    expect(parent.querySelector(".inkora-table-shell")?.classList.contains("inkora-context-active")).toBe(true);
    expect(parent.querySelector(".inkora-code-block")?.classList.contains("inkora-context-active")).toBe(true);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(parent.querySelectorAll(".inkora-context-active")).toHaveLength(0);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: raw });
    expect(runtime.status).toEqual(before);
    expect(publications).toBe(0);
    runtime.destroy();
    dom.window.close();
  });
});
