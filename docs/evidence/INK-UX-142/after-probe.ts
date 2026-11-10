import "../../src/style.css";
import "../../src/writing-surface.css";
import "../../src/code-highlighting.css";
import { createEditorRuntime } from '../../src/editor-runtime';
const host = document.querySelector<HTMLElement>('#app')!;
const raw = '前 ![旧](./a.png "旧题") 后\n\n```js\nx\n```\n';
const runtime = createEditorRuntime(host, raw, () => {});
const w = window as any;
w.runtime = runtime;
w.ready = (url: string) => runtime.applyImageDescriptors([{href:'./a.png',status:'ready',displayURL:url}]);
w.probe = (composing = true) => {
 const edit = document.querySelector<HTMLButtonElement>('.image-edit-button')!; edit.click();
 const alt = document.querySelector<HTMLInputElement>('[name=alt]')!;
 alt.value='未确认拼音'; if (composing) alt.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'pin'}));
 const oldForm = alt.form!;
 runtime.applyImageDescriptors([{href:'./a.png',status:'ready',displayURL:w.assetURL,message:'refresh'}]);
 const afterRefresh = {detached:!alt.isConnected, value:document.querySelector<HTMLInputElement>('[name=alt]')!.value, focusLost:document.activeElement!==alt};
 oldForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 return {afterRefresh, rawAfterDetachedSubmit:runtime.getText(), status:runtime.status};
};
w.geometry = () => { const img=document.querySelector<HTMLImageElement>('.image-node img')!;const b=document.querySelector<HTMLButtonElement>('.image-edit-button')!;return {complete:img.complete,width:img.naturalWidth,height:img.naturalHeight,image:img.getBoundingClientRect().toJSON(),button:b.getBoundingClientRect().toJSON(),tabIndex:b.tabIndex,text:b.textContent}; };

w.afterGeometry=()=> {
 const image=document.querySelector<HTMLImageElement>('.image-node img')!;
 const block=document.querySelector<HTMLElement>('.inkora-code-block')!;
 const before={image:image.getBoundingClientRect().toJSON(),next:block.getBoundingClientRect().y,visibility:getComputedStyle(document.querySelector('.image-controls')!).visibility};
 const result=runtime.navigateRawRange(runtime.getText(),{anchor:2,head:2});
 runtime.focus();
 const e=new KeyboardEvent('keydown',{key:'F10',altKey:true,bubbles:true,cancelable:true});document.querySelector('#editor')!.dispatchEvent(e);
 const focused=document.activeElement?.className;
 const button=document.querySelector<HTMLButtonElement>('.image-edit-button')!;button.click();
 const form=document.querySelector<HTMLFormElement>('.image-attributes-form')!;
 return {before,result,consumed:e.defaultPrevented,focused,form:form.getBoundingClientRect().toJSON(),afterNext:block.getBoundingClientRect().y,viewport:{w:innerWidth,h:innerHeight}};
};
w.bottomLicense=()=> {
 document.querySelector<HTMLButtonElement>('.image-attributes-cancel')?.click();
 const block=document.querySelector<HTMLElement>('.inkora-code-block')!;
 block.style.marginTop='800px';block.scrollIntoView({block:'end'});
 const before=runtime.getText(); const state=JSON.stringify(runtime.status);
 const trigger=block.querySelector<HTMLButtonElement>('.inkora-code-license')!;trigger.click();
 const panel=block.querySelector<HTMLDialogElement>('dialog')!;
 const rect=panel.getBoundingClientRect().toJSON();const length=panel.querySelector('pre')!.textContent!.length;
 const close=panel.querySelector<HTMLButtonElement>('button')!;const closeRect=close.getBoundingClientRect().toJSON();
 panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 return {rect,closeRect,length,closed:!panel.open,returned:document.activeElement===trigger,unchanged:before===runtime.getText()&&state===JSON.stringify(runtime.status)};
};
w.lateSelection=()=>{
 document.querySelector<HTMLButtonElement>('.image-attributes-cancel')?.click();
 document.querySelector<HTMLButtonElement>('.image-edit-button')!.click();
 const alt=document.querySelector<HTMLInputElement>('[name=alt]')!;alt.value='旧选区意图';const form=alt.form!;
 const raw=runtime.getText();const before=JSON.stringify(runtime.status);
 const result=runtime.navigateRawRange(raw,{anchor:0,head:0});
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 return {result,unchanged:raw===runtime.getText()&&before===JSON.stringify(runtime.status)};
};
