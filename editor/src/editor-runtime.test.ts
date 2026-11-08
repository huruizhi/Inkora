import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { TextSelection } from "prosemirror-state";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime } from "./editor-runtime";
import type { EditorRuntime } from "./editor-runtime";
import type { InkoraEditorSession } from "./editor-session";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

function stubBrowserEnvironment(html = "<!doctype html><main id='app'></main>"): {
  dom: JSDOM;
  parent: HTMLElement;
} {
  const dom = new JSDOM(html);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  const parent = dom.window.document.querySelector<HTMLElement>("#app");
  if (!parent) throw new Error("Missing test parent");
  return { dom, parent };
}

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

  it("preserves source composition and selection when native history is requested", () => {
    const dom = new JSDOM("<!doctype html><main id='app'></main>");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
    const parent = dom.window.document.querySelector<HTMLElement>("#app")!;
    const states: unknown[] = [];
    const runtime = createEditorRuntime(parent, "<x>original</x>", (state) => states.push(state));
    const editor = parent.querySelector("textarea")!;
    editor.value = "<x>changed</x>";
    editor.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.undo()).toBe(true);
    editor.dispatchEvent(new dom.window.Event("compositionstart"));
    editor.value = "<x>中文</x>";
    editor.setSelectionRange(4, 5);
    const notifications = states.length;
    expect(runtime.undo()).toBe(false);
    expect(runtime.redo()).toBe(false);
    expect(editor.value).toBe("<x>中文</x>");
    expect([editor.selectionStart, editor.selectionEnd]).toEqual([4, 5]);
    expect(states).toHaveLength(notifications);
    editor.dispatchEvent(new dom.window.Event("compositionend"));
    expect(runtime.undo()).toBe(true);
    expect(editor.value).toBe("<x>original</x>");
    expect(runtime.redo()).toBe(true);
    expect(editor.value).toBe("<x>中文</x>");
    runtime.destroy();
  });

  it("keeps edits after a persisted source snapshot dirty", () => {
    const dom = new JSDOM("<!doctype html><main id='app'></main>");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
    const parent = dom.window.document.querySelector<HTMLElement>("#app");
    if (!parent) throw new Error("Missing test parent");
    const runtime = createEditorRuntime(parent, "<x>one</x>\n", () => {});
    const textArea = parent.querySelector<HTMLTextAreaElement>("textarea");
    if (!textArea) throw new Error("Expected source mode");

    textArea.value = "<x>two</x>\n";
    textArea.dispatchEvent(new dom.window.Event("input"));
    const persisted = runtime.getText();
    textArea.value = "<x>three</x>\n";
    textArea.dispatchEvent(new dom.window.Event("input"));

    runtime.markSaved(persisted);

    expect(runtime.getText()).toBe("<x>three</x>\n");
    expect(runtime.status.dirty).toBe(true);
    runtime.destroy();
  });

  it.each(["# Safe heading\r\n\nBody 👩‍💻\r\n", "# Heading\rBody"])("routes mixed or bare CR to source mode: %j", (original) => {
    const dom = new JSDOM("<!doctype html><main id='app'></main>");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: dom.window.document,
    });
    const parent = dom.window.document.querySelector<HTMLElement>("#app");
    if (!parent) throw new Error("Missing test parent");

    const runtime = createEditorRuntime(parent, original, () => {});
    const textArea = parent.querySelector<HTMLTextAreaElement>("textarea");
    if (!textArea) throw new Error("Expected source mode for CR document");
    expect(parent.querySelector(".ProseMirror")).toBeNull();
    expect(runtime.getText()).toBe(original);

    runtime.destroy();
  });

  it("keeps a bare-CR document byte-identical through an edit in source mode", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const original = "first\rsecond";
    const runtime = createEditorRuntime(parent, original, () => {});
    const textArea = parent.querySelector<HTMLTextAreaElement>("textarea");
    if (!textArea) throw new Error("Expected source mode for bare CR document");

    textArea.value = "first\nchanged\nsecond";
    textArea.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.getText()).toBe("first\rchanged\rsecond");
    runtime.destroy();
  });

  function structuredRuntimeWithSession(original: string): {
    dom: JSDOM;
    runtime: EditorRuntime;
    session: InkoraEditorSession;
  } {
    const { dom, parent } = stubBrowserEnvironment();
    const runtime = createEditorRuntime(parent, original, () => {});
    const editor = parent.querySelector<HTMLElement>("#editor");
    if (!editor || editor instanceof dom.window.HTMLTextAreaElement) {
      throw new Error("Expected structured mode");
    }
    // The runtime keeps its ProseMirror session private; tests dispatch through
    // it to exercise the same dispatchTransaction path the editor view uses.
    const runtimeWithSession = runtime as unknown as { session: InkoraEditorSession };
    return { dom, runtime, session: runtimeWithSession.session };
  }

  it.each(["crlf-structured", "crlf-structured-final"])(
    "edits CRLF golden %s with exact snapshots and saved history",
    (name) => {
      const fixture = (suffix: string) => readFileSync(
        new URL(`../../tests/fixtures/${name}.${suffix}.md`, import.meta.url), "utf8",
      );
      const original = fixture("input");
      const expected = fixture("expected");
      const { runtime, session } = structuredRuntimeWithSession(original);
      expect(runtime.getText()).toBe(original);
      let position = -1;
      session.state.doc.descendants((node, pos) => {
        if (node.isText && node.text?.startsWith("正文")) position = pos;
      });
      expect(position).toBeGreaterThan(0);
      session.dispatch(session.state.tr.insertText("改后", position));
      expect(runtime.getText()).toBe(expected);
      expect(runtime.status.dirty).toBe(true);
      runtime.markSaved(expected);
      expect(runtime.status.dirty).toBe(false);
      expect(runtime.undo()).toBe(true);
      expect(runtime.getText()).toBe(original);
      expect(runtime.status.dirty).toBe(true);
      expect(runtime.redo()).toBe(true);
      expect(runtime.getText()).toBe(expected);
      expect(runtime.status.dirty).toBe(false);
      // An older save acknowledgement must not clear a newer edit.
      session.dispatch(session.state.tr.insertText("新", position));
      runtime.markSaved(expected);
      expect(runtime.status.dirty).toBe(true);
      expect(runtime.getText()).toBe(expected.replace("改后正文", "新改后正文"));
      runtime.destroy();
    },
  );

  it("remembers CRLF after saving an edit that temporarily removes all boundaries", () => {
    const { runtime, session } = structuredRuntimeWithSession("first\r\nsecond");
    session.dispatch(session.state.tr.delete(6, 7));
    expect(runtime.getText()).toBe("firstsecond");
    runtime.markSaved(runtime.getText());
    session.dispatch(session.state.tr.insertText("\n", 6));
    expect(runtime.getText()).toBe("first\r\nsecond");
    runtime.destroy();
  });

  it("restores newly inserted boundaries to CRLF, including inside code", () => {
    const { runtime, session } = structuredRuntimeWithSession("```text\r\n代码\r\n```\r\n");
    session.dispatch(session.state.tr.insertText("新行\n", 1));
    expect(runtime.getText()).toBe("```text\r\n新行\r\n代码\r\n```\r\n");
    runtime.destroy();
  });

  it.each([
    "| A | B |\r\n| --- | --- |\r\n| 原文 | 数据 |\r\n",
    "<div>\r\n原文\r\n</div>\r\n",
  ])("retains unsupported raw CRLF content in source edits: %j", (original) => {
    const { dom, parent } = stubBrowserEnvironment();
    const runtime = createEditorRuntime(parent, original, () => {});
    const editor = parent.querySelector("textarea");
    if (!editor) throw new Error("Expected source mode");
    editor.value = original.replace(/\r\n/g, "\n").replace("原文", "改后原文");
    editor.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.getText()).toBe(original.replace("原文", "改后原文"));
    runtime.destroy();
  });

  it("keeps CRLF documents requiring unrelated normalization in source mode", () => {
    const { parent } = stubBrowserEnvironment();
    const original = "# Heading\r\n\r\n\r\nBody  \r\n";
    const runtime = createEditorRuntime(parent, original, () => {});
    expect(parent.querySelector("textarea")).not.toBeNull();
    expect(runtime.getText()).toBe(original);
    runtime.destroy();
  });

  it("aggregates CRLF composition without changing selection or saved baseline", () => {
    const { runtime, session } = structuredRuntimeWithSession("正文\r\n");
    session.beginComposition();
    session.dispatch(session.state.tr.insertText("中文", 1));
    const selection = session.state.selection;
    runtime.markSaved("正文\r\n");
    expect(runtime.composing).toBe(true);
    expect(runtime.undo()).toBe(false);
    expect(runtime.redo()).toBe(false);
    expect(session.state.selection.eq(selection)).toBe(true);
    expect(session.status.revision).toBe(0);
    session.endComposition();
    expect(session.status.revision).toBe(1);
    expect(runtime.getText()).toBe("中文正文\r\n");
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe("正文\r\n");
    expect(runtime.status.dirty).toBe(false);
    runtime.destroy();
  });

  it("preserves the trailing newline of a structured document after edits", () => {
    const { runtime, session } = structuredRuntimeWithSession(
      "# Heading\n\nParagraph 中文 👩‍💻.\n",
    );
    const end = session.state.doc.content.size - 1;
    session.dispatch(
      session.state.tr.setSelection(TextSelection.create(session.state.doc, end))
        .insertText(" 追加"),
    );

    expect(runtime.status.dirty).toBe(true);
    expect(runtime.getText()).toBe("# Heading\n\nParagraph 中文 👩‍💻. 追加\n");
    runtime.destroy();
  });

  it("does not add a trailing newline to a structured document without one", () => {
    const { runtime, session } = structuredRuntimeWithSession(
      "# Heading\n\nParagraph",
    );
    const end = session.state.doc.content.size - 1;
    session.dispatch(
      session.state.tr.setSelection(TextSelection.create(session.state.doc, end))
        .insertText(" 追加"),
    );

    expect(runtime.getText()).toBe("# Heading\n\nParagraph 追加");
    runtime.destroy();
  });
});
