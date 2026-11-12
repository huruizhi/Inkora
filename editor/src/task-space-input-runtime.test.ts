import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';
let runtime: EditorRuntime;
let dom: JSDOM;
const previous = {window: globalThis.window, document: globalThis.document};
afterEach(() => { runtime?.destroy();dom?.window.close();Object.assign(globalThis,previous); });
function boot(raw: string) {
  dom=new JSDOM('<main></main>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document});
  // jsdom supplies no geometry; only PM's selection scrolling uses these shims.
  dom.window.Range.prototype.getClientRects=()=>[new dom.window.DOMRect()] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect();
  runtime=createEditorRuntime(dom.window.document.querySelector('main')!,raw,()=>{});
}
function view(): EditorView {return (runtime as unknown as {view:EditorView}).view;}
function type(text:string) {
  for(const char of text) {
    const v=view(),{from,to}=v.state.selection;
    const tr=v.state.tr.insertText(char,from,to);
    if(!v.someProp('handleTextInput',fn=>fn(v,from,to,char,()=>tr)))v.dispatch(tr);
  }
}
it.each([
  {raw:'-[]',at:1,expected:'- []',checkbox:false},
  {raw:'- []',at:3,expected:'- [ ]',checkbox:true},
  {raw:'[]',at:1,expected:'[ ]',checkbox:false},
  {raw:'- []\r\n',at:3,expected:'- [ ]\r\n',checkbox:true},
])('inserts a space at raw offset $at of $raw',row=>{
  boot(row.raw);
  expect(runtime.navigateRawRange(row.raw,{anchor:row.at,head:row.at}).ok).toBe(true);
  type(' ');
  expect(runtime.getText()).toBe(row.expected);
  expect(runtime.status.unresolved).toBe(false);
  expect(!!view().dom.querySelector('input[type=checkbox]')).toBe(row.checkbox);
});
it('types the complete task marker continuously from blank',()=>{
  boot('');type('- [ ]');
  expect(runtime.getText()).toBe('- [ ]');
  expect(view().dom.querySelector('input[type=checkbox]')).not.toBeNull();
});
it('repairs both missing spaces in -[] in two explicit steps',()=>{
  boot('-[]');
  expect(runtime.navigateRawRange('-[]',{anchor:1,head:1}).ok).toBe(true);type(' ');
  expect(runtime.getText()).toBe('- []');
  expect(runtime.navigateRawRange('- []',{anchor:3,head:3}).ok).toBe(true);type(' ');
  expect(runtime.getText()).toBe('- [ ]');
  expect(view().dom.querySelector('input[type=checkbox]')).not.toBeNull();
});

it('keeps a completed empty task while the first label text is typed',()=>{
  boot('- [ ]');
  expect(runtime.navigateRawRange('- [ ]',{anchor:5,head:5}).ok).toBe(true);
  type('任务');
  expect(runtime.getText()).toBe('- [ ] 任务');
  expect(view().dom.querySelector('input[type=checkbox]')).not.toBeNull();
});

it.each([
  {raw:'\uFEFF-[]\r\n',at:2,expected:'\uFEFF- []\r\n',task:false},
  {raw:'> -[]',at:3,expected:'> - []',task:false},
  {raw:'1. []',at:4,expected:'1. [ ]',task:true},
  {raw:'- [] label',at:3,expected:'- [ ] label',task:true},
  {raw:'- [] **label**',at:3,expected:'- [ ] **label**',task:true},
  {raw:'- [] ',at:3,expected:'- [ ] ',task:true},
  {raw:'- []\n- []',at:8,expected:'- []\n- [ ]',task:true},
])('preserves container/source bytes while repairing $raw',row=>{
  boot(row.raw);
  expect(runtime.navigateRawRange(row.raw,{anchor:row.at,head:row.at}).ok).toBe(true);
  type(' ');
  expect(runtime.getText()).toBe(row.expected);
  expect(runtime.status).toMatchObject({unresolved:false,saveEligible:true});
  expect(!!view().dom.querySelector('input[type=checkbox]')).toBe(row.task);
  expect(runtime.undo()).toBe(true);
  expect(runtime.getText()).toBe(row.raw);
  expect(runtime.directedSelection).toEqual({selectionAnchor:row.at,selectionHead:row.at});
  expect(runtime.redo()).toBe(true);
  expect(runtime.getText()).toBe(row.expected);
});
it('does not accept unrelated edits appended to a genuine wrapping input rule',()=>{
  boot('-[]\n\n后');
  expect(runtime.navigateRawRange(runtime.getText(),{anchor:1,head:1}).ok).toBe(true);
  const v=view(),dispatch=v.dispatch;
  let captured: Parameters<EditorView['dispatch']>[0] | undefined;
  v.dispatch=tr=>{captured=tr;};
  type(' ');v.dispatch=dispatch;
  expect(captured).toBeDefined();
  v.dispatch(captured!.insertText('X',captured!.doc.content.size-1));
  expect(runtime.getText()).toBe('-[]\n\n后');
  expect(runtime.status).toMatchObject({unresolved:true,canUndo:false});
});
it('completes a marker after an already accepted visible trailing space',()=>{
  boot('- []');
  expect(runtime.navigateRawRange('- []',{anchor:4,head:4}).ok).toBe(true);type(' ');
  expect(runtime.getText()).toBe('- [] ');
  expect(view().state.doc.resolve(4).parent.textContent).toBe('[] ');
  view().dispatch(view().state.tr.setSelection(TextSelection.create(view().state.doc,4)));
  type(' ');
  expect(runtime.getText()).toBe('- [ ] ');
  expect(view().dom.querySelector('input[type=checkbox]')).not.toBeNull();
});
