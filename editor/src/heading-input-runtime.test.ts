import { JSDOM } from "jsdom";
import { blockKeyBindings } from "./block-editing";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { afterEach, expect, it } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";

const previous = { document: globalThis.document, window: globalThis.window };
const live: EditorRuntime[] = [];
afterEach(() => {
  live.splice(0).forEach(runtime => runtime.destroy());
  Object.defineProperty(globalThis, "document", { configurable: true, value: previous.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: previous.window });
});

for (const path of ["native", "keymap"] as const) it.each([
  ["# 标", "# 标\n\n正文"],
  ["# 标 ##\n", "# 标 ##\n\n正文\n"],
  ["标题\n===\n", "标题\n===\n\n正文\n"],
  ["\uFEFF## 标\r\n", "\uFEFF## 标\r\n\r\n正文\r\n"],
])(`accepts the end-heading paragraph insertion via ${path} for %j`, (raw, expected) => {
  const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom.window.document });
  Object.defineProperty(globalThis, "window", { configurable: true, value: dom.window });
  const runtime = createEditorRuntime(dom.window.document.querySelector("main")!, raw, () => {});
  live.push(runtime);
  const view = (runtime as unknown as { view: EditorView }).view;
  const heading = view.state.doc.firstChild!;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, heading.nodeSize - 1)));
  if (path === "native") {
    const tr = view.state.tr.insert(heading.nodeSize, view.state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, heading.nodeSize + 1));
    view.dispatch(tr);
  } else {
    expect(blockKeyBindings.Enter(view.state, view.dispatch, view)).toBe(true);
  }
  expect(runtime.status.unresolved).toBe(false);
  expect(runtime.snapshotText().ok).toBe(true);
  expect(view.state.doc.childCount).toBe(2);
  view.dispatch(view.state.tr.insertText("正文"));
  expect(runtime.getText()).toBe(expected);
  expect(runtime.snapshotText()).toEqual({ ok: true, value: expected });
  expect(runtime.undo()).toBe(true);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(raw);
  expect(runtime.redo()).toBe(true);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(expected);
});
it.each(['# 水电费','## 水电费\r\n\r\n- 第三方\r\n- ','\uFEFF# 水电费\r\n'])('Enter at the heading start moves it down without changing its text: %j',raw=>{
  const dom=new JSDOM('<main></main>',{pretendToBeVisual:true});
  Object.defineProperty(globalThis,'document',{configurable:true,value:dom.window.document});
  Object.defineProperty(globalThis,'window',{configurable:true,value:dom.window});
  const runtime=createEditorRuntime(dom.window.document.querySelector('main')!,raw,()=>{});live.push(runtime);
  const view=(runtime as unknown as {view:EditorView}).view;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,1)));
  view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  expect(runtime.status.unresolved).toBe(false);
  const at=raw.startsWith('\uFEFF')?1:0,eol=raw.includes('\r\n')?'\r\n':'\n';
  expect(runtime.snapshotText()).toEqual({ok:true,value:raw.slice(0,at)+eol+eol+raw.slice(at)});
  expect(view.state.doc.child(0).type.name).toBe('paragraph');
  expect(view.state.doc.child(1).textContent).toBe('水电费');
  expect(view.state.selection.head).toBe(3);
  expect(runtime.undo()).toBe(true);expect(runtime.getText()).toBe(raw);
});
