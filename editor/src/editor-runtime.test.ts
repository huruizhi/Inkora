import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import { inkoraSchema } from "./schema";
import { TextSelection } from "prosemirror-state";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorRuntime } from "./editor-runtime";
import type { EditorRuntime } from "./editor-runtime";
import type { InkoraEditorSession } from "./editor-session";
import type { EditorView } from "prosemirror-view";
import { analyzeDocument } from "./document-analysis";
import { planSourceReplaceAll, searchSource } from "./source-search";

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

function enterSource(runtime: EditorRuntime, parent: HTMLElement): HTMLTextAreaElement {
  expect(runtime.enterSourceMode()).toBe(true);
  const area = parent.querySelector<HTMLTextAreaElement>("textarea#editor");
  if (!area) throw new Error("Expected explicit source mode");
  return area;
}

describe("editor runtime", () => {
  it("mounts offline code highlighting and patches only the fence language token", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const raw = "\uFEFF正文\r\n\r\n```rust  title=x   \r\nconst x = 1;\r\n```\r\n\r\n结尾\r\n";
    const changes: string[] = [];
    const runtime = createEditorRuntime(parent, raw, (_status, kind) => changes.push(kind ?? "status"));
    const select = parent.querySelector<HTMLSelectElement>("select.inkora-code-language");
    expect(select).not.toBeNull();
    expect(select!.value).toBe("rust");
    expect(parent.querySelector("code .hljs-keyword")?.textContent).toBe("const");
    const internals = runtime as unknown as { view: EditorView };
    let codeFrom = -1;
    internals.view.state.doc.descendants((node, pos) => {
      if (node.type.name === "code_block") codeFrom = pos + 1;
    });
    internals.view.dispatch(internals.view.state.tr.setSelection(
      TextSelection.create(internals.view.state.doc, codeFrom + 6),
    ));
    const selection = internals.view.state.selection;

    select!.value = "javascript";
    select!.dispatchEvent(new dom.window.Event("change", { bubbles: true, cancelable: true }));
    const changed = raw.replace("```rust  title=x", "```javascript  title=x");
    expect(runtime.getText()).toBe(changed);
    expect(internals.view.state.selection.eq(selection)).toBe(true);
    expect(changes).toEqual(["document"]);
    expect(runtime.status.dirty).toBe(true);
    expect(runtime.snapshotText()).toEqual({ ok: true, value: changed });
    runtime.markSaved(changed);
    expect(runtime.status.dirty).toBe(false);

    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.status.dirty).toBe(true);
    expect(parent.querySelector<HTMLSelectElement>("select.inkora-code-language")?.value).toBe("rust");
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(changed);
    expect(runtime.status.dirty).toBe(false);
    expect(runtime.enterSourceMode()).toBe(true);
    expect(parent.querySelector("textarea")?.value).toBe(changed.replace(/\r\n/g, "\n"));
    expect(runtime.cancelSourceDraft()).toBe(true);
    expect(parent.querySelector<HTMLSelectElement>("select.inkora-code-language")?.value).toBe("javascript");
    runtime.destroy();

    const reopened = createEditorRuntime(parent, changed, () => {});
    expect(parent.querySelector<HTMLSelectElement>("select.inkora-code-language")?.value).toBe("javascript");
    expect(parent.querySelector("code .hljs-keyword")?.textContent).toBe("const");
    reopened.destroy();
  });

  it("updates real runtime decorations after code editing without changing code text", () => {
    const { parent } = stubBrowserEnvironment();
    const runtime = createEditorRuntime(parent, "```python\nx = 1\n```\n", () => {});
    const internals = runtime as unknown as { view: EditorView };
    let codeFrom = -1;
    internals.view.state.doc.descendants((node, pos) => {
      if (node.type.name === "code_block") codeFrom = pos + 1;
    });
    internals.view.dispatch(internals.view.state.tr.insertText("def f(): ", codeFrom));
    expect(runtime.getText()).toBe("```python\ndef f(): x = 1\n```\n");
    expect(parent.querySelector("code")?.textContent).toBe("def f(): x = 1");
    expect(parent.querySelector("code .hljs-keyword")?.textContent).toBe("def");
    runtime.destroy();
  });

  it("guards the real language selector during composition without dispatching", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const raw = "```python\nx = 1\n```\n";
    const changes: unknown[] = [];
    const runtime = createEditorRuntime(parent, raw, (status) => changes.push(status));
    const editor = parent.querySelector<HTMLElement>("#editor")!;
    const select = parent.querySelector<HTMLSelectElement>("select.inkora-code-language")!;
    runtime.focus();
    editor.dispatchEvent(new dom.window.Event("compositionstart", { bubbles: true }));
    const pointer = new dom.window.Event("pointerdown", { bubbles: true, cancelable: true });
    select.dispatchEvent(pointer);
    const click = new dom.window.Event("click", { bubbles: true, cancelable: true });
    select.dispatchEvent(click);
    select.value = "go";
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true, cancelable: true }));
    expect(pointer.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect(select.value).toBe("python");
    expect(runtime.getText()).toBe(raw);
    expect(changes).toEqual([]);
    expect(parent.querySelector(".inkora-code-message")?.textContent).toContain("请先完成中文输入");
    runtime.destroy();
  });

  it("captures replacement history selection by value independently of the caller plan", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const raw = "<x>a</x>\n";
    const runtime = createEditorRuntime(parent, raw, () => {});
    const area = enterSource(runtime, parent);
    area.setSelectionRange(3, 4, "backward");
    const planned = planSourceReplaceAll(searchSource({ raw, revision: 0 }, "a"),
      { raw, revision: 0 }, "B");
    if (!planned.ok) throw new Error(planned.failure.message);
    const expected = { ...planned.plan.selection };
    expect(runtime.applySourceReplacement(planned.plan).ok).toBe(true);
    const callerSelection = planned.plan.selection as { anchor: number; head: number };
    callerSelection.anchor = 0;
    callerSelection.head = 0;
    expect(runtime.undo()).toBe(true);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getSourceSelection(planned.plan.resultRaw)).toEqual({ ok: true, value: expected });
    runtime.destroy();
  });
  it("applies a source replacement atomically with one directed-selection undo/redo unit", () => {
    const { parent } = stubBrowserEnvironment();
    const raw = "<x>one one</x>\r\n";
    const states: unknown[] = [];
    const runtime = createEditorRuntime(parent, raw, (state) => states.push(state));
    const area = enterSource(runtime, parent);
    const notifications = states.length;
    area.setSelectionRange(7, 4, "backward");
    const beforeSelection = runtime.getSourceSelection(raw);
    expect(beforeSelection.ok).toBe(true);
    const planned = planSourceReplaceAll(searchSource({ raw, revision: 4 }, "one"), { raw, revision: 4 }, "$&-$1", beforeSelection.ok ? beforeSelection.value : undefined);
    if (!planned.ok) throw new Error(planned.failure.message);
    expect(runtime.sourceReplacement).toBe(true);
    expect(runtime.applySourceReplacement(planned.plan)).toEqual({ ok: true, value: { changed: true, replacedCount: 2 } });
    expect(runtime.getText()).toBe("<x>$&-$1 $&-$1</x>\r\n");
    expect(states).toHaveLength(notifications + 1);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.getSourceSelection(raw)).toEqual(beforeSelection);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe("<x>$&-$1 $&-$1</x>\r\n");
    runtime.destroy();
  });

  it("keeps committed selections across two replacements and later caret moves", () => {
    const { parent } = stubBrowserEnvironment();
    const raw = "<x>a a</x>\n";
    const runtime = createEditorRuntime(parent, raw, () => {});
    const area = enterSource(runtime, parent);
    area.setSelectionRange(3, 4, "backward");

    const first = planSourceReplaceAll(searchSource({ raw, revision: 0 }, "a"),
      { raw, revision: 0 }, "B", { anchor: 4, head: 3 });
    if (!first.ok) throw new Error(first.failure.message);
    expect(runtime.applySourceReplacement(first.plan).ok).toBe(true);
    const afterFirst = first.plan.resultRaw;

    const second = planSourceReplaceAll(searchSource({ raw: afterFirst, revision: 1 }, "B"),
      { raw: afterFirst, revision: 1 }, "CC", first.plan.selection);
    if (!second.ok) throw new Error(second.failure.message);
    expect(runtime.applySourceReplacement(second.plan).ok).toBe(true);
    const afterSecond = second.plan.resultRaw;
    area.setSelectionRange(0, 0);

    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(afterFirst);
    expect(runtime.getSourceSelection(afterFirst)).toEqual({ ok: true, value: first.plan.selection });
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(raw);
    expect(runtime.getSourceSelection(raw)).toEqual({ ok: true, value: { anchor: 4, head: 3 } });
    expect(runtime.redo()).toBe(true);
    expect(runtime.getSourceSelection(afterFirst)).toEqual({ ok: true, value: first.plan.selection });
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(afterSecond);
    expect(runtime.getSourceSelection(afterSecond)).toEqual({ ok: true, value: second.plan.selection });
    runtime.destroy();
  });

  it("does not expose replacement for structured or bare-CR runtimes", () => {
    const structured = createEditorRuntime(stubBrowserEnvironment().parent, "# Heading\n", () => {});
    expect(structured.sourceReplacement).toBe(false);
    structured.destroy();
    const readOnly = createEditorRuntime(stubBrowserEnvironment().parent, "a\rb", () => {});
    expect(readOnly.sourceNavigation).toBe(true);
    expect(readOnly.sourceReplacement).toBe(false);
    readOnly.destroy();
  });

  it("keeps selection, notifications and redo future unchanged for a no-op replacement", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const original = "<x>same</x>\n";
    const edited = "<x>same edited</x>\n";
    const states: unknown[] = [];
    const runtime = createEditorRuntime(parent, original, (state) => states.push(state));
    const area = enterSource(runtime, parent);
    area.value = edited;
    area.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.applySourceDraft()).toBe(true);
    expect(runtime.undo()).toBe(true);
    area.setSelectionRange(3, 7, "backward");
    const selection = runtime.getSourceSelection(original);
    const planned = planSourceReplaceAll(searchSource({ raw: original, revision: 2 }, "same"),
      { raw: original, revision: 2 }, "same", selection.ok ? selection.value : undefined);
    if (!planned.ok) throw new Error(planned.failure.message);
    const notifications = states.length;
    expect(runtime.applySourceReplacement(planned.plan)).toEqual({
      ok: true, value: { changed: false, replacedCount: 0 },
    });
    expect(runtime.getSourceSelection(original)).toEqual(selection);
    expect(states).toHaveLength(notifications);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(edited);
    runtime.destroy();
  });

  it("rejects composition and forged result plans atomically", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const raw = "<x>a a</x>\n";
    const states: unknown[] = [];
    const runtime = createEditorRuntime(parent, raw, (state) => states.push(state));
    const area = enterSource(runtime, parent);
    const notifications = states.length;
    area.setSelectionRange(3, 4);
    const planned = planSourceReplaceAll(searchSource({ raw, revision: 1 }, "a"),
      { raw, revision: 1 }, "b");
    if (!planned.ok) throw new Error(planned.failure.message);
    const before = { value: area.value, selection: [area.selectionStart, area.selectionEnd], status: runtime.status };
    area.dispatchEvent(new dom.window.Event("compositionstart"));
    expect(runtime.applySourceReplacement(planned.plan).ok).toBe(false);
    area.dispatchEvent(new dom.window.Event("compositionend"));
    expect(runtime.applySourceReplacement({ ...planned.plan, resultRaw: "forged" }).ok).toBe(false);
    expect({ value: area.value, selection: [area.selectionStart, area.selectionEnd], status: runtime.status }).toEqual(before);
    expect(states).toHaveLength(notifications);
    runtime.destroy();
  });
  it("explicitly exposes source navigation only for source and bare-CR runtimes", () => {
    const structured = createEditorRuntime(stubBrowserEnvironment().parent, "# Heading\n", () => {});
    expect(structured.sourceNavigation).toBe(false);
    expect(structured.getSourceSelection("# Heading\n").ok).toBe(false);
    structured.destroy();

    const source = createEditorRuntime(stubBrowserEnvironment().parent, "<x>same same</x>\r\n", () => {});
    expect(source.enterSourceMode()).toBe(true);
    expect(source.sourceNavigation).toBe(true);
    source.destroy();

    const readOnly = createEditorRuntime(stubBrowserEnvironment().parent, "same\rsame", () => {});
    expect(readOnly.sourceNavigation).toBe(true);
    readOnly.destroy();
  });

  it.each(["<x>same same</x>\r\n", "same\rsame"])(
    "reads and applies directed source selections without changing state: %j",
    (raw) => {
      const { parent } = stubBrowserEnvironment();
      const runtime = createEditorRuntime(parent, raw, () => {});
      const area = raw.includes("\r") && !raw.includes("\r\n")
        ? parent.querySelector<HTMLTextAreaElement>("textarea")!
        : enterSource(runtime, parent);
      const first = area.value.indexOf("same");
      area.setSelectionRange(first, first + 4, "backward");
      const before = { text: runtime.getText(), status: runtime.status };
      const selection = runtime.getSourceSelection(raw);
      expect(selection.ok && selection.value.anchor > selection.value.head).toBe(true);
      expect(runtime.selectSourceRange(raw, { anchor: raw.lastIndexOf("same") + 4, head: raw.lastIndexOf("same") }))
        .toEqual({ ok: true, value: undefined });
      expect(area.selectionDirection).toBe("backward");
      expect(runtime.getText()).toBe(before.text);
      expect(runtime.status).toEqual(before.status);
      runtime.destroy();
    },
  );

  it("navigates the second duplicate structured heading without changing document state", () => {
    const raw = "Setext *标题*\n====\n\n# **同名** &amp; 👩‍💻\n\n> ## 引用\n\n- ### 同名\n";
    const { runtime, session } = structuredRuntimeWithSession(raw);
    const headings = analyzeDocument({ raw, revision: 8 }).headings;
    const before = { text: runtime.getText(), status: runtime.status, revision: session.status.revision };
    const result = runtime.navigateToHeading(raw, { ...headings[3], index: 3 });
    expect(result).toEqual({ ok: true });
    expect(session.state.selection.from).toBeGreaterThan(1);
    expect(runtime.getText()).toBe(before.text);
    expect(runtime.status).toEqual(before.status);
    expect(session.status.revision).toBe(before.revision);
    expect(document.activeElement?.id).toBe("editor");
    runtime.destroy();
  });

  it("rejects a protected-document pseudo heading when PM sequence cannot prove correspondence", () => {
    const raw = "---\ntitle: value\n---\n\n# Real\n";
    const { runtime, session } = structuredRuntimeWithSession(raw);
    const headings = analyzeDocument({ raw, revision: 0 }).headings;
    const selection = session.state.selection;
    expect(headings.length).toBeGreaterThan(1);
    expect(runtime.navigateToHeading(raw, { ...headings[0], index: 0 })).toEqual({
      ok: false,
      message: "当前编辑视图与原文大纲不一致，无法安全定位",
    });
    expect(session.state.selection.eq(selection)).toBe(true);
    runtime.destroy();
  });

  it.each([
    "\uFEFF# First\r\n\n<x>source</x>\n\n## Second 👩‍💻\r\n",
    "# First\r# Second",
  ])("navigates source/read-only heading with explicit original offset mapping: %j", (raw) => {
    const { parent } = stubBrowserEnvironment();
    const runtime = createEditorRuntime(parent, raw, () => {});
    if (!raw.includes("\r#")) runtime.enterSourceMode();
    const area = parent.querySelector<HTMLTextAreaElement>("textarea")!;
    const headings = analyzeDocument({ raw, revision: 0 }).headings;
    const target = headings.at(-1)!;
    expect(runtime.navigateToHeading(raw, { ...target, index: headings.length - 1 })).toEqual({ ok: true });
    expect(area.selectionStart).toBe(raw.slice(0, target.start).replace(/\r\n?/g, "\n").length);
    expect(area.selectionEnd).toBe(area.selectionStart);
    runtime.destroy();
  });

  it("refuses navigation during composition without changing focus, selection, text or history", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const raw = "<x>source</x>\n\n# Heading\n";
    const runtime = createEditorRuntime(parent, raw, () => {});
    const area = enterSource(runtime, parent);
    area.focus();
    area.setSelectionRange(2, 4);
    area.dispatchEvent(new dom.window.Event("compositionstart"));
    const before = { value: area.value, start: area.selectionStart, end: area.selectionEnd, status: runtime.status };
    const heading = analyzeDocument({ raw, revision: 0 }).headings[0];
    expect(runtime.navigateToHeading(raw, { ...heading, index: 0 }).ok).toBe(false);
    expect(document.activeElement).toBe(area);
    expect({ value: area.value, start: area.selectionStart, end: area.selectionEnd, status: runtime.status }).toEqual(before);
    runtime.destroy();
  });
  it.each(["\n", "\r\n"])("renders protected extensions with %j and preserves body edits and history", (eol) => {
    const original = '---\ntitle: "原样"\n---\n\n# 标题\n\n正文\n\n| A  | B |\n| :--- | ---: |\n| x | y |\n\n- 参见 [[目标|别名]]。\n'.replace(/\n/g, eol);
    const { runtime, session } = structuredRuntimeWithSession(original);
    expect(document.querySelector("#editor table")).not.toBeNull();
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.querySelector("#editor")?.textContent).toContain("别名");
    const copy = document.createElement("div");
    copy.append(DOMSerializer.fromSchema(inkoraSchema).serializeFragment(session.state.doc.content));
    expect(DOMParser.fromSchema(inkoraSchema).parse(copy).toJSON()).toEqual(
      session.state.doc.toJSON(),
    );
    expect(runtime.getText()).toBe(original);
    let position = -1;
    session.state.doc.descendants((node, pos) => {
      if (node.isText && node.text?.startsWith("正文")) position = pos;
    });
    expect(position).toBeGreaterThan(0);
    const edit = session.state.tr.insertText("修改", position);
    expect(edit.steps[0]?.toJSON()).toMatchObject({ from: position, to: position });
    expect(session.dispatch(edit)).toBe(true);
    expect(runtime.getText()).toBe(original.replace("正文", "修改正文"));
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(original);
    expect(runtime.redo()).toBe(true);
    expect(runtime.getText()).toBe(original.replace("正文", "修改正文"));
    runtime.markSaved(runtime.getText());
    expect(runtime.status.dirty).toBe(false);
    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(original);
    expect(runtime.status.dirty).toBe(true);
    expect(runtime.redo()).toBe(true);
    expect(runtime.status.dirty).toBe(false);
    runtime.destroy();
  });

  it("keeps unsupported Markdown in source mode with undo and redo", () => {
    const { dom, parent } = stubBrowserEnvironment();
    const states: Array<{ dirty: boolean; canUndo: boolean; canRedo: boolean }> = [];
    const original = "<custom-element>keep exactly</custom-element>\r\n";
    const runtime = createEditorRuntime(parent, original, (status) => states.push(status));
    const textArea = enterSource(runtime, parent);

    textArea.value = "<custom-element>changed</custom-element>\n";
    textArea.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.applySourceDraft()).toBe(true);
    expect(runtime.status).toMatchObject({ dirty: true, canUndo: true, canRedo: false });

    expect(runtime.undo()).toBe(true);
    expect(runtime.getText()).toBe(original);
    expect(runtime.status).toMatchObject({ dirty: false, canUndo: false, canRedo: true });

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

  it.each(["bare-cr", "bare-cr-lf", "bare-cr-crlf"])("blocks edits in read-only golden %s", (name) => {
    const { dom, parent } = stubBrowserEnvironment();
    const original = readFileSync(new URL(`../../tests/fixtures/${name}.input.md`, import.meta.url), "utf8");
    const runtime = createEditorRuntime(parent, original, () => {});
    const textArea = parent.querySelector<HTMLTextAreaElement>("textarea");
    if (!textArea) throw new Error("Expected source mode for bare CR document");

    textArea.value = "first\nchanged\nsecond";
    textArea.dispatchEvent(new dom.window.Event("input"));
    expect(textArea.readOnly).toBe(true);
    expect(runtime.getText()).toBe(original);
    expect(runtime.status).toMatchObject({ dirty: false, canUndo: false, canRedo: false });
    expect(runtime.undo()).toBe(false);
    expect(runtime.redo()).toBe(false);
    runtime.destroy();
    const expected = readFileSync(new URL(`../../tests/fixtures/${name}.expected.md`, import.meta.url), "utf8");
    const converted = createEditorRuntime(parent, expected, () => {});
    const editable = enterSource(converted, parent);
    expect(editable.readOnly).toBe(false);
    expect(converted.getText()).toBe(expected);
    expect(converted.undo()).toBe(false);
    editable.value = expected + "编辑";
    editable.dispatchEvent(new dom.window.Event("input"));
    expect(converted.applySourceDraft()).toBe(true);
    expect(converted.status.dirty).toBe(true);
    expect(converted.undo()).toBe(true);
    expect(converted.getText()).toBe(expected);
    expect(converted.redo()).toBe(true);
    expect(converted.getText()).toBe(expected + "编辑");
    converted.destroy();
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

    "<div>\r\n原文\r\n</div>\r\n",
  ])("retains unsupported raw CRLF content in source edits: %j", (original) => {
    const { dom, parent } = stubBrowserEnvironment();
    const runtime = createEditorRuntime(parent, original, () => {});
    const editor = enterSource(runtime, parent);
    editor.value = original.replace(/\r\n/g, "\n").replace("原文", "改后原文");
    editor.dispatchEvent(new dom.window.Event("input"));
    expect(runtime.applySourceDraft()).toBe(true);
    expect(runtime.getText()).toBe(original.replace("原文", "改后原文"));
    runtime.destroy();
  });

  it("preserves a protected CRLF table beside edited body text", () => {
    const original = "正文\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 原文 | 数据 |\r\n";
    const { runtime, session } = structuredRuntimeWithSession(original);
    session.dispatch(session.state.tr.insertText("改后", 1));
    expect(runtime.getText()).toBe(original.replace("正文", "改后正文"));
    runtime.destroy();
  });

  it.each(["", "---\r\ntitle: 保留\r\n---\r\n\r\n"])("keeps CRLF normalization protection with prefix %j", (prefix) => {
    const { parent } = stubBrowserEnvironment();
    const original = prefix + "# Heading\r\n\r\n\r\nBody  \r\n";
    const runtime = createEditorRuntime(parent, original, () => {});
    expect(parent.querySelector(".ProseMirror")).not.toBeNull();
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
