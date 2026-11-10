import { createImageNodeViews, ImageResourceRegistry } from "./image-view";
import { inkoraSchema } from "./schema";
import type { EditorView } from "prosemirror-view";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import { createEditorRuntime, type EditorRuntime } from "./editor-runtime";
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
let runtime: EditorRuntime;
let dom: JSDOM;
afterEach(() => {
  runtime?.destroy();
  Object.defineProperty(globalThis,"document",{configurable:true,value:originalDocument});
  Object.defineProperty(globalThis,"window",{configurable:true,value:originalWindow});
});
function mount() {
 dom = new JSDOM('<main id="app"></main>',{pretendToBeVisual:true});
 Object.defineProperty(globalThis,"document",{configurable:true,value:dom.window.document});
 Object.defineProperty(globalThis,"window",{configurable:true,value:dom.window});
 runtime=createEditorRuntime(dom.window.document.querySelector<HTMLElement>('#app')!, '\uFEFF前 ![旧](./a.png "题") 后\r\n',()=>{});
 dom.window.document.querySelector<HTMLButtonElement>('.image-edit-button')!.click();
 return dom.window.document.querySelector<HTMLInputElement>('[name=alt]')!;
}
it('keeps draft and focus across descriptor refresh, and commits one reversible source edit',()=>{
 const alt=mount(); alt.value='新描述'; alt.focus();
 runtime.applyImageDescriptors([{href:'./a.png',status:'missing'}]);
 expect(dom.window.document.querySelector('[name=alt]')).toBe(alt);
 expect(dom.window.document.activeElement).toBe(alt);
 expect(alt.value).toBe('新描述');
 alt.form!.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
 expect(runtime.getText()).toBe('\uFEFF前 ![新描述](./a.png "题") 后\r\n');
 expect(runtime.undo()).toBe(true);
 expect(runtime.getText()).toBe('\uFEFF前 ![旧](./a.png "题") 后\r\n');
 expect(runtime.redo()).toBe(true);
 expect(runtime.getText()).toBe('\uFEFF前 ![新描述](./a.png "题") 后\r\n');
});
it('cancels without source/history changes and rejects detached and destroyed handlers',()=>{
 const alt=mount(); const form=alt.form!; alt.value='迟到';
 const before={text:runtime.getText(),status:runtime.status,selection:runtime.directedSelection};
 dom.window.document.querySelector<HTMLButtonElement>('.image-attributes-cancel')!.click();
 expect(runtime.getText()).toBe(before.text);
 expect(runtime.status).toEqual(before.status);
 expect(runtime.directedSelection).toEqual(before.selection);
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
 expect(runtime.getText()).toBe(before.text);
 dom.window.document.querySelector<HTMLButtonElement>('.image-edit-button')!.click();
 const current=dom.window.document.querySelector<HTMLInputElement>('[name=alt]')!;
 current.value='销毁'; const currentForm=current.form!;
 runtime.destroy();
 currentForm.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
 expect(runtime.getText()).toBe(before.text);
});
it('preserves a composing draft, ignores apply/cancel/Esc, and resumes after composition end',async()=>{
 const alt=mount(); const raw=runtime.getText();
 alt.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true,data:'pin'}));
 alt.value='拼音'; alt.focus();
 runtime.applyImageDescriptors([{href:'./a.png',status:'denied'}]);
 expect(dom.window.document.activeElement).toBe(alt);
 expect(dom.window.document.querySelector('[name=alt]')).toBe(alt);
 alt.form!.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
 dom.window.document.querySelector<HTMLButtonElement>('.image-attributes-cancel')!.click();
 const escape=new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});
 alt.dispatchEvent(escape);
 expect(escape.defaultPrevented).toBe(false);
 expect(alt.isConnected).toBe(true);
 expect(alt.value).toBe('拼音');
 expect(runtime.getText()).toBe(raw);
 expect(runtime.composing).toBe(true);
 alt.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true,data:'拼音'}));
 await new Promise(resolve=>setTimeout(resolve,100));
 expect(runtime.composing).toBe(false);
 expect(runtime.status.saveEligible).toBe(true);
 alt.form!.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
 expect(runtime.getText()).toContain('![拼音]');
});

it('offers image tools from the adjacent caret with Option+F10 and Escape returns to editing',()=>{
 mount();
 dom.window.document.querySelector<HTMLButtonElement>('.image-attributes-cancel')!.click();
 const raw=runtime.getText();
 expect(runtime.navigateRawRange(raw,{anchor:3,head:3}).ok).toBe(true);
 runtime.focus();
 const event=new dom.window.KeyboardEvent('keydown',{key:'F10',altKey:true,bubbles:true,cancelable:true});
 dom.window.document.querySelector('#editor')!.dispatchEvent(event);
 expect(event.defaultPrevented).toBe(true);
 expect((dom.window.document.activeElement as HTMLElement).className).toBe('image-edit-button');
 dom.window.document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 expect((dom.window.document.activeElement as HTMLElement).id).toBe('editor');
});
it('rejects an old form after source mode recreates the same accepted document',()=>{
 const alt=mount(); const form=alt.form!; alt.value='旧epoch'; const raw=runtime.getText();
 expect(runtime.enterSourceMode()).toBe(true);
 expect(runtime.cancelSourceDraft()).toBe(true);
 form.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
 expect(runtime.getText()).toBe(raw);
 expect(runtime.status.canUndo).toBe(false);
});

it('rejects a draft when its node changes even if the old form is invoked',()=>{
 mount();
 const apply=vi.fn(()=>({ok:true}));
 const image=inkoraSchema.nodes.image.create({href:'./a.png',alt:'旧'});
 const nodeView=createImageNodeViews(new ImageResourceRegistry(),undefined,apply)(image, undefined as unknown as EditorView,()=>1,[],{} as never);
 dom.window.document.body.append(nodeView.dom);
 (nodeView.dom as HTMLElement).querySelector<HTMLButtonElement>('.image-edit-button')!.click();
 const form=(nodeView.dom as HTMLElement).querySelector<HTMLFormElement>('form')!;
 form.querySelector<HTMLInputElement>('[name=alt]')!.value='旧意图';
 expect(nodeView.update!(inkoraSchema.nodes.image.create({href:'./b.png',alt:'新'}),[],{} as never)).toBe(true);
 form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 expect(apply).not.toHaveBeenCalled();
 nodeView.destroy!();
});
