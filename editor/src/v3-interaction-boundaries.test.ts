import { JSDOM } from "jsdom";
import { afterEach, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createEditorRuntime } from "./editor-runtime";

const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
const cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn());
  Object.defineProperty(globalThis, "document", {configurable:true, value:previousDocument});
  Object.defineProperty(globalThis, "window", {configurable:true, value:previousWindow});
});
function boot(raw: string) {
  const dom = new JSDOM("<main></main>", {pretendToBeVisual:true});
  Object.defineProperty(globalThis, "document", {configurable:true, value:dom.window.document});
  Object.defineProperty(globalThis, "window", {configurable:true, value:dom.window});
  const parent = dom.window.document.querySelector("main")!;
  const runtime = createEditorRuntime(parent, raw, () => {});
  const view = (runtime as unknown as {view: EditorView}).view;
  cleanup.push(() => {runtime.destroy();dom.window.close();});
  return {dom, parent, runtime, view};
}
it("keeps checkbox native click state equal to accepted Markdown", () => {
  const {parent,runtime} = boot("- [ ] item\n");
  const checkbox = parent.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  checkbox.click();
  expect(runtime.getText()).toBe("- [x] item\n");
  expect(parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(true);
  parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  expect(runtime.getText()).toBe("- [ ] item\n");
  expect(parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false);
  expect(runtime.status.saveEligible).toBe(true);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe("- [x] item\n");
  expect(parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(true);
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe("- [ ] item\n");
  expect(parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false);
});
it.each([
  "\uFEFF3. [X] **中文**\r\n",
  "> - [X] [label](target)\n",
  "- parent\r\n  - [X] nested",
])("keeps repeated checkbox toggles local in %j", (raw) => {
  const {parent,runtime,view} = boot(raw);
  const selection = view.state.selection.toJSON();
  parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  expect(runtime.getText()).toBe(raw.replace("[X]", "[ ]"));
  expect(view.state.selection.toJSON()).toEqual(selection);
  parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  expect(runtime.getText()).toBe(raw.replace("[X]", "[x]"));
  expect(view.state.selection.toJSON()).toEqual(selection);
  expect(runtime.snapshotText()).toEqual({ok:true,value:runtime.getText()});
});
it("does not bind a checkbox syntax patch to a different paragraph caret", () => {
  const {parent,runtime,view}=boot("- [ ] item\n\nbody\n");
  let caret = -1;
  view.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==="body")caret=pos+4;});
  expect(caret).toBeGreaterThan(0);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,caret)));
  parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  expect(view.state.selection.head).toBe(caret);
  view.dispatch(view.state.tr.insertText("中文"));
  expect(runtime.getText()).toBe("- [x] item\n\nbody中文\n");
  expect(runtime.snapshotText().ok).toBe(true);
});
it("keeps native checked state unchanged when an active composition refuses a click", () => {
  const {dom,parent,runtime,view} = boot("- [ ] item\n");
  view.dom.dispatchEvent(new dom.window.Event("compositionstart",{bubbles:true}));
  const before=runtime.status;
  parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  expect(parent.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked).toBe(false);
  expect(runtime.getText()).toBe("- [ ] item\n");
  expect(runtime.status).toEqual(before);
});
it("does not consume a flag-only composing Space on a task checkbox", () => {
  const {dom,parent,runtime} = boot("- [ ] item\n");
  const checkbox=parent.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  const before=runtime.status;
  const event=new dom.window.KeyboardEvent("keydown",{key:" ",isComposing:true,bubbles:true,cancelable:true});
  checkbox.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(runtime.getText()).toBe("- [ ] item\n");
  expect(runtime.status).toEqual(before);
});
it("does not consume a flag-only composing Tab or move the selected table cell", () => {
  const {dom,runtime,view}=boot("| H | J |\n| --- | --- |\n| one | two |\n");
  let caret=-1;
  view.state.doc.descendants((node,pos)=>{if(node.type.name==="table_cell"&&node.textContent==="one")caret=pos+1;});
  expect(caret).toBeGreaterThan(0);
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,caret)));
  const selection=view.state.selection;
  const raw=runtime.getText();
  const event=new dom.window.KeyboardEvent("keydown",{key:"Tab",isComposing:true,bubbles:true,cancelable:true});
  view.dom.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(view.state.selection.eq(selection)).toBe(true);
  expect(runtime.getText()).toBe(raw);
});
