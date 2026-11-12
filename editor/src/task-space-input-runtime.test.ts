import { JSDOM } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { createEditorRuntime, type EditorRuntime } from './editor-runtime';
let runtime: EditorRuntime;
let dom: JSDOM;
const previous = {window: globalThis.window, document: globalThis.document};
afterEach(() => { runtime?.destroy();dom?.window.close();Object.assign(globalThis,previous); });
function boot(raw: string) {
  dom=new JSDOM('<main></main>',{pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document});
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
  console.log(JSON.stringify({input:row,raw:runtime.getText(),html:view().dom.innerHTML,selection:runtime.directedSelection,status:runtime.status,diagnostic:(runtime as unknown as {session:{diagnostic:string}}).session.diagnostic}));
  expect(runtime.getText()).toBe(row.expected);
  expect(runtime.status.unresolved).toBe(false);
  expect(!!view().dom.querySelector('input[type=checkbox]')).toBe(row.checkbox);
});
it('types the complete task marker continuously from blank',()=>{
  boot('');type('- [ ]');
  console.log(JSON.stringify({raw:runtime.getText(),html:view().dom.innerHTML,status:runtime.status,diagnostic:(runtime as unknown as {session:{diagnostic:string}}).session.diagnostic}));
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
