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
